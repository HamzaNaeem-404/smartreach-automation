# Implementation Plan

## Milestone 1 — Functional CRM foundation (current)

### Scope

- Monorepo scaffold (pnpm, Next.js, Drizzle, Docker Compose).
- Full M1 schema + migrations + seed data.
- Dev auth + workspaces + membership checks.
- CSV upload, column mapping, normalization, exact dedup, import provenance.
- Companies, job postings, contacts, contact methods, relationships.
- Campaigns + enrollment.
- Manual LinkedIn/email activity recording + unified timeline.
- Dashboard (pipeline / campaign counts).
- Unit + integration tests for import and status paths.

### Explicitly out of scope

- BullMQ-heavy follow-up dispatch (queue used only for optional large import).
- Live Gmail / Microsoft Graph.
- AI agents / model gateway.
- Outbox processor and domain-event consumers.
- Fuzzy merge UI beyond flagging candidates.

### Acceptance criteria checklist

| # | Criterion | Done when |
|---|-----------|-----------|
| 1 | Upload CSV of job opportunities | API + UI creates `import_batches` / rows |
| 2 | Normalize to companies + job postings | Import service upserts with provenance |
| 3 | Associate decision-maker contacts | CRM APIs + UI |
| 4 | Enroll contacts in a campaign | Unique enrollment constraint |
| 5 | Record email + LinkedIn activities | `channel_activities` both channels |
| 6 | Unified timeline | Contact detail aggregates activities |
| 7 | Duplicates without losing history | Same company/method keys; rows retained |
| 8 | Dashboard pipeline/campaign status | Aggregate queries |
| 9 | Workspace isolation | Cross-workspace access returns 404/403 |
| 10 | Tests | Import + activity status paths covered |

### Exit docs

- README: how to run locally.
- `docs/MILESTONE_1.md`: what shipped vs next milestone.

---

## Milestone 2 — Reliable workflows (in progress / first vertical slice)

See `docs/MILESTONE_2.md` and `docs/CODE_AUDIT.md`.

- [x] Domain event writers + outbox drain worker
- [x] `scheduled_actions` due-work claim/process (DB source of truth)
- [x] Eligibility checks (suppression, reply, bounce, enrollment, campaign, sender, windows)
- [x] Cancellation when reply/bounce recorded
- [x] Follow-up queue UI with operator actions
- [x] CSV relative timestamp parsing + SimplyHired aliases
- [x] Scoring + SimHash suggestion modules (no auto-merge)
- [ ] Suppression management UI
- [ ] Broader concurrent race suite (multi-worker stress)
- [ ] Role-gated mutations

**Acceptance:** follow-up never executes when hard-block holds; covered by integration tests with fake/manual completion (no live send).

---

## Milestone 3 — Email integrations

- Gmail OAuth adapter + encrypted tokens.
- Send path gated on authorization + explicit enable.
- Reply sync, thread matching, webhooks.
- Microsoft Graph adapter.
- Subscription renewal + reconciliation jobs.
- Bounce / unsubscribe → suppression.

**Acceptance:** no real send without credentials + enable flag; duplicate webhooks do not duplicate activities.

---

## Milestone 4 — AI capabilities

- AI gateway (providers, Zod outputs, cache, budgets, tracing).
- Data Preparation / Contact Matching / Reply Classification / Message Drafting agents.
- Human review queues for ambiguous maps and drafts.
- Agents never control eligibility or send.

**Acceptance:** structured outputs validated; budgets enforced; drafts require approval.

---

## Milestone 5 — Scale and optimization

- Bulk import/perf testing.
- Usage analytics UI.
- Campaign intelligence aggregates.
- Cost/reliability hardening.

---

## Local development (all milestones)

```bash
docker compose up -d
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm --filter web dev
pnpm --filter worker dev   # optional for M1 large imports
pnpm test
pnpm typecheck
```

See root README for env vars and sample CSVs.
