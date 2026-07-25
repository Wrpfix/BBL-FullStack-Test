# AI Workflow

How AI coding agents (Claude Code or otherwise) should operate in this repo.
This is process guidance; the actual rules the code must satisfy live in
[CLAUDE.md](CLAUDE.md).

## Before doing anything

1. Read [CLAUDE.md](CLAUDE.md) — product, stack, and the non-negotiable
   rules (auth guards, `ownerId` scoping, test-before-commit, no squash).
2. Read [API_DESIGN.md](API_DESIGN.md) if the task touches an endpoint or
   the data model. It is the source of truth for the API shape — if a task
   requires an endpoint/field that isn't documented there yet, update
   `API_DESIGN.md` first, in its own commit, before writing the
   implementation.
3. Check [DECISIONS.md](DECISIONS.md) before re-litigating an architectural
   choice (auth provider, DB, monorepo tooling, etc.) — if it's already
   decided there, follow it or add a new entry explaining why it's
   changing, don't silently diverge.

## `/.agent/`

Holds project-specific custom slash commands, subagents, and hooks for
coding agents working in this repo (e.g. a command that scaffolds a new
Nest resource module following the Collection/Bookmark pattern, or a hook
that blocks a commit if `ownerId` scoping looks missing). Empty for now —
populated as real workflows emerge; don't pre-build speculative tooling
here.

## `/transcripts/`

Session logs/transcripts of AI-assisted work on this repo get saved here.
Empty by default (gitignored contents aside from `.gitkeep` may apply once
a logging convention is chosen) — the point is traceability of what an
agent did and why, alongside the commit history.

## Commit discipline

- Small, individually-meaningful commits. One logical change per commit.
- Never squash history — see decision 8 in [DECISIONS.md](DECISIONS.md).
- Run the relevant test command and confirm it passes before committing.
  Don't commit red.
- Commit messages explain _why_, not just _what_ (the diff already shows
  what).

## Phase discipline

This repo was scaffolded in an explicit "structure + docs only, no
business logic" phase (see decision 7 in DECISIONS.md). When picking up
follow-on work, don't assume prior conversations exist — check
`DECISIONS.md` and `API_DESIGN.md` to see what phase the repo is actually
in before adding models/controllers/services.

## Retrospective: how this repo was actually built

**Tool:** Claude Code, working directly in this repo with normal dev tools
(read/edit files, run shell commands, `git`) — no custom agent harness
beyond the `/security-review` command described below.

### How the work was decomposed into phases

Rather than one open-ended "build the app" request, work was broken into
phases, each scoped to one reviewable slice, each with its own transcript
in [transcripts/](transcripts):

1. **Scaffold** — repo structure, tooling, rules docs; explicitly _no_
   business logic yet (decision 7).
2. **Collections CRUD** — first real resource, plus live verification of
   the Auth0 tenant's actual capabilities (fetched `.well-known` endpoints
   for real rather than assuming from training data).
3. **Bookmarks CRUD** — second resource, same ownership pattern.
4. **Sharing** — read-only public share links; the riskiest feature
   privacy-wise, given its own addendum and self-review pass.
5. **Frontend** — Auth0 Authorization Code + PKCE, UI wired to the API.
6. **Privacy/auth e2e tests** — a dedicated suite run against a real MySQL
   container (not mocks) specifically to _prove_ the ownerId/404 invariants
   under real conditions, not just assert them in unit tests.
7. **`/security-review` command** — a repeatable, on-demand static check
   for the same three invariants, so a later PR that regresses one of them
   doesn't rely on a human re-reading CLAUDE.md by hand.

### What the AI did well

- **Verified instead of assumed.** For the Auth0 integration, it fetched
  the tenant's discovery document and JWKS live via `curl` and cited the
  actual response instead of relying on general Auth0 knowledge — this is
  what caught that the tenant supports PKCE/authorization-code before
  committing to that flow.
- **Caught its own bugs before they reached review.** In the sharing phase,
  it found and fixed, unprompted: `shareToken` leaking through owner-facing
  queries (no `select`/`omit`), `PUT` silently behaving like `PATCH`
  (omitted fields not cleared), a missing runtime dependency
  (`class-validator`/`class-transformer`) that would only have surfaced at
  runtime, and a `@Type(() => Number)` coercion that would have turned an
  explicit `collectionId: null` into `0`.
- **Built tests that prove the invariant, not just exercise the code.** The
  phase-6 e2e suite ran against a disposable real MySQL container
  specifically so the ownerId-scoping and 404-vs-403 claims were verified
  against real Prisma/MySQL behavior, not a mock that could quietly diverge
  from production behavior.
- **Kept scope changes visible instead of silent.** When the implemented
  schema diverged from what `API_DESIGN.md` already documented (id type,
  Bookmark field list), it flagged the discrepancy in the transcript rather
  than either silently matching the stale doc or silently building past it,
  and left it for reconciliation in a later docs pass.

### Where it needed correction or human judgment

- **The very first request was underspecified on stack/auth**, so the
  initial pass built SQLite + a header-based fake-auth decorator; a
  follow-up instruction (Prisma+MySQL, Auth0 OIDC, scaffold-only) required
  deleting that work and starting the resource layer over. Lesson: naming
  the stack and phase boundary explicitly up front avoids a throwaway pass.
- **Doc/schema reconciliation needed an explicit human-visible checkpoint.**
  The AI flagged the `API_DESIGN.md` vs. schema drift correctly, but it
  took a deliberate "reconcile the docs" instruction to actually close it
  out — it doesn't auto-resolve doc/code drift on its own initiative
  without being asked.
- **Some trade-offs were correctly left open rather than decided.** E.g.
  whether to cache Auth0 tokens in `localStorage` vs. memory
  (`cacheLocation`) was surfaced with the trade-off explained but not
  decided — appropriate, since that's a judgment call about the user's
  threat model, not something the tool should decide unilaterally.
- **Commits were sometimes left unsplit/uncommitted at the end of a phase**,
  pending human follow-through, rather than assuming it should commit and
  move on.

### Prompt that worked well

> "Run the tests for real and report actual pass/fail, not a summary; if
> anything failed, diagnose whether it was a test bug or a real backend
> bug." _(paraphrased from phase 6)_

This worked because it forbade the failure mode of just describing what
the tests _should_ do — it forced an actual `jest` run against a real
database and a real diagnosis, which is what surfaced the 77/77-pass
result as a real fact rather than a claim.

### Prompt that didn't work well

The very first prompt of the whole project didn't pin down the database,
ORM, or auth approach, so the first pass guessed (SQLite, a fake
header-based auth decorator) — reasonable defaults for a generic CRUD app,
wrong for _this_ app's actual requirements (Prisma/MySQL, real Auth0 OIDC).
The fix wasn't a clever recovery technique, it was just a corrective
follow-up message naming the stack explicitly — worth remembering that
underspecifying the stack on request 1 costs a throwaway implementation
pass, not just a docs edit.
