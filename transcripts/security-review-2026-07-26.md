# /security-review — sample run

**Date:** 2026-07-26
**Scope:** `backend/src/**/*.controller.ts`, `backend/src/**/*.service.ts`
**Invoked by:** manual demo run of [.agent/commands/security-review.md](../.agent/commands/security-review.md)
during setup of the command itself (see [CLAUDE.md](../CLAUDE.md) → "Agent
capabilities").

## Controllers — auth guard coverage

| Controller | Route | `@Public()`? | Justified? |
|---|---|---|---|
| `app.controller.ts` | `GET /` | Yes (class default scaffold route) | Returns static "Hello World!" string, no data. Not a documented health-check per CLAUDE.md rule 1's letter, but leaks nothing — see note below. |
| `health.controller.ts` | `GET /health` | Yes | Yes — this is the documented health-check exception in CLAUDE.md rule 1. |
| `shared.controller.ts` | `GET /shared/:token` | Yes | Yes — capability-token lookup by design, and read-only (no write verbs present, per the class-level comment forbidding them). |
| `me.controller.ts` | `GET /me` | No (global guard applies) | — |
| `collections.controller.ts` | all 8 routes | No | — |
| `bookmarks.controller.ts` | all 6 routes | No | — |

All non-`@Public()` routes are covered by the global `APP_GUARD` (`JwtAuthGuard` in `app.module.ts`), which defaults to requiring auth and only exempts handlers/classes carrying `@Public()`. No route was found reachable without either a valid token or an explicit, justified `@Public()`.

## Prisma call sites — ownerId scoping + 404 safety

| File:Line | Method | Prisma call | `ownerId` in `where`? | 404-safe? | Verdict |
|---|---|---|---|---|---|
| `bookmarks.service.ts:26` | `findAll` | `bookmark.findMany` | Yes | n/a (list) | OK |
| `bookmarks.service.ts:32` | `findAll` | `bookmark.count` | Yes | n/a | OK |
| `bookmarks.service.ts:39` | `findOne` | `bookmark.findFirst` | Yes | Yes — `NotFoundException` | OK |
| `bookmarks.service.ts:50` | `create` | `bookmark.create` | Yes (`ownerId` in `data`) | n/a | OK |
| `bookmarks.service.ts:77` | `update` (private, backs `replace`/`patch`) | `bookmark.updateMany` | Yes | Yes — `count === 0` → `NotFoundException` | OK |
| `bookmarks.service.ts:84` | `update` | `bookmark.findUniqueOrThrow({ where: { id } })` | **No `ownerId`** | n/a | OK (self-lookup) — reached only after the `updateMany` above already proved this `id` belongs to `ownerId`; re-filtering here would be redundant, not a gap. |
| `bookmarks.service.ts:88` | `remove` | `bookmark.deleteMany` | Yes | Yes — `NotFoundException` | OK |
| `bookmarks.service.ts:110` | `assertCollectionOwnership` | `collection.findFirst` | Yes | Yes — `BadRequestException` on miss (not a lookup-by-id path exposed to the caller; body-supplied `collectionId` correctly gets the identical error whether missing or foreign-owned) | OK |
| `collections.service.ts:19` | `findAll` | `collection.findMany` | Yes | n/a | OK |
| `collections.service.ts:25` | `findAll` | `collection.count` | Yes | n/a | OK |
| `collections.service.ts:32` | `findOne` | `collection.findFirst` | Yes | Yes — `NotFoundException` | OK |
| `collections.service.ts:42` | `create` | `collection.create` | Yes | n/a | OK |
| `collections.service.ts:60` | `update` | `collection.updateMany` | Yes | Yes — `NotFoundException` | OK |
| `collections.service.ts:67` | `update` | `collection.findUniqueOrThrow({ where: { id } })` | **No `ownerId`** | n/a | OK (self-lookup) — same pattern as bookmarks: post-`updateMany` re-read of a row already proven owned. |
| `collections.service.ts:73` | `remove` | `collection.deleteMany` | Yes | Yes — `NotFoundException` | OK |
| `collections.service.ts:92` | `findBookmarks` | `bookmark.findMany` | Yes | n/a (ownership of parent collection checked first via `findOne`) | OK |
| `collections.service.ts:98` | `findBookmarks` | `bookmark.count` | Yes | n/a | OK |
| `collections.service.ts:111` | `share` | `collection.updateMany` | Yes | Yes — `NotFoundException` | OK |
| `collections.service.ts:129` | `unshare` | `collection.updateMany` | Yes | Yes — `NotFoundException` | OK |
| `me.service.ts:10` | `findOne` | `user.findUniqueOrThrow` | **No `ownerId`** | n/a | OK (self-lookup) — `id` is the verified token subject's own id (`@CurrentUser()`), never a client-supplied path/body value. |
| `shared.service.ts:19` | `findByToken` | `collection.findFirst({ where: { shareToken, shareEnabled: true } })` | **No `ownerId`** | Yes — `NotFoundException`, and identical for "token doesn't exist" vs. "token exists but `shareEnabled: false`" | OK (public-by-design) — scoped by unguessable token instead of ownerId; response is hand-picked to exclude `ownerId` and any other owner-identifying field (see selected fields at line 24). |

## Summary

- **23 Prisma call sites checked, 0 gaps.**
- 3 call sites are intentionally `ownerId`-free (2 self-lookups after an
  already-scoped `updateMany`, 1 self-lookup by token subject) and 1
  endpoint (`/shared/:token`) is intentionally owner-blind by design —
  all four are documented inline in the source with a comment explaining
  why, which is what let this review classify them as `OK` rather than
  `GAP` instead of needing to guess.
- One low-severity observation outside the command's core three checks:
  `app.controller.ts`'s scaffold `GET /` route is `@Public()` but isn't
  the "explicitly documented health-check endpoint" CLAUDE.md rule 1
  names — it's Nest's default hello-world route, left over from
  scaffolding. It returns a static string with no user data, so it isn't
  a privacy gap, but it's worth either deleting or folding into
  `/health` so rule 1 holds by the letter, not just in spirit. Filed as a
  follow-up, not fixed here — `/security-review` only reports.
