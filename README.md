# BBL-FullStack-Test — Personal Bookmark Manager

A private "read later" bookmark manager. Each user's bookmarks and
collections are visible only to them — see [CLAUDE.md](CLAUDE.md) for the
full privacy requirement.

> **Status:** scaffold phase. Project structure, tooling, and rules docs
> only — no Collection/Bookmark business logic yet. See
> [DECISIONS.md](DECISIONS.md) (#7).

## Stack

- **Backend:** NestJS + TypeScript + Prisma + MySQL
- **Auth:** Auth0 (OIDC)
- **Frontend:** React + Vite + TypeScript + MUI + React Router v8
- **Monorepo:** npm workspaces

## Structure

```
/backend        NestJS API (Prisma/MySQL)
/frontend       React + Vite + MUI SPA
/.agent/        custom commands/subagents/hooks for coding agents
/transcripts/   AI-assisted session logs
CLAUDE.md       agent rules — read this first
API_DESIGN.md   API/resource design (source of truth for endpoints)
DECISIONS.md    architecture decision log
AI_WORKFLOW.md  how AI agents should work in this repo
```

## Getting started

```bash
npm install
```

Copy the env templates and fill in real values:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Run the backend and frontend dev servers (separate terminals):

```bash
npm run dev:backend
npm run dev:frontend
```

Backend defaults to `http://localhost:3001`, frontend runs on
`http://localhost:3000` (pinned, not Vite's default 5173) — the Auth0
Application's registered callback URL is `http://localhost:3000/callback`,
so the frontend owns port 3000 and the backend moved to 3001.

### Backend needs a MySQL database

Point `DATABASE_URL` in `backend/.env` at a running MySQL instance. Once
the Prisma schema has models (see API_DESIGN.md / DECISIONS.md #7), run:

```bash
npm run --workspace backend prisma migrate dev
```

### Tests

```bash
npm run test:backend
```

## Contributing / working with an AI agent

Read [CLAUDE.md](CLAUDE.md) and [AI_WORKFLOW.md](AI_WORKFLOW.md) first —
they define non-negotiable rules (auth guards, per-user data scoping,
test-before-commit, no squash commits) that apply to human and AI
contributors alike.
