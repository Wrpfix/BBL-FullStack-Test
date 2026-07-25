# Decisions

Lightweight architecture decision log. Add an entry whenever a choice isn't
obvious from the code and future-us (or an agent with no memory of this
conversation) would otherwise have to re-derive the reasoning.

---

## 1. Monorepo with npm workspaces

**Context:** Backend and frontend are small, personal-scale, and always
deployed/versioned together.

**Decision:** Single repo, npm workspaces (`/backend`, `/frontend`), no
Turborepo/Nx. Root `package.json` only holds workspace scripts.

**Consequences:** One `npm install` at the root installs both apps. No
build-caching/pipeline tooling — acceptable at this scale; revisit if the
number of packages grows.

## 2. NestJS + Prisma + MySQL for the backend

**Decision:** NestJS (TypeScript, modular DI) with Prisma as the ORM,
targeting MySQL.

**Consequences:** Prisma migrations are the schema source of truth. No ORM
models exist yet in `backend/prisma/schema.prisma` — they're added once
[API_DESIGN.md](API_DESIGN.md)'s Collection/Bookmark design is implemented
(see decision 7).

## 3. Auth0 (OIDC) instead of hand-rolled auth

**Context:** This is a private, personal app, but "personal" still means
real user data behind real auth — no shortcuts.

**Decision:** Auth0 as the identity provider, OIDC flow. The backend
validates bearer tokens against Auth0's JWKS rather than issuing/verifying
its own JWTs.

**Consequences:** No password storage, no custom login/session code to
maintain. The Auth0 `sub` claim is used directly as `ownerId` on every
resource.

## 4. Ownership via `ownerId` filtering, not per-tenant databases

**Decision:** Single shared MySQL database; every row that belongs to a
user carries an `ownerId` column, and every query is scoped by it at the
Prisma-query level (`where: { ownerId: currentUser.id, ... }`), not just
checked after fetching.

**Consequences:** Simpler ops (one DB), but means an unscoped query is a
real security bug, not just a bug — see the rule in
[CLAUDE.md](CLAUDE.md).

## 5. Cross-user access returns 404, not 403

**Decision:** Requesting another user's resource by ID returns the same
`404 Not Found` as requesting a nonexistent ID.

**Why:** A `403 Forbidden` confirms the resource exists, which itself
leaks information the product promises not to leak ("no other user may
know a bookmark/collection exists"). `404` gives no such signal.

## 6. React + Vite + MUI + React Router v8

**Decision:** Vite for tooling/dev server, MUI for components, React
Router v8's data-router API (`createBrowserRouter` / `RouterProvider`) for
routing.

**Note:** React Router v8 (package `react-router`, not the legacy
`react-router-dom` split) was current at the time this repo was scaffolded
(2026-07). If this file is being read much later, double-check the
installed major version still matches.

## 7. Scaffold-first: no business logic before the design doc

**Decision:** The initial commit(s) contain only project structure,
tooling wiring (Prisma↔MySQL connection, routing shell, MUI theme), and
rules docs — no Collection/Bookmark models, controllers, services, or auth
guards yet.

**Why:** Requested explicitly to keep the first commit(s) reviewable and
to force the API design ([API_DESIGN.md](API_DESIGN.md)) to be written and
agreed before code encodes assumptions about it.

**Consequences:** `backend/prisma/schema.prisma` intentionally has no
models yet; `frontend`'s Bookmarks/Collections pages are placeholders.
Implementing them is the next phase.

## 8. No squash commits

**Decision:** History is kept as many small, meaningful commits rather
than squashed on merge.

**Why:** Preserve the reasoning trail (including AI-assisted changes) for
future debugging/auditing rather than collapsing it into one opaque commit.

## 9. Bearer token = Access token, not ID token

**Context:** Verified live against the tenant (`dev-yg.us.auth0.com`) before
deciding — see "Auth0 tenant capabilities (verified)" in
[API_DESIGN.md](API_DESIGN.md). Both options were compatible with what the
tenant actually supports (authorization code + PKCE, RS256 JWKS); this was
a design choice, not something the discovery doc forced.

**Decision:** The backend validates an Auth0 **access token** requested
with `audience=https://bbl-candidate-test-api`, not the ID token.

**Why:** An access token's `aud` claim is the API identifier itself, so
validation is a plain `aud`/`iss`/signature check with no special-casing.
It also carries a `scope` claim, leaving room for fine-grained API
permissions later. ID tokens are meant for the client to consume (their
`aud` is the client ID, not the API), and using them to authorize API
calls goes against OIDC/Auth0 guidance.

**Consequences:** The frontend's Auth0 login/token exchange must request
`audience=https://bbl-candidate-test-api` explicitly, or the resulting
access token won't carry the right `aud` and every request will be
rejected. Still unverified: whether the API is configured for RS256
(signed JWT) vs. opaque access tokens in the Auth0 dashboard — confirm
before relying on JWKS-based verification in production.

## 10. Autoincrement `Int` ids, and just-in-time user provisioning

**Context:** [API_DESIGN.md](API_DESIGN.md) originally specified cuid
string ids for Collection/Bookmark, with `ownerId` set directly to the
Auth0 `sub`. Implementing the Prisma schema + auth guard together surfaced
a cleaner alternative and forced a choice on unknown users at auth time.

**Decision (ids):** `User`, `Collection`, and `Bookmark` all use
autoincrement `Int` ids, per explicit instruction for this task. `ownerId`
on Collection/Bookmark is a foreign key to the internal `User.id`, not the
raw Auth0 `sub` string.

**Why:** An internal integer id decouples storage from the identity
provider's string format, and keeps FK joins/indexes cheap. It does mean
resource ids are guessable/sequential — acceptable here because ownership
is still enforced on every query (rule 2 in [CLAUDE.md](CLAUDE.md)) and
cross-user requests return `404` regardless of whether the guessed id
exists (decision 5), so an attacker learns nothing by guessing.

**Decision (unknown `sub`):** The `JwtStrategy` auto-creates
(`upsert`s) a `User` row the first time it sees a valid, fully-verified
token for a `sub` it hasn't seen before ("just-in-time provisioning"),
rather than rejecting unrecognized users.

**Why:** By the time `validate()` runs, `passport-jwt` has already checked
signature, issuer, audience, and expiry — the token is a trustworthy
assertion of identity from Auth0. Requiring a separate
registration/provisioning step before first API use would just be an extra
round trip enforcing nothing additional, since Auth0 (not this backend) is
the source of truth for "is this a real account."

**Consequences:** Access tokens don't carry an `email` claim (decision 9),
so JIT-created users get a placeholder email
(`<sub>@placeholder.invalid`) satisfying the `email` unique constraint
until a real profile-sync step (e.g. calling Auth0's `/userinfo` with the
token, or switching the frontend to also send the ID token for that one
purpose) is built. Tracked as an open item — see
[API_DESIGN.md](API_DESIGN.md)'s User resource section.
