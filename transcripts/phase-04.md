# Phase 4 — Collection/Bookmark CRUD resource endpoints

**Date:** 2026-07-26
**Agent:** Claude Code (Sonnet 5)
**Repo:** https://github.com/Wrpfix/BBL-FullStack-Test.git

> Note: this is a reconstructed summary of the session, not a raw log
> export. It records what was asked, decided, and done, in order.

## Request

With the auth guard and JIT user provisioning already in place (phase 3),
the user asked for the CRUD resource layer, in Thai, with an explicit list
of endpoints:

- `/collections`: `GET` (list, own only), `GET /:id` (404 not 403 for
  non-owned/nonexistent — explicitly cited as the "must not leak
  existence" rule from the brief), `POST`, `PUT`, `PATCH`, `DELETE`,
  `GET /:id/bookmarks`.
- `/bookmarks`: get one, list (+ filter by `collectionId`), create,
  `PUT`, `PATCH`, delete — same ownership scoping throughout.
- `/me`: current user info from `req.user`.

Non-negotiables restated by the user: every query must filter by
`ownerId` at the query level (never an app-level check bolted on after
fetch), cross-user access is `404` not `403`, and the error response shape
must be unified across the API and documented in `API_DESIGN.md`. The
user also asked, up front, to be told 2–3 concrete things the first pass
got wrong — explicitly refusing a "nothing was wrong" answer without an
actual self-review.

## What was found before writing anything

- `class-validator`/`class-transformer` were **not installed**, even
  though `main.ts` already wires up a global `ValidationPipe` that depends
  on them at runtime. Added both (`npm install class-validator
  class-transformer`) plus `@nestjs/mapped-types` (for `PartialType` on
  the PATCH DTOs).
- `API_DESIGN.md` already had two flagged-but-unresolved discrepancies
  from phase 3: `Collection`/`Bookmark` field lists included
  `description`/`faviconUrl`/`isRead`/`isFavorite`, none of which exist in
  the implemented Prisma schema (`Bookmark.notes` only). Resolving these
  was in scope this phase.

## Implementation

New modules, each `controller` + `service` + `dto/`:

- `backend/src/collections/` — `CollectionsController`/`Service`.
- `backend/src/bookmarks/` — `BookmarksController`/`Service`.
- `backend/src/me/` — `MeController`/`Service`.
- `backend/src/common/` — shared `PaginationQueryDto` and a
  `PaginatedResult<T>` interface, reused by both list endpoints and by
  `GET /collections/:id/bookmarks`.

All wired into `AppModule`.

**Ownership scoping pattern** — every read is `findFirst({ where: { id,
ownerId } })`; every write is `updateMany`/`deleteMany({ where: { id,
ownerId }, ... })` followed (only on `count > 0`) by a plain
`findUniqueOrThrow({ where: { id } })` to return the fresh row. The
`ownerId` is always part of the same Prisma `where`, never a separate
"fetch then compare in JS" step, so an unscoped query is structurally not
possible for these paths. Missing-vs-foreign-id both produce the same
`count === 0` → `NotFoundException` (`404`), never a `403`.

`DELETE /collections/:id` relies on the schema's existing
`Bookmark.collectionId` `onDelete: SetNull` FK to turn contained
bookmarks "Unsorted" automatically — no extra code needed, it was already
correct from the phase-3 schema.

`GET /collections/:id/bookmarks` calls the same ownership-checked
`findOne` first (so a foreign collection id 404s, matching
`GET /collections/:id`, rather than silently returning an empty list),
then lists bookmarks scoped by both `ownerId` and `collectionId`.

**Bookmark `collectionId` is a second ownership boundary.** Unlike the
path `:id`, a bookmark's `collectionId` arrives in the request body when
creating/updating a bookmark, referencing a *different* resource
(Collection). A private `assertCollectionOwnership()` in
`BookmarksService` checks it against the caller's own collections; a
foreign id and a nonexistent id both produce the identical
`400 Bad Request` ("Invalid collectionId") — deliberately not a
403/404, and deliberately not distinguishable from each other, so an
attacker can't use bookmark creation as an oracle to learn whether some
other user's collection id exists. `collectionId: null` is accepted
and means "unset, move to Unsorted."

## Mistakes caught during self-review (explicitly requested by the user)

1. **PUT wasn't actually a full replace.** The first pass had
   `replace()` (PUT) forward straight into the same internal `update()`
   helper as `patch()`, which only touches fields present in the request
   body. That means `PUT /bookmarks/:id` omitting `notes`/`collectionId`
   would have silently *kept* the old values — PATCH semantics leaking
   into PUT. Fixed in `bookmarks.service.ts` so `replace()` explicitly
   defaults omitted `notes`/`collectionId` to `null`; a regression test
   (`replace (PUT) clears notes/collectionId when the client omits
   them, unlike patch`) locks the distinction in.
2. **`class-validator`/`class-transformer` missing entirely.** Would not
   have surfaced as a compile error (the `ValidationPipe` call itself
   type-checks fine) — only as a runtime failure the first time a
   request hit an endpoint. Caught by checking `node_modules` directly
   rather than assuming an existing import implied the package was
   installed.
3. **Coercion-order bug with `null` collectionId.** `@Type(() =>
   Number)` transforms before validation runs, so putting it on a body
   DTO's `collectionId` (to mirror the query-string DTOs, which *do*
   need it since query values arrive as strings) would have silently
   turned `collectionId: null` (meaning "unset") into `Number(null) ===
   0` (meaning "collection #0"). Caught before committing by reasoning
   through the transform order, not by a failing test — body DTOs get
   no `@Type()` coercion (JSON already provides the right type), only
   `ListBookmarksQueryDto`/`PaginationQueryDto` do.

## Tests

- `collections.service.spec.ts` and `bookmarks.service.spec.ts`, in the
  same plain-mocked-`PrismaService` style as the existing
  `jwt.strategy.spec.ts` (no Nest testing-module bootstrap) — assert the
  exact `where` clause on every read/write (ownerId always present),
  404-not-403 on missing/foreign ids, the collectionId ownership check on
  create/patch, and the PUT-vs-PATCH field-clearing distinction above.
- Full run: 6 suites / 31 tests passing. `npm run build` clean.
- `npm run lint` checked against baseline `main` (via `git stash`) and
  confirmed already failing there before this session touched anything
  (`@typescript-eslint/unbound-method` on existing spec files' mocked
  Prisma methods, plus a `no-floating-promises` warning in `main.ts`) —
  the new spec files repeat the same already-accepted pattern rather than
  introducing a new lint regression. Left alone as out of scope.

## Docs reconciliation

Per `CLAUDE.md`'s rule that `API_DESIGN.md` is updated before/alongside
implementation:

- Both open discrepancies from phase 3 resolved: `description` was never
  added to `Collection`; `description`/`faviconUrl`/`isRead`/`isFavorite`
  were never added to `Bookmark`. The field tables and the endpoint
  tables now match the implemented schema/routes exactly, including
  dropping the previously-documented `PATCH /bookmarks/:id/read` (no
  `isRead` field exists to toggle).
- Added `PUT`/`GET /:id/bookmarks` to the Collection endpoint table,
  `PUT` to the Bookmark endpoint table, and documented the
  `collectionId`-ownership-check behavior (400, not 404, and why).
- Added a `User` → `/me` endpoints section (previously "not exposed
  through any endpoint in this phase").
- Expanded the "Errors" convention bullet to state explicitly that every
  thrown exception across every new endpoint produces the same Nest
  exception shape — no custom per-endpoint error format was introduced.
- Updated the top-of-file phase note, which still said "scaffold + docs
  only, nothing implemented" from phase 1.

## Commits

Not yet committed — all changes are currently uncommitted working-tree
changes (new `backend/src/{collections,bookmarks,me,common}/`,
modified `backend/src/app.module.ts`, `backend/package.json`,
`package-lock.json`, `API_DESIGN.md`). Per `CLAUDE.md` rule 4, splitting
into small logical commits (schema-adjacent docs fix, collections
module, bookmarks module, me module, docs reconciliation) is the next
step before this phase is considered closed.

## Open items carried into the next phase

- Commit the above in small, individually-meaningful chunks (not yet
  done this session).
- `npm run lint` failures pre-date this phase and remain unfixed
  (tracked, not silently ignored).
- Still-outstanding from earlier phases: replace the JIT-created user's
  placeholder email with a real profile-sync step; confirm in the Auth0
  dashboard that the API issues signed RS256 access tokens, not opaque
  ones.
- Frontend still has placeholder Bookmarks/Collections pages — wiring
  them to these new endpoints is out of scope for this phase.
