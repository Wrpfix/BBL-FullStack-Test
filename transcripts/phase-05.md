# Phase 5 — Frontend: Auth0 PKCE login, Collections/Bookmarks UI

**Date:** 2026-07-26
**Agent:** Claude Code (Sonnet 5)
**Repo:** https://github.com/Wrpfix/BBL-FullStack-Test.git

> Note: this is a reconstructed summary of the session, not a raw log
> export. It records what was asked, decided, and done, in order.

## Request

With the backend's Collection/Bookmark/sharing endpoints already built out
(phase 4), the user asked (in Thai) for the frontend, against an explicit
spec:

- React + Vite + TypeScript, not Next.js; React Router v8+; MUI v9+.
- Connect to the backend via an env-configured base URL.
- Auth0 Authorization Code + PKCE (S256) against a given tenant
  (`dev-yg.us.auth0.com`, client id `H9F6QG5SzTKMv0tbmgxLj9LjG1EKVllA`,
  callback `http://localhost:3000/callback`) — explicit requirement to
  confirm PKCE is actually used, not implicit flow, and to say plainly if
  anything was mocked.
- Pages: `/collections` (list/view/create/delete), `/bookmarks`
  (list/view/create/delete/filter by collection).
- Global layout showing the logged-in user (from `/me`) + logout.
- Basic loading/error state on every page.
- No hardcoded tokens/secrets.

A second request in the same session: start the backend for real and
drive the full login flow in a browser, not just build/lint it.

## Implementation

- **Auth (`frontend/src/auth/`)**: `Auth0ProviderWithNavigate.tsx` wraps
  `@auth0/auth0-react` (v2.22, on `auth0-spa-js` v2.24), configured with
  `audience`, `scope: 'openid profile email'`, `useRefreshTokens`, and
  `cacheLocation="memory"` (tokens never touch `localStorage` — an
  XSS-hardening trade-off, at the cost of the session not surviving a hard
  page reload; discovered live during testing, see below).
  `RequireAuth.tsx` guards every route via `loginWithRedirect`;
  `CallbackPage.tsx` is the transient landing spot for the
  `code`+`state` redirect back.
- **API layer (`frontend/src/api/`)**: `useApi.ts` is a hook that calls
  `getAccessTokenSilently()` per request and attaches it as
  `Authorization: Bearer <token>`; `types.ts` mirrors `API_DESIGN.md`
  exactly (`Me`, `Collection`, `Bookmark`, `Paginated<T>`); `ApiError.ts`
  wraps the backend's unified Nest exception shape.
- **Pages (`frontend/src/pages/`)**: `CollectionsPage` (list, inline
  create form, delete, link to detail) and `CollectionDetailPage`
  (collection + its scoped bookmarks via `GET /collections/:id/bookmarks`);
  `BookmarksPage` (list, create form incl. optional collection picker,
  delete, filter-by-collection via a `?collectionId=` search param so it's
  linkable) and `BookmarkDetailPage` (single bookmark + link back to its
  collection). `AsyncState.tsx` is a shared loading-spinner/error-alert
  shell reused by every page rather than each page rolling its own.
- **Layout**: `AppLayout.tsx` now calls `useMe()` and renders an avatar
  (email initial) + tooltip with the full email, plus a logout
  `IconButton` (`logout({ logoutParams: { returnTo: window.location.origin } })`).
- **Router**: `/callback` sits outside the auth guard; everything else is
  nested under `RequireAuth` → `AppLayout`, with `/` redirecting to
  `/bookmarks`.
- **Config**: `frontend/src/config.ts` reads `VITE_*` env vars and throws
  if any are missing, rather than silently proceeding with `undefined`.

### Port collision found and resolved

The given callback URL (`http://localhost:3000/callback`) fixes the
frontend's dev port at 3000 — but the backend's existing default
(`backend/.env.example`, `PORT=3000`) collided with it. Resolved by moving
the backend's documented default to 3001 and pinning Vite to 3000
(`server: { port: 3000, strictPort: true }` in `vite.config.ts`) rather
than leaving it on Vite's default 5173. Updated `backend/.env.example`,
`frontend/.env.example`, and `README.md` to match and explain why.
`frontend/.env.example`/`.env` also gained the Auth0 config (`domain`,
`clientId`, `audience`, `callbackUrl`) alongside the pre-existing
`VITE_API_BASE_URL` — the SPA client id isn't a secret (it ships in the
bundle regardless of where it's sourced from), so putting it in an env var
is about per-environment config, not secrecy.

## PKCE verification

Confirmed **not mocked**, in two ways:

1. **Structural**: `@auth0/auth0-react`/`auth0-spa-js` for a SPA client
   only ever performs the authorization_code grant with a generated
   `code_verifier`/`code_challenge` (S256) pair — there is no
   implicit-flow code path in the library to accidentally fall into.
2. **Live**: with `RequireAuth` unauthenticated, the app redirected to
   Auth0's real Universal Login (`https://dev-yg.us.auth0.com`, page
   titled "Log in | BBL Bookmarks (Full-Stack)") — Auth0 would have shown
   an "invalid redirect_uri"/"invalid client" error instead if the
   `/authorize` call (carrying the PKCE challenge) had been malformed or
   the callback URL unregistered.

## Full login flow — actually run, not just built

Given the second request, the environment was brought up for real rather
than left as an unverified build:

- No local MySQL and Docker's engine was off. Asked the user how to get a
  database rather than guessing (local MySQL vs. spin up a container);
  user chose Docker. Started Docker Desktop, then a `mysql:8` container
  (`bbl-mysql`). Host port 3306 was already occupied by something else,
  so the container was mapped to 3307 instead and `backend/.env` (not
  committed — matches the existing `.env.example`-only convention) was
  pointed at `mysql://root:...@localhost:3307/bookmarks`.
- `npx prisma migrate dev --name init` — first migration this repo has
  had (previous phases only ever pushed schema changes without a
  committed `prisma/migrations/`); applied cleanly, client regenerated.
- Backend started (`npm run start:dev`), confirmed `GET /api/health` →
  `{"status":"ok"}` before going further.
- Frontend started via the browser preview tool (added
  `.claude/launch.json` since none existed) and driven through the actual
  flow:
  - Unauthenticated → redirected to Auth0 Universal Login. The user
    logged in themselves (I don't enter credentials).
  - Landed back on `/bookmarks` authenticated; network log confirmed
    `/api/me`, `/api/collections`, `/api/bookmarks` all `200`, no console
    errors.
  - Clicked into a collection (`Social`) → detail page showed its scoped
    bookmark (`Facebook`) via `/api/collections/:id/bookmarks`.
  - Clicked into that bookmark → detail page rendered correctly with a
    working "View collection" link back.
- **Found live, not anticipated up front**: a hard page reload / direct
  URL navigation drops the session and forces Auth0 to show an
  "Authorize App" consent screen again, because `cacheLocation="memory"`
  means nothing persists across a full page reload (only client-side
  route changes keep the token in memory). Treated as a real trade-off,
  not a bug — flagged to the user rather than silently living with it or
  silently switching `cacheLocation` to `localStorage` without asking.
  Granting that OAuth consent screen was confirmed with the user first
  (falls under "granting OAuth/SSO permissions" requiring explicit
  permission) before clicking Accept.

## Build/lint verification

- `npm run build` (`tsc -b && vite build`) — clean, no type errors.
- `npm run lint` (`oxlint`) — one pre-existing-style warning
  (`react-hooks/exhaustive-deps` on `useAsync.ts`'s generic dependency
  array, which is intentionally dynamic/passed-through), no errors.

## Commits

Not yet committed — all changes are currently uncommitted working-tree
changes (new `frontend/src/{api,auth,components,hooks}/`, new/modified
pages, `frontend/src/config.ts`, `frontend/src/vite-env.d.ts`,
`frontend/vite.config.ts`, `frontend/.env.example`,
`backend/.env.example`, `README.md`, plus the first-ever
`backend/prisma/migrations/` folder and `.claude/launch.json`). Per
`CLAUDE.md` rule 4, splitting into small logical commits (port/env
config, Auth0 wiring, API client, Collections pages, Bookmarks pages,
layout, Prisma migration) is the next step before this phase is
considered closed.

## Open items carried into the next phase

- Commit the above in small, individually-meaningful chunks (not yet
  done this session).
- No automated frontend tests were written this phase — `CLAUDE.md` rule
  3 ("if there's no test for what you changed and it's non-trivial, write
  one") is an open gap; the verification done here was build/lint +
  live manual browser testing, not an automated test suite.
- `cacheLocation="memory"` vs `localStorage` trade-off is a live decision
  point, not fully closed — currently memory-only (session doesn't survive
  a hard reload); revisit if that UX cost turns out to matter more than
  the XSS-surface benefit.
- Still-outstanding from earlier phases (unchanged): replace the
  JIT-created user's placeholder email with a real profile-sync step;
  confirm in the Auth0 dashboard that the API issues signed RS256 access
  tokens, not opaque ones.
- No UI yet for the read-only collection-sharing endpoints from the phase
  4 addendum (`POST`/`DELETE /collections/:id/share`,
  `GET /shared/:token`) — out of scope for this phase.
