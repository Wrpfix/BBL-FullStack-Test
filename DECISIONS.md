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
