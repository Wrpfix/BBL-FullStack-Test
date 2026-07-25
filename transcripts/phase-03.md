# Phase 3 — Prisma schema, seed data, and JIT user provisioning

**Date:** 2026-07-26
**Agent:** Claude Code (Sonnet 5)
**Repo:** https://github.com/Wrpfix/BBL-FullStack-Test.git

> Note: this is a reconstructed summary of the session, not a raw log
> export. It records what was asked, decided, and done, in order.

## Request

Referencing the bearer-token decision already recorded in
`API_DESIGN.md` (decision 9 — access token, not ID token), the user asked
for four things, explicitly scoped to schema + auth foundation only (no
CRUD resource endpoints this phase):

1. A Prisma schema (MySQL) for `User`, `Collection`, `Bookmark`, with an
   exact field list given inline — notably **`Int` autoincrement ids**
   for all three models, rather than the cuid strings `API_DESIGN.md` had
   previously documented.
2. A seed script creating at least two users (distinct `auth0Sub`s) with
   clearly separated collections/bookmarks, for later cross-user-leak
   testing.
3. A NestJS auth guard that validates the JWT (signature via the real
   tenant's JWKS, issuer, audience, expiry), maps the token's `sub` to an
   internal `User` record — **auto-create or reject, with the agent's
   choice and reasoning** — and attaches `req.user`.
4. Unit tests for the guard covering: valid token, expired, bad signature,
   wrong audience, no token — all of which must reject except the valid
   case.

## What was found before writing anything

The auth guard/strategy from phase 2
(`backend/src/auth/jwt.strategy.ts`, `jwt-auth.guard.ts`,
`current-user.decorator.ts`, `public.decorator.ts`) already verified
signature/issuer/audience/expiry via `passport-jwt` + `jwks-rsa` and
guarded every route by default via `APP_GUARD`. What was missing was the
`sub` → internal `User` mapping (`validate()` just returned
`{ id: payload.sub }`) and the schema/seed data itself
(`schema.prisma` had no models yet, per phase 1's scaffold-first rule).

## Schema

Added `User` / `Collection` / `Bookmark` to `backend/prisma/schema.prisma`
exactly per the given field list — `Int @id @default(autoincrement())`
throughout, `Collection.ownerId`/`Bookmark.ownerId` as FKs to `User.id`
(cascade delete), `Bookmark.collectionId` nullable FK to `Collection`
(`onDelete: SetNull`, matching the "Unsorted" behavior already documented
in `API_DESIGN.md`).

This is a deviation from what `API_DESIGN.md` had on file (cuid string
ids, `ownerId` = raw Auth0 `sub`) — flagged and reconciled in the docs
pass below rather than silently overwritten.

## Seed script

`backend/prisma/seed.ts` creates `alice`/`bob` (`auth0|seed-alice`,
`auth0|seed-bob`), each with one collection and two bookmarks (one filed,
one "Unsorted"), deliberately disjoint so a future integration test can
assert Alice's token never returns Bob's data. Wired up via
`package.json`'s `prisma.seed` (`ts-node`, forced to CommonJS module
output since the project's own `tsconfig.json` targets `nodenext`).

## Auth guard: JIT provisioning decision

`JwtStrategy.validate()` now does:

```ts
const user = await this.prisma.user.upsert({
  where: { auth0Sub: payload.sub },
  update: {},
  create: {
    auth0Sub: payload.sub,
    email: `${payload.sub.replace(/\|/g, '_')}@placeholder.invalid`,
  },
});
return { id: user.id, auth0Sub: user.auth0Sub };
```

**Decision: auto-create (just-in-time provisioning), not reject unknown
users.** Reasoning given to the user: by the time `validate()` runs,
`passport-jwt` has already verified signature, issuer, audience, and
expiry — the token is already a trustworthy identity assertion from
Auth0. A separate "register before first use" step would add a round
trip without checking anything the token verification hasn't already
checked, since Auth0 (not this backend) is the source of truth for
account existence.

**Known gap, stated rather than hidden:** access tokens (decision 9)
don't carry an `email` claim, so JIT-created users get a placeholder
email to satisfy the schema's `unique` constraint, pending a future
profile-sync step (e.g. a call to Auth0's `/userinfo`). Recorded as an
open item in both `API_DESIGN.md` (User resource section) and
`DECISIONS.md` (decision 10).

`AuthenticatedUser` (`current-user.decorator.ts`) changed shape from
`{ id: string }` (the raw sub) to `{ id: number; auth0Sub: string }` (the
internal id, which is what controllers will actually use as `ownerId`).

## Tests

- Updated `jwt.strategy.spec.ts` for the new async, Prisma-backed
  `validate()`: new sub creates+maps a user; a returning sub reuses the
  same row (upsert, not a duplicate).
- Added `jwt-verification.spec.ts` to cover the five reject/accept cases
  the user asked for, against the **real** `passport-jwt`/`jsonwebtoken`
  verification path rather than a mock of it: a local RSA keypair is
  generated at test time, the strategy's `_secretOrKeyProvider` is
  swapped to return the local public key (so no live JWKS call happens),
  and tokens are signed locally with the matching (or deliberately
  mismatched) private key. Covers: valid token, expired, wrong signature,
  wrong audience, wrong issuer (bonus, not explicitly asked for but cheap
  given the same harness), and no token at all — all five "should reject"
  cases reject.
- Full run: 4 suites / 12 tests passing. `npm run build` clean.
- `npm run lint` was checked against baseline `main` (via `git stash`) and
  found already failing there (`@typescript-eslint/no-unsafe-*` on
  pre-existing `any`-typed Express `req.user`/test mocks) — not something
  this session introduced, so left alone rather than scope-creeping into
  an unrelated lint cleanup.

## Docs reconciliation

Per `CLAUDE.md`'s rule that `API_DESIGN.md` is the API source of truth
and must be updated before/alongside implementation:

- `Collection`/`Bookmark` `id`/`ownerId` types updated from
  string/cuid/raw-sub to number/autoincrement/internal-FK.
- Added a `User` resource section describing the JIT-provisioning
  behavior and the placeholder-email caveat.
- Added `DECISIONS.md` #10 documenting both sub-decisions (autoincrement
  ids; auto-create over reject) with the reasoning above.
- **Explicitly flagged, not resolved:** the field set actually
  implemented (`Bookmark.notes` only) is narrower than what
  `API_DESIGN.md` had already documented for Bookmark/Collection
  (`description`, `faviconUrl`, `isRead`, `isFavorite` are missing from
  the new schema). Marked inline in the doc as an open discrepancy to
  reconcile before the CRUD phase, since resolving it wasn't part of this
  session's brief and guessing either direction would be presumptuous.

## Commits

Split into six small commits per `CLAUDE.md` rule 4 (no squash, one
logical change per commit):

1. `feat(db): add User/Collection/Bookmark Prisma models`
2. `feat(db): add seed script with two isolated users`
3. `feat(auth): map verified token sub to an internal User via JIT provisioning`
4. `test(auth): cover JIT user provisioning in JwtStrategy`
5. `test(auth): exercise real JWT verification for all reject cases`
6. `docs: reconcile API_DESIGN/DECISIONS with the implemented schema`

## Open items carried into the next phase

- Reconcile the Bookmark/Collection field-set discrepancy noted above.
- Replace the placeholder email on JIT-created users with a real
  profile-sync step.
- Still-outstanding from phase 2: confirm in the Auth0 dashboard that the
  `https://bbl-candidate-test-api` API actually issues signed RS256
  access tokens (not opaque ones).
- CRUD resource endpoints for Collection/Bookmark — explicitly deferred
  again this phase.
