# Architecture — AI-Powered Multi-Channel Outreach OS

## Overview

SmartReach is a TypeScript modular monolith for CSV-based prospect ingestion, CRM, multi-channel outreach tracking, and selectively invoked AI agents. PostgreSQL is the source of truth; Redis/BullMQ handle async work; Next.js serves the UI and API; a separate worker process runs background jobs.

## High-level diagram

```
┌─────────────────────────────────────────────────────────────┐
│  apps/web (Next.js)                                         │
│  UI · API routes · auth · file upload                       │
└────────────┬───────────────────────────────┬────────────────┘
             │                               │
             ▼                               ▼
┌────────────────────────┐     ┌─────────────────────────────┐
│  packages/core         │     │  packages/db                │
│  domain services       │────▶│  Drizzle schema · client    │
│  import · CRM · rules  │     │  migrations · seeds         │
└────────────┬───────────┘     └──────────────▲──────────────┘
             │                                │
             ▼                                │
┌────────────────────────┐     ┌──────────────┴──────────────┐
│  Redis + BullMQ        │────▶│  apps/worker                │
│  queues · schedules    │     │  import · sync · follow-ups │
└────────────────────────┘     └─────────────────────────────┘
```

## Monorepo layout

```
apps/
  web/                 Next.js App Router UI + Route Handlers
  worker/              BullMQ consumers (import processing, later sync/follow-ups)
packages/
  db/                  Drizzle schema, migrations, DB client, seeds
  core/                Pure domain logic (import, CRM, campaigns, activities)
  shared/              Shared types, Zod schemas, constants, errors
docker-compose.yml     PostgreSQL + Redis
```

## Module boundaries (MVP → future services)

| Module | Package surface | Milestone |
|--------|-----------------|-----------|
| A CSV ingestion | `core/import` | M1 |
| B Company/Contact CRM | `core/crm` | M1 |
| C Sender identities | `core/identities` | M1 (CRUD only) |
| D Campaigns & tracking | `core/campaigns` | M1 |
| E Email adapters | `core/email` | M3 |
| F Follow-up engine | `core/followups` | M2 |
| G AI gateway/agents | `core/ai` | M4 |
| H UI | `apps/web` | M1+ |

Each `core/*` module exports a service interface. Modules must not import UI or worker internals. Persistence goes through `packages/db` repositories/queries.

## Architectural principles

1. **Deterministic business rules** — eligibility, suppression, and status transitions are code + DB constraints, not LLM decisions.
2. **Event-driven, not agent-polling** — domain events → outbox → workers; agents are invoked for bounded tasks only.
3. **Idempotent jobs** — stable keys, unique constraints, send-attempt records; uncertain sends go to reconciliation.
4. **Workspace isolation** — every query is scoped by `workspace_id`; RLS-ready schema, enforced in application layer for M1.
5. **Adapter pattern** — email providers, AI models, and LinkedIn status sources sit behind interfaces; mocks are labeled, never presented as live.
6. **No unauthorized automation** — LinkedIn is human-executed tasks + manual status; no scraping or connection bots.

## Request / write path (M1)

```
Browser → Next.js API → core service → Drizzle (Postgres)
                      ↘ enqueue BullMQ job (large CSV) → worker → core → DB
```

## Critical business rules (enforced in M1+)

| Rule | Enforcement |
|------|-------------|
| Never merge contacts on name alone | Dedup keys: LinkedIn URL, email, or explicit human merge |
| Preserve import provenance | `import_batches` + `import_rows` kept even after merge |
| Workspace isolation | All reads/writes filter `workspace_id` |
| Channel activities are independent | Per-enrollment per-channel rows; aggregate status derived |
| Opt-out / suppression blocks outreach | Checked before any send (M2); UI flags in M1 |
| Agents never send or set eligibility | AI returns suggestions; humans approve (M4) |

## Auth & multi-tenancy (M1)

- Session-based auth (credentials for local/dev; OAuth providers pluggable later).
- `workspaces` + `workspace_members` with roles: `owner`, `admin`, `member`.
- API helpers resolve session → membership → `workspaceId` before any data access.

## Async processing

- **M1**: CSV import jobs via BullMQ; small files may process inline with the same service path.
- **M2+**: outbox publisher, follow-up due-work scheduler, email sync, webhook handlers.

## Observability (progressive)

- Structured logs with `workspaceId`, `requestId`, `jobId`.
- Job metrics: delayed / failed / retried (worker).
- Audit log table for sends and critical status changes (schema in M1, writers expanded in M2).

## Security baseline

- Encrypted provider tokens at rest (M3).
- Webhook signature verification + replay protection (M3).
- No credential logging; PII minimized in logs.
- Rate limits on upload and mutation APIs.

## What we deliberately defer

- Vector DBs, autonomous multi-agent loops, microservices.
- Live Gmail/Graph send until OAuth + explicit enable (M3).
- LinkedIn browser automation (never).
- Full follow-up dispatch engine (M2).
