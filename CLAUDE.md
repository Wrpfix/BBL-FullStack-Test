# CLAUDE.md

Agent rules file. Read this first, in any new session, before touching code —
it should be enough to work in this repo without any other prior context.

## Product

**Personal Bookmark Manager** — a private, single-tenant-per-user "read later"
app. Each user's bookmarks are their own.

This is not just "add auth" — it is a hard privacy requirement:

- Another user must never be able to **see** another user's bookmarks or
  collections.
- Another user must never be able to **edit or delete** another user's data.
- Another user must never be able to **learn that a resource exists** —
  e.g. an authenticated request for someone else's bookmark ID must respond
  the same way as a request for a non-existent ID (`404`, not `403`). A `403`
  leaks existence; a `404` does not.

Treat any deviation from this as a security bug, not a style nit.

## Stack

| Layer     | Choice                                    |
|-----------|--------------------------------------------|
| Backend   | NestJS + TypeScript                        |
| ORM / DB  | Prisma + MySQL                             |
| Auth      | Auth0, OIDC (OpenID Connect)                |
| Frontend  | React + Vite + TypeScript + MUI            |
| Routing   | React Router v8 (data router / `RouterProvider`) |
| Monorepo  | npm workspaces (`/backend`, `/frontend`)   |

See [DECISIONS.md](DECISIONS.md) for the reasoning behind these choices.

## Resource model

Core resources: **Collection** and **Bookmark**.

Full field lists, relationships, and endpoint contracts live in
[API_DESIGN.md](API_DESIGN.md) — that file is the source of truth for the
API shape. Update it *before* implementing or changing an endpoint, not
after.

## Non-negotiable rules

1. **Every route has an auth guard.** No endpoint under `/api/*` (or
   equivalent) is reachable without a valid Auth0-issued token, except an
   explicitly documented health-check endpoint.
2. **Every query filters by the logged-in user's `ownerId`.** Never trust an
   ID from the request path/body alone — always scope the Prisma query
   (`where: { id, ownerId: currentUser.id }`) so cross-user access is
   structurally impossible, not just checked after the fact.
3. **Tests must actually run and pass before a commit.** Don't commit code
   you haven't run `npm test` (backend) / the relevant test command against.
   If there's no test for what you changed and it's non-trivial, write one.
4. **No squash commits.** History must stay legible: commit in small,
   individually-meaningful chunks (one logical change per commit), with
   messages that explain *why*. Do not squash a feature branch's history
   away before or during merge.

## Other docs in this repo

- [API_DESIGN.md](API_DESIGN.md) — resource/endpoint contracts (source of truth for the API).
- [DECISIONS.md](DECISIONS.md) — architecture decision log.
- [AI_WORKFLOW.md](AI_WORKFLOW.md) — how AI agents should work in this repo (commands, subagents, hooks, transcripts).
- [README.md](README.md) — human-facing setup/run instructions.
