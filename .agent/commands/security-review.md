---
name: security-review
description: >
  Audit every backend controller/service under /backend/src for missing
  ownerId scoping, missing auth guards, and 403-vs-404 existence leaks —
  the three privacy invariants CLAUDE.md calls non-negotiable. Outputs a
  markdown table, not code edits.
---

# /security-review

Read-only audit command. It **never edits code** — it reports findings as a
table so a human (or a follow-up prompt) decides what to fix. Run it before
any commit that touches `/backend/src/**/*.controller.ts` or
`*.service.ts`, and periodically as a regression check on files nobody
touched this session.

## What it checks

This repo's privacy contract (see [CLAUDE.md](../../CLAUDE.md) → "Non-negotiable
rules") boils down to three checks per request path:

1. **Auth guard reachable** — every controller route is covered by the
   global `JwtAuthGuard` (`APP_GUARD` in `app.module.ts`) unless the
   handler is explicitly annotated `@Public()`. Any `@Public()` route must
   be justified (e.g. `/shared/:token` — a capability-token lookup, not an
   authenticated resource) and must be **read-only** (no `@Post`/`@Put`/
   `@Patch`/`@Delete` may be `@Public()`, per the note in
   `shared.controller.ts`).
2. **ownerId scoping on every Prisma call** — every `this.prisma.<model>.
   findFirst/findMany/findUnique/update/updateMany/delete/deleteMany/count`
   call that resolves a request-scoped resource (a bookmark, a collection)
   must include `ownerId` (or an equivalent owner-scoped foreign key,
   already itself ownerId-checked) in its `where`. An `id`-only `where`
   with no `ownerId` is the bug this command exists to catch — it lets
   user A load/mutate user B's row by guessing an id.
   - Exception: lookups keyed by the verified token's own subject (e.g.
     `MeService.findOne(id)` where `id` came from `@CurrentUser()`, never
     from the request path/body) are fine without a redundant `ownerId`
     filter — flag them as "OK (self-lookup)" in the table, not as a gap.
   - Exception: the public share surface (`SharedService.findByToken`) is
     intentionally owner-blind by token, not by ownerId — flag as
     "OK (public-by-design)".
3. **404, not 403, on cross-owner access** — a `findFirst`/`updateMany`/
   `deleteMany` scoped by `{ id, ownerId }` that returns zero rows must
   raise `NotFoundException`, never `ForbiddenException` or a raw 403.
   Returning 403 (or leaking *why* zero rows came back) tells the caller
   the id exists but isn't theirs — an existence oracle CLAUDE.md
   explicitly forbids.

## Steps

1. Glob `backend/src/**/*.controller.ts` and `backend/src/**/*.service.ts`.
2. For each controller: list every route handler, whether it (or its
   class) carries `@Public()`, and its HTTP method.
3. For each service method called from a controller: read every
   `this.prisma.*` call inside it. Record the model, the operation, and
   whether `ownerId` appears in `where`.
4. For any zero-rows-found branch (`count === 0`, `!result`), record
   whether the thrown error is `NotFoundException` or something else.
5. Emit one markdown table, one row per Prisma call site:

   | File:Line | Method | Prisma call | ownerId in `where`? | 404-safe? | Verdict |
   |---|---|---|---|---|---|

   `Verdict` is one of: `OK`, `OK (self-lookup)`, `OK (public-by-design)`,
   or `GAP — <one-line reason>`.
6. End with a one-line summary: total call sites checked, count of `GAP`
   rows. If zero gaps, say so plainly — don't manufacture a finding to
   seem thorough.

## Non-goals

- Does not check frontend code, DTO validation, or SQL injection (Prisma
  parameterizes queries — that class of bug isn't reachable through the
  query builder used here).
- Does not run tests or modify files. If it finds a `GAP`, the fix is a
  separate, deliberate follow-up — not an auto-patch.
