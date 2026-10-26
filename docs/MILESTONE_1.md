# Milestone 1 — What shipped

## Implemented

- pnpm monorepo: `apps/web`, `apps/worker`, `packages/db`, `packages/core`, `packages/shared`
- Docker Compose for PostgreSQL 16 + Redis 7
- Full M1 schema (CRM, imports, campaigns, activities, sender identities, plus stubs for email/events/AI/audit)
- Drizzle migrations + seed (`demo@smartreach.local` / `demo1234`)
- Session auth (JWT cookie) with workspace-scoped data access
- CSV upload → auto column mapping → confirm → normalize companies, jobs, contacts
- Exact dedup by normalized company name, email, LinkedIn URL; name-only rows flagged as fuzzy candidates (no auto-merge)
- Import row provenance retained on re-import
- Campaigns, enrollment, manual LinkedIn/email activity recording, unified contact timeline
- Dashboard aggregates and follow-up queue (read-only for M1)
- Sender identity registry (no live OAuth)
- Unit + integration tests for mapping, import/dedup, activities, workspace isolation

## How to run

See root [README.md](../README.md).

## Deferred to Milestone 2+

- Outbox processor and domain-event consumers
- Deterministic follow-up dispatch / eligibility engine
- Gmail / Microsoft Graph OAuth and send/sync
- AI gateway and bounded agents
- Fuzzy duplicate review UI
- Suppression list UI and reply inbox
