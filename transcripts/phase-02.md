# Phase 2 — Auth0 verification + access-token guard

**Date:** 2026-07-25 → 2026-07-26
**Agent:** Claude Code (Sonnet 5)
**Repo:** https://github.com/Wrpfix/BBL-FullStack-Test.git

> Note: this is a reconstructed summary of the session, not a raw log
> export. It records what was asked, decided, and done, in order.

## Request 1 — verify the Auth0 tenant before designing auth

User asked to verify the real Auth0 tenant *before* deciding anything,
rather than designing auth from training-data assumptions:

- Discovery endpoint: `https://dev-yg.us.auth0.com/.well-known/openid-configuration`
- Client ID: `H9F6QG5SzTKMv0tbmgxLj9LjG1EKVllA`
- API audience: `https://bbl-candidate-test-api`

Explicit ask: fetch the discovery doc and JWKS for real (`curl`/fetch, not
memory), summarize `response_types_supported`, `grant_types_supported`,
`token_endpoint_auth_methods_supported`, signing algs, and
`scopes_supported`; write the verified findings into `API_DESIGN.md` with
sources cited; then lay out the ID-token-vs-access-token trade-off without
deciding for the user.

### What was done

- `curl`'d the discovery document directly — confirmed:
  - `response_types_supported` includes `code` (authorization code flow
    supported), plus PKCE (`code_challenge_methods_supported: S256, plain`).
  - `grant_types_supported`: `authorization_code`, `client_credentials`,
    `refresh_token`, `implicit`, `password`, plus Auth0 extension grants.
  - `token_endpoint_auth_methods_supported`: `client_secret_basic`,
    `client_secret_post`, `private_key_jwt`, `none` (the last being what a
    public SPA + PKCE client uses).
  - `id_token_signing_alg_values_supported`: `HS256`, `RS256`, `PS256`.
  - `scopes_supported`: standard OIDC profile scopes only — no custom API
    scopes exposed at this endpoint (those live on the API config, not
    discovery).
- `curl`'d the JWKS endpoint — 2 RSA keys published, both `"alg": "RS256"`,
  `"use": "sig"`. Noted that HS256 (listed as a possible ID-token alg) is
  irrelevant here since HS256 uses a shared secret and can't be verified
  via JWKS at all — only the published RS256 keys are actually checkable.
- Wrote a new **"Auth0 tenant capabilities (verified)"** section into
  `API_DESIGN.md`, citing both source URLs and the fetch date, plus a note
  that whether the specific API/client actually issues RS256 (vs. opaque)
  access tokens isn't visible from `.well-known` endpoints — that needs a
  dashboard check.
- Laid out ID token vs. access token trade-offs in the same file without
  picking one: ID tokens are simpler for profile claims but their `aud` is
  the client ID (wrong shape for API authorization, discouraged by Auth0/
  OIDC); access tokens with `audience=https://bbl-candidate-test-api` have
  the right `aud` for a clean check and support scopes, but require the
  frontend to explicitly request that audience during login.

## Request 2 — "ใช้ access token" (decision + implementation)

User picked the access-token option and, based on the earlier "I'll wire
up the guard once you decide," this was read as the go-ahead to implement.

### Implementation

- Installed `@nestjs/passport`, `passport`, `passport-jwt`, `jwks-rsa`
  (+ `@types/passport-jwt` dev dep) in `/backend`.
- New `backend/src/auth/`:
  - `jwt.strategy.ts` — `passport-jwt` `Strategy` using `jwks-rsa`'s
    `passportJwtSecret` against the tenant's JWKS, checking `issuer`,
    `audience` (from `AUTH0_DOMAIN`/`AUTH0_AUDIENCE` env vars), and
    `algorithms: ['RS256']`. `validate()` maps the token's `sub` claim to
    `{ id: sub }` for later `ownerId` scoping.
  - `jwt-auth.guard.ts` — `JwtAuthGuard extends AuthGuard('jwt')`,
    registered globally via `APP_GUARD` so every route is guarded by
    default (CLAUDE.md rule 1); reads a `@Public()` metadata flag via
    `Reflector` to opt specific routes out.
  - `public.decorator.ts` — `@Public()` decorator/metadata key.
  - `current-user.decorator.ts` — `@CurrentUser()` param decorator
    exposing `{ id }` from `request.user`.
  - `auth.module.ts` — wires `PassportModule` + `JwtStrategy`.
- New `backend/src/health/health.controller.ts` — `GET /api/health`,
  marked `@Public()`, the one documented exception to the global guard.
- `main.ts` — added `app.setGlobalPrefix('api')` to match the `/api` base
  path already documented in `API_DESIGN.md`.
- `app.module.ts` — imports `AuthModule`, registers `HealthController`,
  registers `JwtAuthGuard` as the global `APP_GUARD`.
- `app.controller.ts` — marked the existing hello-world stub `@Public()`
  so the new global guard doesn't break it.
- Tests:
  - `jwt-auth.guard.spec.ts` — public-bypass and passport-delegation paths.
  - `jwt.strategy.spec.ts` — `sub → { id }` mapping; throws if
    `AUTH0_DOMAIN`/`AUTH0_AUDIENCE` are missing.
  - Updated `test/app.e2e-spec.ts` for the new `/api` prefix and to assert
    both `/api` and `/api/health` are reachable without a token.
  - Fixed both Jest configs (`package.json` + `test/jest-e2e.json`) with
    `transformIgnorePatterns: ["node_modules/(?!(jose)/)"]` — `jwks-rsa`
    pulls in `jose`, which ships ESM-only and broke ts-jest without this.

### Verification

- `npm test` (unit) — 3 suites / 5 tests, all passing.
- `npx tsc -p tsconfig.build.json --noEmit` — clean.
- `npm run test:e2e` — fails locally on
  `PrismaClientInitializationError: Unknown authentication plugin
  'sha256_password'` when `PrismaService.onModuleInit` calls `$connect()`.
  Verified via `git stash` that this fails identically on `main` *before*
  any of today's changes — a pre-existing local MySQL auth-plugin mismatch,
  not something this work introduced. Flagged to the user, left unfixed
  (out of scope for the auth-token task).

### Docs

- `API_DESIGN.md` — replaced the "open decision" section with a "decided"
  note (2026-07-25), pointing at `DECISIONS.md` and `backend/src/auth`.
- `DECISIONS.md` — added **decision 9**: access token over ID token, with
  the same why/consequences reasoning, plus the still-open item (confirm
  RS256-vs-opaque in the Auth0 dashboard for the
  `https://bbl-candidate-test-api` API).

## Git

Two commits, per CLAUDE.md's no-squash / small-meaningful-commits rule:

1. `5821c53` — `docs: verify Auth0 tenant capabilities, decide bearer
   token strategy` (`API_DESIGN.md`, `DECISIONS.md` only).
2. `bea7372` — `feat(auth): validate Auth0 access tokens via JWKS, guard
   every route by default` (all code: auth module, health controller,
   app wiring, tests, jest config fixes, lockfile).

Both pushed to `origin/main` on request.

## State at end of phase 2

- Every route is guarded by default; `@Public()` opts out `GET /api` (the
  stub) and `GET /api/health`.
- Access-token verification is live (RS256 via JWKS, `iss`/`aud` checked)
  but unexercised by any real resource yet — no Collection/Bookmark
  models, controllers, or `ownerId`-scoped queries exist yet (still next
  phase, per decision 7).
- Unit tests green; e2e blocked locally by a pre-existing MySQL
  environment issue unrelated to this work.
- Outstanding: confirm in the Auth0 dashboard that the
  `https://bbl-candidate-test-api` API issues signed RS256 access tokens,
  not opaque ones; wire the frontend's Auth0 login to request
  `audience=https://bbl-candidate-test-api` once frontend auth is
  implemented.
