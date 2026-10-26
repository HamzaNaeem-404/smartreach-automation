# Milestone 2.1 — Operational Hardening Plan

**Date:** 2026-10-26  
**Basis:** Source inspection of Milestone 2 follow-up engine, APIs, worker, schema, and tests.

## Findings

| Area | Status | Gap |
|------|--------|-----|
| Eligibility engine | Working | Suppression matched by `contactId` only; email/LinkedIn columns ignored |
| Suppression table | Schema only | No writers, API, UI, or unique scope keys |
| Bounce → DNC | Enrollment status only | Does not persist `suppression_entries` |
| Role gates | Missing | `requireSession` only; any member can approve/cancel/import |
| Claim recovery | Partial | Abandoned `reserved` never reclaimed; `reserved_at` unused as lease |
| Retry off-by-one | Bug | Claim increments attempts before process; last attempt auto-cancels |
| Outbox drain | Partial | No `SKIP LOCKED`; concurrent workers can double-handle |
| Follow-up queue | Working | No inline activity panel; no pause/resume UI |
| listFollowUpActions | Slow | Per-row eligibility + recent-activity N+1 |
| Indexes | Incomplete | Missing `(workspace_id, contact_id)` on scheduled_actions / suppressions |
| Docs | Stale | CODE_AUDIT still notes JWT membership gap (fixed) |

## Permission matrix (target)

| Capability | owner | admin | member |
|------------|-------|-------|--------|
| View contacts / campaigns / queue | ✓ | ✓ | ✓ |
| Import CSV | ✓ | ✓ | ✓ |
| Create/modify contacts & companies | ✓ | ✓ | ✓ |
| Manage campaigns / enroll | ✓ | ✓ | ✗ create/pause; ✓ enroll |
| Record activities | ✓ | ✓ | ✓ |
| Approve / defer follow-ups | ✓ | ✓ | ✗ |
| Complete LinkedIn tasks | ✓ | ✓ | ✓ |
| Cancel follow-ups | ✓ | ✓ | ✗ |
| Manage suppressions | ✓ | ✓ | ✗ |
| Manage sender identities | ✓ | ✓ | ✗ |
| Manage workspace users / settings | ✓ | ✗ | ✗ |

Campaign create/pause and suppression require `admin` or `owner`. Members may record activity and complete human LinkedIn tasks.

## Ordered tasks

1. ~~Schema: suppression channel/origin, uniqueness, lease indexes.~~
2. ~~Permissions helper + session role; enforce on all mutating APIs.~~
3. ~~Suppression service + bounce/unsubscribe writers + invalidate open actions.~~
4. ~~Claim lease reclaim + retry fix + outbox SKIP LOCKED.~~
5. ~~Follow-up queue UX: reasons, recent activity panel, reject.~~
6. ~~Observability queries + structured logs.~~
7. ~~Pagination / batch queries for queue and contacts.~~
8. ~~Integration tests (hardening suite); browser acceptance.~~
9. ~~Docs / migration / build validation.~~

Delivery notes: `docs/MILESTONE_2_1.md`.

## Non-goals (stop before M3)

- Live email send / OAuth
- LinkedIn automation
- External monitoring SaaS
- Search service beyond Postgres
