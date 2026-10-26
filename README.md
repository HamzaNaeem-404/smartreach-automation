# SmartReach — AI-Powered Multi-Channel Outreach OS

TypeScript modular monolith for CSV prospect ingestion, CRM, campaign tracking, and (in later milestones) email integrations and bounded AI agents.

## Docs

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [DATA_MODEL.md](./DATA_MODEL.md)
- [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)
- [Milestone 1 notes](./docs/MILESTONE_1.md)

## Prerequisites

- Node.js 20+
- pnpm 9+
- Docker / Docker Compose

## Quick start

```bash
cp .env.example .env
docker compose up -d          # Postgres 16 + Redis 7
pnpm install
pnpm db:generate              # after schema changes
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open http://localhost:3000

**Demo login:** `demo@smartreach.local` / `demo1234`

If Docker Desktop is unavailable, point `DATABASE_URL` at a local Postgres instance and create role/db `smartreach`/`smartreach` (see `docker-compose.yml` credentials). Redis is optional for Milestone 1 unless you run the worker.

Optional worker (background CSV jobs):

```bash
pnpm dev:worker
```

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Next.js web app |
| `pnpm dev:worker` | BullMQ worker |
| `pnpm db:migrate` | Apply Drizzle migrations |
| `pnpm db:seed` | Seed demo workspace |
| `pnpm test` | Unit + integration tests |
| `pnpm typecheck` | TypeScript across packages |

## Sample data

- `samples/jobs-greenhouse.csv` — familiar column names
- `samples/jobs-alternate-schema.csv` — alternate headers (auto-mapped via aliases)
- `samples/fixtures/*-status-events.json` — LinkedIn/email activity fixtures for manual recording

## Milestone status

**Milestone 1 (current):** CRM foundation — CSV import, companies/contacts, campaigns, manual multi-channel activity, dashboard, workspace isolation.

Not yet: automated follow-ups, live email providers, AI agents.
