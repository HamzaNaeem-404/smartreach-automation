# Milestone 2 — Reliable follow-up workflows

## Shipped in this iteration

- Code audit: `docs/CODE_AUDIT.md`
- BD Pipeline comparison: `docs/BD_PIPELINE_COMPARISON.md`
- Source-aware CSV timestamp parser (absolute + relative like `1h`) with observation-time binding and raw preservation
- SimplyHired / `work_location` / `posting_time` mapping presets (no LLM)
- Deterministic eligibility engine (`evaluateActionEligibility`)
- Durable `scheduled_actions` lifecycle: schedule, approve, complete, defer, cancel, pause/resume campaign
- Reply / bounce → automatic invalidation of ineligible follow-ups
- Transactional domain events + outbox writers; worker drains outbox and claims due actions
- Follow-up queue UI buckets + operator actions
- Unified contact timeline includes activities **and** scheduled actions, ordered by effective time
- Explainable lead scoring + SimHash related-posting suggestions (no auto-merge)
- Provider-agnostic enrichment interfaces (disabled / noop by default)

## Explicitly still deferred

- Live Gmail / Graph send (M3)
- LinkedIn automation (never)
- Live enrichment providers
- Compliance country gate
- Fuzzy merge UI
- RLS policies in Postgres

## Timeline reconciliation model

Channel activities use `occurredAt` as the effective time (provider or operator-supplied). Scheduled actions use `cancelledAt` / `completedAt` / `executedAt` / `dueAt` in that preference order. The UI sorts by effective time, not insert order, so late provider events and cancellations remain auditable without contradicting chronology.

## Acceptance scenario

Covered by `packages/core/src/followups/followup.integration.test.ts` (requires Postgres).
