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
- Commit messages explain *why*, not just *what* (the diff already shows
  what).

## Phase discipline

This repo was scaffolded in an explicit "structure + docs only, no
business logic" phase (see decision 7 in DECISIONS.md). When picking up
follow-on work, don't assume prior conversations exist — check
`DECISIONS.md` and `API_DESIGN.md` to see what phase the repo is actually
in before adding models/controllers/services.
