# API Design

Source of truth for the API shape. Update this **before** implementing or
changing an endpoint. Auth, User (`/me`), Collection (including read-only
sharing), and Bookmark endpoints are implemented as of 2026-07-26 — see
[backend/src](backend/src).

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
  { "data": [/* items */], "page": 1, "limit": 20, "total": 42 }
  ```
- Errors: one schema for every non-2xx response across the whole API — the
  standard Nest HTTP exception shape,
  `{ "statusCode": 404, "message": "...", "error": "Not Found" }`. Every
  thrown exception (`NotFoundException`, `BadRequestException`, validation
  failures from `ValidationPipe`) produces this same shape; no endpoint has
  a custom error format.
- Timestamps: ISO 8601 strings (`createdAt`, `updatedAt`), server-generated.

## Auth0 tenant capabilities (verified)

Verified live against the tenant on 2026-07-25 (not assumed from training
data). Sources:

- Discovery document: `https://dev-yg.us.auth0.com/.well-known/openid-configuration`
- JWKS: `https://dev-yg.us.auth0.com/.well-known/jwks.json`

| Field                                   | Verified value                                                                                                                                                                                                                                                                                        |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `response_types_supported`              | `code`, `token`, `id_token`, `code token`, `code id_token`, `token id_token`, `code token id_token` — **authorization code flow (`code`) is supported**                                                                                                                                               |
| `grant_types_supported`                 | `client_credentials`, `authorization_code`, `refresh_token`, `password`, `implicit`, plus Auth0 extension grants (device code, token-exchange, password-realm, passwordless-otp, MFA variants, jwt-bearer)                                                                                            |
| `token_endpoint_auth_methods_supported` | `client_secret_basic`, `client_secret_post`, `private_key_jwt`, `none` (`none` is what a public SPA client uses with PKCE)                                                                                                                                                                            |
| `id_token_signing_alg_values_supported` | `HS256`, `RS256`, `PS256`                                                                                                                                                                                                                                                                             |
| `code_challenge_methods_supported`      | `S256`, `plain` (PKCE supported)                                                                                                                                                                                                                                                                      |
| `scopes_supported`                      | `openid`, `profile`, `offline_access`, `name`, `given_name`, `family_name`, `nickname`, `email`, `email_verified`, `picture`, `created_at`, `identities`, `phone`, `address` — no custom API scopes are advertised here (those are configured on the API/audience side, not visible in this endpoint) |
| JWKS keys                               | 2 RSA keys published, both `"alg": "RS256"`, `"use": "sig"` (kids `tOu0FHcN3C2etrel4Qhaz`, `AU8Qa0nEiLZ2kCdVGwpR0`)                                                                                                                                                                                   |

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

## Resource: User

Internal record mapped 1:1 to an Auth0 identity, created via just-in-time
provisioning the first time a verified access token is seen for a given
`sub` — see decision 10 in [DECISIONS.md](DECISIONS.md).

| Field       | Type     | Notes                                                                                                                                |
| ----------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `id`        | number   | autoincrement, server-generated; used as `ownerId` everywhere                                                                        |
| `auth0Sub`  | string   | Auth0 `sub` claim, unique                                                                                                            |
| `email`     | string   | unique; placeholder value on JIT-created users until a profile-sync step exists (access tokens don't carry `email` — see decision 9) |
| `createdAt` | datetime |                                                                                                                                      |

### Endpoints

| Method | Path      | Description                                                                                                    |
| ------ | --------- | -------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/me` | Return the caller's own User record, derived from the verified token's `sub` — never from a client-supplied id |

## Resource: Collection

A named grouping of bookmarks, owned by exactly one user.

> **Discrepancy resolved (2026-07-26):** the Prisma schema does not include
> `description` and none was added — the field list below now matches
> [backend/prisma/schema.prisma](backend/prisma/schema.prisma) exactly.

| Field       | Type     | Notes                                     |
| ----------- | -------- | ----------------------------------------- |
| `id`        | number   | autoincrement, server-generated           |
| `ownerId`   | number   | internal `User.id`, never client-settable |
| `name`      | string   | required, 1–100 chars                     |
| `createdAt` | datetime |                                           |
| `updatedAt` | datetime |                                           |

Bookmarks with no collection are treated as "Unsorted" (`collectionId: null`)
rather than requiring a default collection to exist.

### Endpoints

| Method | Path                             | Description                                                                                                                                                                                                                                                                                                                                              |
| ------ | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/collections`               | List the caller's collections. Paginated (`?page=&limit=`)                                                                                                                                                                                                                                                                                               |
| POST   | `/api/collections`               | Create a collection                                                                                                                                                                                                                                                                                                                                      |
| GET    | `/api/collections/:id`           | Get one collection (owner only)                                                                                                                                                                                                                                                                                                                          |
| PUT    | `/api/collections/:id`           | Full replace of `name` (owner only)                                                                                                                                                                                                                                                                                                                      |
| PATCH  | `/api/collections/:id`           | Partial update of `name` (owner only)                                                                                                                                                                                                                                                                                                                    |
| DELETE | `/api/collections/:id`           | Delete; bookmarks inside become Unsorted (`collectionId = null`), not deleted                                                                                                                                                                                                                                                                            |
| GET    | `/api/collections/:id/bookmarks` | List bookmarks in this collection (owner only). Paginated                                                                                                                                                                                                                                                                                                |
| POST   | `/api/collections/:id/share`     | (Owner only.) Issues a fresh, unguessable `shareToken` and sets `shareEnabled = true`. **Always regenerates the token, even if one already exists** — this is the only rotate/revoke-and-reissue mechanism, there is no separate rotate endpoint. `201` body: `{ "shareToken": "...", "shareEnabled": true }`. `404` if `:id` isn't owned by the caller. |
| DELETE | `/api/collections/:id/share`     | (Owner only.) Sets `shareEnabled = false` **and nulls `shareToken`** — a re-share always mints a new token anyway, so nothing is gained by retaining the disabled one, and not retaining it removes a stray token as a replay target if `shareEnabled` is ever bypassed elsewhere. `204` on success, `404` if `:id` isn't owned by the caller.           |

### Sharing (read-only, public)

| Method | Path                 | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------ | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/shared/:token` | **Public — no `Authorization` header, no auth guard.** Looks up a Collection by `shareToken` where `shareEnabled = true`. Returns `200` with `{ "name": "...", "bookmarks": [{ "title", "url", "notes" }] }` — never `ownerId`, `id`, timestamps, or anything else identifying the owner or account. `404` for both a token that never existed **and** a token that exists but is currently disabled (`shareEnabled = false`) — those two cases are made to look identical (same status, same body, same query — the `WHERE shareToken = ? AND shareEnabled = true` clause excludes disabled rows outright, it doesn't check-then-branch) specifically so the endpoint can't be used to enumerate which tokens are real vs. fake vs. revoked. This route has no PATCH/PUT/DELETE handler under any path — the share token is structurally read-only, not just hidden from the frontend. |

`shareToken` is 32 random bytes (`crypto.randomBytes`, base64url-encoded,
43 chars) — 256 bits of entropy, generated fresh on every `POST .../share`
call. `PrismaService` applies a global `omit: { collection: { shareToken:
true } }`, so `shareToken` never appears in any query result anywhere in
the app (including owner-facing `GET /collections/:id` etc.) except the
literal response object `POST .../share` constructs by hand — one
enforcement point instead of relying on every query to remember a
`select`.

## Resource: Bookmark

A saved link, owned by exactly one user, optionally filed into a Collection.

> **Discrepancy resolved (2026-07-26):** the field list below now matches
> the implemented schema (`notes` only) — `description`/`faviconUrl`/
> `isRead`/`isFavorite` were dropped from this doc rather than added to the
> schema. Bookmark endpoints implement the reduced field set below; the
> read-tracking endpoint (`PATCH /:id/read`) was dropped along with
> `isRead`.

| Field          | Type     | Notes                                           |
| -------------- | -------- | ----------------------------------------------- |
| `id`           | number   | autoincrement, server-generated                 |
| `ownerId`      | number   | internal `User.id`, never client-settable       |
| `collectionId` | number?  | FK → Collection, nullable ("Unsorted")          |
| `url`          | string   | required, must be a valid absolute URL          |
| `title`        | string   | required; client may prefill from page metadata |
| `notes`        | string?  | optional, ≤2000 chars                           |
| `createdAt`    | datetime |                                                 |
| `updatedAt`    | datetime |                                                 |

### Endpoints

| Method | Path                 | Description                                                                          |
| ------ | -------------------- | ------------------------------------------------------------------------------------ |
| GET    | `/api/bookmarks`     | List caller's bookmarks. Filter: `collectionId`. Paginated (`?page=&limit=`)         |
| POST   | `/api/bookmarks`     | Create a bookmark                                                                    |
| GET    | `/api/bookmarks/:id` | Get one bookmark (owner only)                                                        |
| PUT    | `/api/bookmarks/:id` | Full replace (`url`, `title` required; `notes`/`collectionId` optional) (owner only) |
| PATCH  | `/api/bookmarks/:id` | Partial update of any field (owner only)                                             |
| DELETE | `/api/bookmarks/:id` | Delete (owner only)                                                                  |

`collectionId` (create/update) is validated against the caller's own
collections: a foreign or nonexistent id both produce the identical
`400 Bad Request` — never a 403/404 that would let the response distinguish
"exists but isn't yours" from "doesn't exist" for an id supplied in the
request _body_ (the URL-path ownership rule — 404 for foreign/missing — only
applies to the resource identified by the path itself). Passing
`collectionId: null` explicitly unsets it back to "Unsorted".

## Collection ↔ Bookmark relationship and delete behavior

A Bookmark optionally belongs to one Collection (`collectionId`, nullable).
Two different foreign keys on `Bookmark`/`Collection` point at two different
parents, and they intentionally have **different** `onDelete` behavior (see
[backend/prisma/schema.prisma](backend/prisma/schema.prisma)):

| FK                                                              | `onDelete` | Effect                                                                                                                                | Why                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Bookmark.collectionId → Collection.id`                         | `SetNull`  | Deleting a Collection does **not** delete the Bookmarks inside it — `collectionId` is set to `null` and they fall back to "Unsorted". | A Collection is just a label/grouping, not a container the user thinks of as owning the bookmark's existence. Losing saved links because you deleted a folder would be a data-loss surprise the product shouldn't inflict; "Unsorted" already exists as a first-class state (see the Collection section above), so there's nowhere-to-fall-back is never a problem. |
| `Bookmark.ownerId → User.id` and `Collection.ownerId → User.id` | `Cascade`  | Deleting a User deletes all their Collections and Bookmarks.                                                                          | There's no account-deletion endpoint in this API yet, so this only fires via direct DB administration (e.g. a manual GDPR-style deletion) — at that point "erase everything owned by this user" is the correct behavior, not an accident to guard against.                                                                                                          |

## Where the privacy invariant is actually enforced

CLAUDE.md's three privacy rules map to specific code, not just convention:

1. **Every route has an auth guard, default-deny.** `JwtAuthGuard` is
   registered globally as `APP_GUARD` in
   [backend/src/app.module.ts:26](backend/src/app.module.ts) — every route is
   guarded _by default_; a route opts **out** with `@Public()`
   ([backend/src/auth/jwt-auth.guard.ts](backend/src/auth/jwt-auth.guard.ts)),
   not the other way around. This means a newly-added controller method with
   no annotation at all is guarded automatically, rather than accidentally
   open until someone remembers to add a guard. Only three routes are
   `@Public()`: `GET /` (app scaffold root), `GET /api/health`, and
   `GET /api/shared/:token` (intentionally public, read-only, owner-blind —
   see Sharing below).
2. **`ownerId` scoping on every query.** Every read/write in
   [backend/src/collections/collections.service.ts](backend/src/collections/collections.service.ts)
   and
   [backend/src/bookmarks/bookmarks.service.ts](backend/src/bookmarks/bookmarks.service.ts)
   takes `ownerId` as an explicit first parameter (sourced from the verified
   token via `@CurrentUser()`,
   [backend/src/auth/current-user.decorator.ts](backend/src/auth/current-user.decorator.ts) —
   never from the request path/body) and folds it into the Prisma `where`
   clause itself (`findFirst`/`updateMany`/`deleteMany` with
   `{ id, ownerId }`), not as a separate check after fetching by id alone.
3. **404, not 403, for cross-user access.** Because step 2 scopes the query
   itself, "exists but belongs to someone else" and "doesn't exist" produce
   the _same_ Prisma result (no row found) and therefore the same
   `NotFoundException` — there's no separate branch that could leak a `403`.
   Covered by `collections.service.spec.ts` and `bookmarks.service.spec.ts`
   (unit) and the `privacy-and-auth` e2e suite
   ([backend/test](backend/test), see phase-06 transcript) against a real
   MySQL instance — 77/77 passed as of 2026-07-26.

`shareToken` gets one more enforcement point on top of the above: a global
Prisma `omit: { collection: { shareToken: true } }` in `PrismaService`'s
constructor, so the token can't leak through an owner-facing query even by
omission of a `select` — see the Sharing section above.

## Places the first draft got this wrong (and how it was caught)

Recorded here because CLAUDE.md treats these as security bugs, not style —
worth knowing what the failure modes actually looked like in practice, not
just the rule in the abstract.

1. **Owner-facing queries leaked `shareToken`.** When sharing was first
   implemented, `GET /collections/:id` (and other owner reads) had no
   `select`/`omit`, so the response would have included the collection's
   `shareToken` even though nothing in the UI needed it there — a case of a
   sensitive field being _readable_ even though nothing was misusing it yet.
   Caught in self-review during the same phase (before commit), fixed by
   moving the omission to a single global point (`PrismaService`'s
   `omit: { collection: { shareToken: true } }`) instead of relying on every
   future query remembering a `select`.
2. **`PUT` silently behaved like `PATCH`.** The first pass had `replace()`
   (full replace, `PUT`) forward into the same internal `update()` helper as
   `patch()` (partial update), so omitted fields on a `PUT` body were left
   unchanged instead of being cleared — `PATCH` semantics leaking into `PUT`.
   Caught in self-review, fixed by having `replace()` default omitted fields
   to `null` explicitly, and locked in with a regression test.
3. **`API_DESIGN.md` drifted from the implemented schema.** This doc
   originally specified cuid string ids with `ownerId` set to the raw Auth0
   `sub`, and a wider Bookmark field set (`description`, `faviconUrl`,
   `isRead`, `isFavorite`). Implementation used autoincrement `Int` ids
   (per explicit instruction — see [DECISIONS.md](DECISIONS.md) #10) and a
   reduced Bookmark field set (`notes` only). Both discrepancies were
   flagged rather than silently building code that didn't match the doc,
   and this file was reconciled to match the actual schema on 2026-07-26 —
   see the "Discrepancy resolved" notes on the Collection and Bookmark
   sections above.

## Open questions (resolve before implementing)

- Do we need bookmark tags/labels in addition to Collections, or is
  Collection the only grouping mechanism for v1?
- Do we store fetched page metadata (title/favicon) server-side (requires
  an outbound fetch — SSRF considerations) or trust client-supplied values
  only for v1?
