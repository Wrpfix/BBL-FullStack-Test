# BBL-FullStack-Test — Personal Bookmark Manager

A private "read later" bookmark manager. Each user's bookmarks and
collections are visible only to them — see [CLAUDE.md](CLAUDE.md) for the
full privacy requirement.

> **Status (2026-07-26):** Auth (Auth0 OIDC), User (`/me`), Collection CRUD
>
> - read-only sharing, and Bookmark CRUD are implemented end-to-end
>   (backend + frontend), with unit tests and a real-database e2e privacy/auth
>   suite. See [API_DESIGN.md](API_DESIGN.md) for the exact endpoint contracts
>   and [DECISIONS.md](DECISIONS.md) for the reasoning trail. "What's done /
>   what's skipped" below has the honest summary.

## Stack

- **Backend:** NestJS + TypeScript + Prisma + MySQL
- **Auth:** Auth0 (OIDC)
- **Frontend:** React + Vite + TypeScript + MUI + React Router v8
- **Monorepo:** npm workspaces

## Structure

```
/backend        NestJS API (Prisma/MySQL)
/frontend       React + Vite + MUI SPA
/.agent/        custom commands/subagents/hooks for coding agents
/transcripts/   AI-assisted session logs
CLAUDE.md       agent rules — read this first
API_DESIGN.md   API/resource design (source of truth for endpoints)
DECISIONS.md    architecture decision log
AI_WORKFLOW.md  how AI agents should work in this repo
```

## Getting started

```bash
npm install
```

Copy the env templates and fill in real values:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

`backend/.env` needs `DATABASE_URL`, `PORT` (defaults to `3001`),
`AUTH0_DOMAIN`, `AUTH0_AUDIENCE`. `frontend/.env` needs
`VITE_API_BASE_URL`, `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`,
`VITE_AUTH0_AUDIENCE`, `VITE_AUTH0_CALLBACK_URL` — see the `.env.example`
files for real (non-secret) sample values already used against the dev
Auth0 tenant. `VITE_AUTH0_CLIENT_ID` is a public SPA client id, not a
secret — see the comment in `frontend/.env.example`.

### Backend needs a MySQL database

Point `DATABASE_URL` in `backend/.env` at a running MySQL instance —
locally, e.g.:

```bash
docker run -d --name bbl-mysql -p 3306:3306 \
  -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=bookmarks mysql:8
```

Then apply migrations (`npm run --workspace backend prisma ...` does **not**
work — there's no `prisma` script in `backend/package.json`, so `npm run`
would just error with `Missing script: "prisma"`; use `npm exec` instead,
which runs the `prisma` CLI itself inside the `backend` workspace):

```bash
npm exec --workspace backend -- prisma migrate dev
```

### Run the dev servers (separate terminals)

```bash
npm run dev:backend
```

```bash
npm run dev:frontend
```

Backend defaults to `http://localhost:3001`, frontend runs on
`http://localhost:3000` (pinned, not Vite's default 5173) — the Auth0
Application's registered callback URL is `http://localhost:3000/callback`,
so the frontend owns port 3000 and the backend moved to 3001.

### Tests

Unit tests (no external services needed):

```bash
npm run test:backend
```

Backend e2e tests, including the `privacy-and-auth` suite that exercises
cross-user isolation, auth guards, and pagination against a **real**
database (not mocks) — needs its own disposable MySQL instance and applied
migrations first:

```bash
docker run -d --name bbl-mysql-test -p 3308:3306 \
  -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=bookmarks_test mysql:8.0
DATABASE_URL="mysql://root:root@localhost:3308/bookmarks_test" \
  npm exec --workspace backend -- prisma migrate deploy
DATABASE_URL="mysql://root:root@localhost:3308/bookmarks_test" \
  npm run --workspace backend test:e2e
```

Frontend: no automated tests exist yet (build/lint only — see "What's
skipped" below).

```bash
npm run lint:backend
npm run lint:frontend
```

Run the privacy/ownership audit described in
[CLAUDE.md](CLAUDE.md#agent-capabilities) before committing any change that
touches a controller or service — invoke it as `/security-review` in
Claude Code.

## What's done / what's skipped and why

**Done:**

- Auth0 OIDC end-to-end: backend validates access tokens via JWKS
  (`passport-jwt` + `jwks-rsa`); frontend does Authorization Code + PKCE.
- `User` (`/me`, JIT-provisioned), `Collection` (CRUD + read-only public
  sharing via `shareToken`), `Bookmark` (CRUD, `collectionId` filter)
  — see [API_DESIGN.md](API_DESIGN.md) for the full contract.
- The three CLAUDE.md privacy invariants (auth guard on every route,
  `ownerId` scoping on every query, 404-not-403 for cross-user access) are
  enforced in code and covered by both unit tests and a real-MySQL e2e
  suite (77/77 passing as of 2026-07-26) — see API_DESIGN.md's
  "Where the privacy invariant is actually enforced" section for exact
  file references.
- A repeatable static check (`/security-review`) for the same three
  invariants, so a later PR can't silently regress them.

**Skipped (deliberately, not forgotten):**

- **Frontend automated tests.** Phase 5 verified the UI by hand against a
  real backend + MySQL container; no unit/component/e2e test suite exists
  for the frontend yet.
- **Collection `description` field, Bookmark `faviconUrl`/`isRead`/
  `isFavorite`, and the `PATCH /bookmarks/:id/read` endpoint** — these
  appeared in an earlier draft of `API_DESIGN.md` but were dropped rather
  than implemented; the doc was reconciled to match on 2026-07-26 (see
  API_DESIGN.md's "Discrepancy resolved" notes).
- **Account deletion endpoint.** The schema has cascade-delete wired up for
  when a `User` row is deleted (see API_DESIGN.md's on-delete table), but
  there's no API surface for a user to trigger it themselves yet.
- **Bookmark tags/labels and server-side page-metadata fetching** — both
  listed as open questions at the bottom of API_DESIGN.md, not yet decided.
- **Confirming RS256 (signed JWT) vs. opaque access tokens** in the Auth0
  dashboard for the `https://bbl-candidate-test-api` API — not visible from
  `.well-known` endpoints; flagged as an outstanding item in
  [DECISIONS.md](DECISIONS.md) #9.

## Contributing / working with an AI agent

Read [CLAUDE.md](CLAUDE.md) and [AI_WORKFLOW.md](AI_WORKFLOW.md) first —
they define non-negotiable rules (auth guards, per-user data scoping,
test-before-commit, no squash commits) that apply to human and AI
contributors alike.
