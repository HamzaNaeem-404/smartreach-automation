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
| Opt-out / suppression blocks outreach | Eligibility + suppression service cancel open actions (M2.1) |
| Agents never send or set eligibility | AI returns suggestions; humans approve (M4) |

## Auth & multi-tenancy (M1 / hardened M2.1)

- Session-based auth (credentials for local/dev; OAuth providers pluggable later).
- `workspaces` + `workspace_members` with roles: `owner`, `admin`, `member`.
- API helpers resolve session → membership → `workspaceId` before any data access.
- Named permissions (`contacts:write`, `followups:approve`, `suppressions:write`, …) enforced with `requirePermission` / `assertPermission` on mutating routes. UI hiding is not authorization.

## Async processing

- **M1**: CSV import jobs via BullMQ; small files may process inline with the same service path.
- **M2**: outbox drain, follow-up due-work claim/process (at-least-once local; no live send).
- **M2.1**: execution leases on `scheduled_actions`; abandoned `reserved` rows reclaimed when `lease_expires_at` passes; outbox claim via atomic `UPDATE … SKIP LOCKED`.

## Observability (progressive)

- Structured logs with `workspaceId`, `jobId`, `workerId` (`logOperationalEvent`); secrets and recipient fields filtered.
- Counters: pending/overdue/stale claims, outbox backlog, failed imports, suppression-triggered cancellations (`getOperationalMetrics`).
- Audit log + domain/outbox events for suppressions and follow-up mutations.

## Security baseline

- Encrypted provider tokens at rest (M3).
- Webhook signature verification + replay protection (M3).
- No credential logging; PII minimized in logs.
- Rate limits on upload and mutation APIs.

## What we deliberately defer

- Vector DBs, autonomous multi-agent loops, microservices.
- Live Gmail/Graph send until OAuth + explicit enable (M3).
- LinkedIn browser automation (never).
- External monitoring SaaS (use DB metrics + structured logs until needed).
