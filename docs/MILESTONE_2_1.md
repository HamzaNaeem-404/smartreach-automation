# Milestone 2.1 — Operational hardening

## Shipped

- Plan: `docs/MILESTONE_2_1_PLAN.md`
- Migration `0002_m21_hardening.sql`: suppression channel/origin, soft-delete, claim leases, indexes
- Suppression service (create / remove / list / contact status) with audit + domain events
- Bounce → durable email `suppression_entries`; creation cancels ineligible open follow-ups
- Suppressions UI (`/suppressions`) + contact detail suppression badge/status
- Role permission matrix (`packages/shared` permissions) enforced via `requirePermission` on mutating APIs
- Claim leases (`claimed_by`, `lease_expires_at`) with abandoned reclaim via `FOR UPDATE SKIP LOCKED`
- Outbox drain claims with atomic `UPDATE … SKIP LOCKED`; failures reclaimable
- Follow-up queue: inspect eligibility/recent activity, approve/reject/defer/complete with RBAC
- Ops metrics (`getOperationalMetrics`, `/api/ops/metrics`, dashboard counters for admin/owner)
- Structured worker logs (`logOperationalEvent`) without recipient/secret fields
- Hardening tests: suppression cancel, RBAC matrix, concurrent claim, lease recovery, bounce suppression

## Validation (executed)

| Check | Result |
|-------|--------|
| `pnpm db:migrate` | Applied including `0002_m21_hardening` |
| `pnpm test` | 11 shared + 25 core passing |
| `pnpm typecheck` | Pass |
| `pnpm build` | Pass (includes `/suppressions`, `/api/ops/metrics`) |

## Explicitly deferred (Milestone 3+)

- Live Gmail / Microsoft Graph send and reply sync
- LinkedIn automation
- External APM / metrics SaaS
- Postgres RLS policies
- Full multi-user UI for workspace membership management

## Remaining risks

- Outbox handlers remain no-op beyond logging until M3 adapters; at-least-once only.
- Eligibility still evaluated per queue row (batched contacts/activities; not a search service).
- Soft-removed suppressions do not auto-resume cancelled follow-ups (operator must reschedule).
