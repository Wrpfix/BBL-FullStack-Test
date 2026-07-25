# API Design

Source of truth for the API shape. Update this **before** implementing or
changing an endpoint. Nothing in this file is implemented yet — this phase
is scaffold + docs only (see [AI_WORKFLOW.md](AI_WORKFLOW.md)).

## Conventions

- Base path: `/api` (e.g. `/api/bookmarks`).
- Auth: every route (except `/api/health`) requires `Authorization: Bearer
  <Auth0 access token>`. The token is validated against Auth0's JWKS
  (OIDC). The resulting subject (`sub`) claim maps to the `ownerId` used to
  scope every query — see the ownership rule in [CLAUDE.md](CLAUDE.md).
- **Ownership → 404, not 403.** Requesting a resource that exists but
  belongs to another user returns `404 Not Found`, identical to requesting
  an ID that doesn't exist at all. This repo never returns `403` for
  cross-user access, because a `403` confirms the resource exists.
- Pagination: cursor-free offset pagination via `?page=1&limit=20`
  (`limit` capped at 100). List responses are shaped as:
  ```json
  { "data": [ /* items */ ], "page": 1, "limit": 20, "total": 42 }
  ```
- Errors: standard Nest HTTP exception shape —
  `{ "statusCode": 404, "message": "...", "error": "Not Found" }`.
- Timestamps: ISO 8601 strings (`createdAt`, `updatedAt`), server-generated.

## Auth0 tenant capabilities (verified)

Verified live against the tenant on 2026-07-25 (not assumed from training
data). Sources:

- Discovery document: `https://dev-yg.us.auth0.com/.well-known/openid-configuration`
- JWKS: `https://dev-yg.us.auth0.com/.well-known/jwks.json`

| Field | Verified value |
|---|---|
| `response_types_supported` | `code`, `token`, `id_token`, `code token`, `code id_token`, `token id_token`, `code token id_token` — **authorization code flow (`code`) is supported** |
| `grant_types_supported` | `client_credentials`, `authorization_code`, `refresh_token`, `password`, `implicit`, plus Auth0 extension grants (device code, token-exchange, password-realm, passwordless-otp, MFA variants, jwt-bearer) |
| `token_endpoint_auth_methods_supported` | `client_secret_basic`, `client_secret_post`, `private_key_jwt`, `none` (`none` is what a public SPA client uses with PKCE) |
| `id_token_signing_alg_values_supported` | `HS256`, `RS256`, `PS256` |
| `code_challenge_methods_supported` | `S256`, `plain` (PKCE supported) |
| `scopes_supported` | `openid`, `profile`, `offline_access`, `name`, `given_name`, `family_name`, `nickname`, `email`, `email_verified`, `picture`, `created_at`, `identities`, `phone`, `address` — no custom API scopes are advertised here (those are configured on the API/audience side, not visible in this endpoint) |
| JWKS keys | 2 RSA keys published, both `"alg": "RS256"`, `"use": "sig"` (kids `tOu0FHcN3C2etrel4Qhaz`, `AU8Qa0nEiLZ2kCdVGwpR0`) |

Notes:

- The discovery doc lists `HS256` as a possible ID-token signing alg, but
  that only applies to legacy non-OIDC-conformant Auth0 apps signing with
  the client secret. Every key actually published in the JWKS is RS256, so
  any token this backend verifies via JWKS (RS256, asymmetric) is
  consistent with that — HS256 tokens can't be verified via JWKS at all
  since they use a shared secret, not a public key.
- The discovery document does not expose whether the specific Application
  (client ID `H9F6QG5SzTKMv0tbmgxLj9LjG1EKVllA`) or the API identified by
  audience `https://bbl-candidate-test-api` is configured to actually issue
  RS256 access tokens — that's an Auth0 dashboard/API-management setting,
  not something visible from `.well-known` endpoints. Confirm it in the
  Auth0 dashboard (API settings → "Signing Algorithm") before relying on it,
  or by decoding a real token's header once login is wired up.

### Bearer token: Access token (decided)

Decided 2026-07-25 — the backend accepts an **access token** issued with
`audience=https://bbl-candidate-test-api`, not an ID token. See decision 9
in [DECISIONS.md](DECISIONS.md) for the trade-off writeup that led here.

Verification is `passport-jwt` + `jwks-rsa` (`passportJwtSecret`), checking:
`iss === https://<AUTH0_DOMAIN>/`, `aud === AUTH0_AUDIENCE`, signature via
the tenant's JWKS, `algorithms: ['RS256']`. Implementation:
[backend/src/auth](backend/src/auth).

Outstanding item: confirm in the Auth0 dashboard (API settings → Signing
Algorithm for the `https://bbl-candidate-test-api` API) that access tokens
are actually issued as signed RS256 JWTs and not opaque tokens — this
isn't visible from `.well-known` endpoints (see note above).

## Resource: Collection

A named grouping of bookmarks, owned by exactly one user.

| Field         | Type      | Notes                                   |
|---------------|-----------|------------------------------------------|
| `id`          | string    | cuid, server-generated                   |
| `ownerId`     | string    | Auth0 `sub`, never client-settable       |
| `name`        | string    | required, 1–100 chars                    |
| `description` | string?   | optional, ≤500 chars                     |
| `createdAt`   | datetime  |                                           |
| `updatedAt`   | datetime  |                                           |

Bookmarks with no collection are treated as "Unsorted" (`collectionId: null`)
rather than requiring a default collection to exist.

### Endpoints

| Method | Path                | Description                          |
|--------|----------------------|---------------------------------------|
| GET    | `/api/collections`     | List the caller's collections        |
| POST   | `/api/collections`     | Create a collection                  |
| GET    | `/api/collections/:id` | Get one collection (owner only)      |
| PATCH  | `/api/collections/:id` | Update name/description (owner only) |
| DELETE | `/api/collections/:id` | Delete; bookmarks inside become Unsorted (`collectionId = null`), not deleted |

## Resource: Bookmark

A saved link, owned by exactly one user, optionally filed into a Collection.

| Field         | Type      | Notes                                          |
|---------------|-----------|--------------------------------------------------|
| `id`          | string    | cuid, server-generated                          |
| `ownerId`     | string    | Auth0 `sub`, never client-settable              |
| `collectionId`| string?   | FK → Collection, nullable ("Unsorted")          |
| `url`         | string    | required, must be a valid absolute URL          |
| `title`       | string    | required; client may prefill from page metadata |
| `description` | string?   | optional, ≤1000 chars                           |
| `faviconUrl`  | string?   | optional                                        |
| `isRead`      | boolean   | default `false`                                 |
| `isFavorite`  | boolean   | default `false`                                 |
| `createdAt`   | datetime  |                                                  |
| `updatedAt`   | datetime  |                                                  |

### Endpoints

| Method | Path                          | Description                                             |
|--------|-------------------------------|-----------------------------------------------------------|
| GET    | `/api/bookmarks`                | List caller's bookmarks. Filters: `collectionId`, `isRead`, `isFavorite`, `q` (search title/url) |
| POST   | `/api/bookmarks`                | Create a bookmark                                        |
| GET    | `/api/bookmarks/:id`            | Get one bookmark (owner only)                             |
| PATCH  | `/api/bookmarks/:id`            | Update fields (owner only)                                 |
| DELETE | `/api/bookmarks/:id`            | Delete (owner only)                                         |
| PATCH  | `/api/bookmarks/:id/read`       | Toggle/set `isRead` (owner only)                             |

## Open questions (resolve before implementing)

- Do we need bookmark tags/labels in addition to Collections, or is
  Collection the only grouping mechanism for v1?
- Do we store fetched page metadata (title/favicon) server-side (requires
  an outbound fetch — SSRF considerations) or trust client-supplied values
  only for v1?
