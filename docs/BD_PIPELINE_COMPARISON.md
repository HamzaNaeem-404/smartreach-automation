# BD Pipeline → SmartReach Comparison

**Reference:** `/Users/hamzanaeem/Downloads/bd-pipeline.zip` (extracted for audit)  
**SmartReach target:** TypeScript modular monolith (`packages/core`, `packages/shared`, `packages/db`)

This document compares reusable algorithms and domain concepts. BD Pipeline is **not** merged wholesale.

---

## Capability matrix

| Capability | Decision | Target module |
|------------|----------|---------------|
| Exact source+id dedup | **Adapt** (already have URL uniqueness) | `core/import`, `core/crm` |
| SimHash near-duplicate | **Adapt** as suggestion only | `core/jobs/simhash.ts` |
| Skill-overlap “same need” merge | **Adapt** as related-posting candidate gen; **reject** auto-merge | `core/jobs/related.ts` |
| Explainable lead scoring | **Adapt** with new weights/versioning | `core/scoring/` |
| Keyword filters / red flags | **Adapt** | `core/scoring/filters.ts` |
| Contact enrichment waterfall | **Defer live**; **adapt** provider interfaces | `core/enrichment/` |
| Compliance country gate | **Defer** (M3+ policy pack) | `core/compliance/` (later) |
| Orchestrator run cycle | **Reject** as process model; reuse ideas in BullMQ workers | `apps/worker` |
| Airtable / Slack delivery | **Reject** | — |
| Upwork browser / extension | **Reject** | — |

---

## 1. Exact + near-duplicate job detection

### Current algorithm (`pipeline/dedup.py`, `pipeline/simhash.py`)

- Exact duplicate: `(source, source_id)`.
- Near-dup: 64-bit SimHash over word bigrams + char trigrams; Hamming ≤ 6.
- “Same hiring need”: same company + (SimHash near-dup **or** ≥60% asymmetric skill overlap) within 45 days → attach to existing Lead.

### Limitations

- Skill overlap is asymmetric and can false-positive different roles at one company with shared stack keywords.
- Auto-merging postings loses per-source provenance if not careful.
- SimHash alone is brittle on short titles without description.

### SmartReach today

- Exact: unique `(workspace_id, source_url)` when URL present (`job_postings`).
- No SimHash, no related-posting grouping, no skill arrays on jobs.

### Decision: **Adapt**

- Port SimHash to TypeScript for **candidate generation**.
- Do **not** auto-merge jobs. Preserve each source posting.
- Optional `related_posting_groups` / link table later; for this milestone store suggestions in job `rawMetadata.nearDuplicateCandidates` or a lightweight `job_posting_relations` table if needed.
- Skill overlap only when skills are present; otherwise skip.

### Schema

- Optional: `job_postings.sim_hash` (`bigint`), `skills` (`jsonb`), `job_posting_relations(parent_id, child_id, relation, score, reason)`.
- **This milestone:** compute SimHash into `rawMetadata` first to avoid blocking migration; add columns if persistence is required for queries.

### Tests

- Unit: normalize, hamming, near-dup threshold.
- Fixture: two SimplyHired-like descriptions with small edits → related; unrelated titles → not related.
- Never auto-delete/merge in tests.

---

## 2. Explainable lead scoring

### Current algorithm (`pipeline/scoring.py` + `config/scoring.yml`)

Weights (sum 100 before penalty): skill_match 40, budget 20, client_quality 20, freshness_decay 20.  
Qualify ≥55, hot ≥80. Red-flag penalty 30. Filter keyword ratio drives skill component. Upwork-centric client spend signal.

### Limitations

- Tuned for Upwork/freelance markets; not proven for SmartReach B2B CSV sources.
- Budget/client signals often absent on job boards.
- No configuration versioning or recalculation audit.

### SmartReach today

- No scoring service.

### Decision: **Adapt** (rules only, no LLM)

- Deterministic `scoreJobPosting(input, config) → { score, qualified, breakdown, configVersion }`.
- Workspace-overridable JSON config with `version` field.
- Missing data → partial credit (same spirit as Python half-caps), documented in breakdown.
- Freshness uses parsed `discoveredAt` (after timestamp fix).
- Do **not** copy numeric thresholds as “proven”; ship defaults and mark experimental.

### Module: `packages/core/src/scoring/`

### Schema

- Optional `job_postings.score`, `score_breakdown`, `score_config_version`, `scored_at`.
- Or store on demand without persistence first; persist when UI needs sort.

### Tests

- Deterministic fixtures; missing fields; red flags; version stamp on recalculation.

---

## 3. Filters

### Current (`pipeline/filters.py` + `config/filters.yml`)

Compiled keyword include/exclude + budget floors per filter name.

### Decision: **Adapt** as scoring input filters (static JSON defaults).  
UI for filter editing deferred.

---

## 4. Contact enrichment waterfall

### Current (`contact_discovery/waterfall.py`)

Apollo → Prospeo → Anymailfinder; MillionVerifier must return verified to stop. Costly paid APIs.

### Decision: **Defer live calls**. **Adapt interfaces**:

```ts
interface ContactDiscoveryProvider {
  id: string;
  findEmail(input: PersonCompanyQuery): Promise<DiscoveryCandidate | null>;
}
interface EmailVerificationProvider {
  verify(email: string): Promise<{ status: "verified" | "unverified" | "risky" | "unknown" }>;
}
```

- Support provenance, verified flag, rate-limit/cost-cap hooks, caching keys.
- No API keys required for Milestone 2; `NoopEnrichmentProvider` only.

### Module: `packages/core/src/enrichment/`

### Schema later: extend `contact_methods` with `verificationStatus`, `provider`, `verifiedAt` (partially exists: `confidence`, `provenance`).

---

## 5. Compliance gate

### Current (`compliance/gate.py`)

Country policy → email vs LinkedIn manual; CASL/UK conditional rules.

### Decision: **Defer** to a later compliance milestone. SmartReach suppression + eligibility cover operational DNC first. Document as future `core/compliance`.

---

## 6. Orchestrator

### Current (`orchestrator/run_cycle.py`)

Batch cycle across connectors → dedup → score → enrich → deliver.

### Decision: **Reject** as application architecture. SmartReach already uses request path + BullMQ. Map concepts to: import job, score job, outbox publisher, follow-up due worker.

---

## Integration order for SmartReach

1. Timestamp parsing (unblocks freshness scoring & SimplyHired import).  
2. Eligibility + scheduled follow-ups (business-critical).  
3. Scoring + SimHash pure modules with tests.  
4. Enrichment interfaces (noop).  
5. Optional persistence columns / UI for scores and related postings.
