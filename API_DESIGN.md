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
