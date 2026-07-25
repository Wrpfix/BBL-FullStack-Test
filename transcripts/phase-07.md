# Phase 7 — Reusable agent capability: `/security-review`

**Date:** 2026-07-26
**Agent:** Claude Code (Sonnet 5)
**Repo:** https://github.com/Wrpfix/BBL-FullStack-Test.git

> Note: this is a reconstructed summary of the session, not a raw log
> export. It records what was asked, decided, and done, in order.

## Request

The user asked (in Thai) to build at least one reusable agent capability
that would actually be used in this project, picking whichever of two
offered options best fit the work done so far:

- **Option A** — a custom `/security-review` slash command: audit every
  backend controller/service for Prisma queries missing an `ownerId`
  filter, and list them as a table.
- **Option B** — a pre-commit hook running `npm test` in both workspaces,
  blocking the commit on failure.

Required deliverable shape: (1) a definition file under `/.agent/`, (2) an
explanation in `CLAUDE.md` of what it is, when to invoke it, and why it was
built, (3) at least one real demonstration run with its output saved as
evidence under `/transcripts/`.

## Decision: Option A

`AI_WORKFLOW.md` already named this exact idea as the kind of thing
`/.agent/` exists for ("a hook that blocks a commit if `ownerId` scoping
looks missing"), and phase 6 had just spent a whole session proving the
`{ id, ownerId }` + `NotFoundException` pattern holds *today* — the natural
next step is a repeatable way to check it keeps holding as new
controllers/services get added, rather than re-running a one-off e2e audit
by hand each time. Went with Option A over B because it directly encodes
the domain-specific privacy invariants from CLAUDE.md (ownerId scoping,
404-not-403, auth-guard reachability), whereas a generic `npm test` gate
would only catch a regression *if* someone had already written a test for
it — the command instead catches the gap even before a test exists.

## Investigation before writing anything

Read the current backend surface to ground the command in the actual
pattern rather than a guessed one:

- `bookmarks.service.ts` / `bookmarks.controller.ts`,
  `collections.service.ts` / `collections.controller.ts`,
  `shared.service.ts` / `shared.controller.ts`, `me.service.ts` /
  `me.controller.ts`, `health.controller.ts`, `app.controller.ts` — every
  controller and service in `backend/src`.
- `app.module.ts` for how the auth guard is wired (`JwtAuthGuard` as global
  `APP_GUARD`, opt-out via `@Public()`) and `jwt-auth.guard.ts` for exactly
  how the opt-out is implemented (`Reflector.getAllAndOverride` on
  `IS_PUBLIC_KEY`).
- `.agent/README.md` and `AI_WORKFLOW.md` for the existing scaffolding
  and conventions for `/.agent/commands`, `/.agent/subagents`,
  `/.agent/hooks`.
- `.claude/settings.local.json` to see what tooling/permissions already
  exist in this repo.

This surfaced the three self-lookup/public-by-design exceptions that the
command needed to know not to flag as gaps: `bookmarks.service.ts`'s and
`collections.service.ts`'s post-`updateMany` `findUniqueOrThrow({ where:
{ id } })` re-reads (already proven owned by the preceding scoped
`updateMany`), `me.service.ts`'s lookup by the verified token's own
subject, and `shared.service.ts`'s intentionally owner-blind lookup by
capability token.

## Implementation

New file: [.agent/commands/security-review.md](../.agent/commands/security-review.md).

Defines `/security-review` as a **read-only** audit command — it never
edits code. It specifies:

1. **Auth guard reachable** — every route covered by the global
   `JwtAuthGuard` unless justified `@Public()`; no `@Public()` route may be
   a write verb.
2. **`ownerId` scoping on every Prisma call** — every `findFirst`/
   `findMany`/`findUnique`/`update(Many)`/`delete(Many)`/`count` on a
   request-scoped resource must filter by `ownerId`, with named exceptions
   for self-lookups-by-token-subject and the public share surface.
3. **404, not 403, on cross-owner access** — zero-rows-found branches must
   throw `NotFoundException`, never a 403 or anything that leaks *why*
   nothing came back.

Output contract: one markdown table (`File:Line | Method | Prisma call |
ownerId in where? | 404-safe? | Verdict`), plus a one-line summary. No
auto-patching on a `GAP` finding — that's a deliberate follow-up.

Updated [CLAUDE.md](../CLAUDE.md) with a new "Agent capabilities" section:
what the command checks, when to run it (before any commit touching a
controller/service, and periodically as a regression check), and why it
exists (these invariants are easy to get right once and regress on
silently under time pressure in a later PR).

## Demonstration run

Ran the command for real against the full current backend (all 6
controller/service pairs). Full output saved as evidence at
[transcripts/security-review-2026-07-26.md](security-review-2026-07-26.md).

**Result: 23 Prisma call sites checked, 0 gaps.** All 4 `ownerId`-free
call sites matched a documented, justified exception (2 self-lookups after
an already-scoped `updateMany`, 1 self-lookup by token subject, 1
public-by-design token lookup). The run also surfaced one finding outside
the command's core three checks: `app.controller.ts`'s scaffold `GET /` is
`@Public()` but isn't the "explicitly documented health-check endpoint"
CLAUDE.md rule 1 names — harmless (returns a static string, no user data)
but not literally compliant with the rule's wording. Filed as a follow-up
rather than fixed in this session, since the command's contract is
report-only.

## Commits

Three commits, each a single logical change, per CLAUDE.md rule 4:

1. `00950f5` — `feat(agent): add /security-review command for ownerId +
   auth-guard audit` (`.agent/commands/security-review.md` + `CLAUDE.md`
   docs).
2. `10d4e3e` — `docs: add sample /security-review run over the full
   backend` (`transcripts/security-review-2026-07-26.md`).
3. This file (`transcripts/phase-07.md`), committed separately per the
   established one-transcript-per-commit pattern from phases 1–6.

All pushed to `origin/main`.

## Open items carried forward

- The `GET /` scaffold route's `@Public()` status (see above) — either
  delete it or fold it into `/health` so CLAUDE.md rule 1 holds by the
  letter, not just in spirit. Not fixed this session.
- `/security-review` is currently a manually-invoked slash command, not
  wired into a pre-commit hook (that was Option B, not chosen). If the
  team later wants it enforced automatically rather than run on demand,
  that would mean adding a `/.agent/hooks` entry that shells out to the
  same check — not done here, and not clearly warranted yet per
  `AI_WORKFLOW.md`'s "don't pre-build speculative tooling" guidance.
- All items still open from phase 6 (unchanged): no automated frontend
  tests; `cacheLocation="memory"` vs `localStorage` trade-off unresolved;
  JIT-created user's placeholder email; confirm Auth0 issues signed RS256
  access tokens in the dashboard; no UI for the sharing endpoints; the
  disposable test MySQL container/manual docker-migrate-test sequence from
  phase 6 not yet codified into an npm script or CI.
