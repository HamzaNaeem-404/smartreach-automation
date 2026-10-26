# SmartReach Code Audit (Milestone 1 → 2)

**Audit date:** 2026-10-26  
**Repository:** `smartreach-automation` (local workspace)  
**Method:** Source inspection + baseline `pnpm test` / `pnpm typecheck`. No business-logic changes were made before this document was drafted.

---

## Baseline verification

| Check | Result | Notes |
|-------|--------|-------|
| `pnpm test` | **Pass** | shared: 3 tests; core: 6 tests; db/web/worker: no tests (`--passWithNoTests`) |
| `pnpm typecheck` | **Pass** | All packages |
| Lint | **Not configured** | No ESLint/Biome scripts in root `package.json` |
| `pnpm build` | **Not run in audit pass** | Deferred to post-change verification |
| Docker Compose | **Up** (Postgres 16 + Redis 7 healthy) | Required for integration tests |

**Limitation:** Integration tests require a live Postgres at `DATABASE_URL`. They do not spin up an ephemeral DB. Worker/Redis paths are untested.

---

## Component inventory (verified)

Classification key:

1. Implemented and verified  
2. Implemented but insufficiently tested  
3. Partially implemented  
4. Schema-only / stubbed  
5. Missing  

### Monorepo scaffold

| Area | Status | Evidence |
|------|--------|----------|
| pnpm workspace, Next.js web, BullMQ worker, Drizzle db, core, shared | **1** | Root `package.json`, `apps/*`, `packages/*`, `docker-compose.yml` |
| Architecture docs | **2** | Docs match schema reasonably; claim “workspace isolation covered” overstates tests (one isolation case only) |

### Schema vs `DATA_MODEL.md`

All documented tenant tables exist in Drizzle schema and migration `packages/db/drizzle/0000_massive_harrier.sql`:

| Table | Status | Notes |
|-------|--------|-------|
| `users`, `workspaces`, `workspace_members` | **1** | Unique email/slug; membership unique `(workspace_id, user_id)` |
| `import_batches`, `import_rows`, `mapping_templates` | **1** | Provenance retained; row unique `(batch_id, row_number)` |
| `companies`, `job_postings`, `contacts`, `contact_methods`, `company_contact_relationships` | **1** | Soft delete on companies/contacts; unique normalized company name; unique contact method |
| `sender_identities`, `provider_connections` | **2** | CRUD/registry only; tokens not encrypted (documented M3) |
| `campaigns`, `campaign_steps`, `campaign_enrollments`, `channel_activities` | **2** | Working M1 paths; follow-up fields underused |
| `suppression_entries` | **4** | Table exists; **no service/UI writers or eligibility readers** |
| `email_threads`, `email_messages` | **4** | Schema only |
| `scheduled_actions` | **4** | Schema present; **no writers, scheduler, or worker consumer** |
| `domain_events`, `outbox_events` | **4** | Schema only; no transactional outbox publisher |
| `ai_runs` | **4** | Stub for M4 |
| `audit_logs` | **3** | Written on enrollment status change + activity record; not on import/campaign create |

### Auth & workspace isolation

| Concern | Status | Finding | Severity |
|---------|--------|---------|----------|
| Session JWT cookie (`sr_session`) | **2** | `apps/web/src/lib/auth.ts` — HS256, 7d expiry; embeds `workspaceId` | Medium |
| Membership check on login/switch | **2** | Login picks first membership; `switchWorkspace` checks membership | Low |
| Per-request membership re-check | **3** | `requireSession` trusts JWT `workspaceId` without re-querying `workspace_members` | **High** |
| Service-layer scoping | **2** | Core services take `workspaceId` first and filter queries | Medium |
| Nested enrollment lookup | **3** | `recordActivity` finds enrollment by `(campaignId, contactId)` **without** `workspaceId` (`packages/core/src/campaigns/service.ts` ~264–271) | Medium |
| Role restrictions | **5** | Roles stored (`owner`/`admin`/`member`) but APIs do not gate mutations by role | Medium |
| API IDOR tests | **3** | One integration test blocks cross-workspace import confirm; contacts/campaigns/activities cross-workspace not covered | High |
| Worker trust | **3** | Worker trusts job payload `workspaceId` with no auth context (`apps/worker/src/index.ts`) | Medium (internal queue) |

### CSV import

| Concern | Status | Finding | Severity |
|---------|--------|---------|----------|
| Parse + auto-map + process | **2** | `packages/core/src/import/service.ts`, `mapping.ts` | — |
| Exact company/contact dedup | **2** | Company by `normalizeName`; contact by email/LinkedIn only; name-only flagged fuzzy | — |
| Provenance on re-import | **2** | New `import_rows` retained; companies matched | — |
| Relative timestamps (`1h`, `11h`) | **3** | `discoveredAt: new Date(normalized.discoveredAt)` → Invalid Date for SimplyHired `posting_time` | **High** |
| Column aliases | **3** | Missing SimplyHired: `company_name`, `work_location`, `posting_time`, `title` as job title (alias `title` exists for jobTitle) | High |
| Observation-time binding | **5** | Relative times not anchored; re-import would drift if naively recomputed | High |
| Partial failure consistency | **3** | Per-row try/catch; batch still marked `completed` with error count; no transaction per row group | Medium |
| Concurrent upsert races | **3** | Read-then-insert without unique conflict handling on companies (unique index helps but can throw) | Medium |
| Mapping templates | **2** | Optional save on confirm; unique `(workspace_id, source_key)` | Low |
| BullMQ large import | **3** | Worker queue `csv-imports` exists; web path processes inline; enqueue path not verified in UI | Low |

### Campaigns & activities

| Concern | Status | Finding | Severity |
|---------|--------|---------|----------|
| Create campaign + default steps | **2** | LinkedIn step 0d + email step 2d | — |
| Enrollment uniqueness | **2** | `onConflictDoNothing` | — |
| Manual activity record + idempotency | **2** | Unique `(workspace_id, idempotency_key)` | — |
| Reply → enrollment `replied` | **2** | Soft status update only; **does not cancel scheduled follow-ups** (none exist yet) | High for M2 |
| Unified timeline | **2** | Ordered by `occurredAt` desc; no provider vs recorded timestamp reconciliation model | Medium |
| Channel state machine | **3** | Kinds validated; no persisted per-channel projection; aggregate enrollment status only | Medium |
| Follow-up queue UI | **3** | Lists active enrollments + `nextPermittedAction`; read-only; ignores `scheduled_actions` | High |

### Follow-up / eligibility / outbox (M2 target)

| Concern | Status |
|---------|--------|
| Eligibility engine | **5** |
| Durable `scheduled_actions` lifecycle | **4** (schema) / **5** (logic) |
| Outbox processor | **5** |
| Cross-channel policy | **5** |
| Suppression enforcement | **5** |
| Worker crash recovery / claim locking | **5** |

### BD-pipeline capabilities in SmartReach

| Capability | Status |
|------------|--------|
| SimHash near-dup | **5** |
| Explainable lead scoring | **5** |
| Contact enrichment waterfall | **5** |
| Compliance country gate | **5** (defer; document in comparison) |

---

## Verified issues (prioritized)

### P0 — Correctness / M2 blockers

1. **Relative CSV timestamps crash or store Invalid Date**  
   - Path: `packages/core/src/import/service.ts` (`discoveredAt: new Date(...)`)  
   - SimplyHired sample uses `posting_time` values like `1h`, `11h`  
   - Fix: source-aware parser + observation time + preserve raw string

2. **SimplyHired column aliases incomplete**  
   - `work_location`, `posting_time`, `company_name` need aliases  
   - `role` currently aliases to job title — for SimplyHired `role` is employment type (`Full-time`); `title` is the job title (already mapped)

3. **No follow-up durability**  
   - `scheduled_actions` unused; reply cannot cancel due work

### P1 — Security / integrity

4. **JWT workspace trust without membership revalidation**  
5. **Enrollment lookup missing `workspaceId`** in `recordActivity`  
6. **Suppression table unused** — opt-out cannot block anything  
7. **Company legal-suffix stripping** may merge distinct entities sharing a stem name (accepted M1 risk; document + optional domain disambiguation later)

### P2 — Coverage gaps

8. No web/API tests; no worker tests; no eligibility/race tests  
9. Role-based authorization not enforced  
10. Timeline lacks scheduled-action events and cancellation audit trail

---

## Recommended change sequence (executed after this audit)

1. Timestamp parser + SimplyHired aliases + fixtures  
2. Harden activity enrollment lookup + optional session membership assert  
3. Eligibility service + scheduled_actions lifecycle + outbox writers  
4. Wire activity/reply → cancel ineligible actions  
5. Follow-up queue UI over `scheduled_actions`  
6. Adapt SimHash/scoring as pure modules (suggest-only) + enrichment interfaces  
7. Integration tests for acceptance scenario  

---

## Milestone 1 functionality assessment

**Working (code + tests):** CSV import with exact dedup/provenance, contact/company CRM, campaign enroll, manual dual-channel activities, basic dashboard, session auth, one workspace isolation case.

**Documented as done but thin:** “Workspace isolation” (partial), “follow-up queue” (enrollment list only), “audit logs” (partial writers).

**Schema-ready, not operational:** suppression, scheduled_actions, outbox, domain events, email tables, AI runs.
