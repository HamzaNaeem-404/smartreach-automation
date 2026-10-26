# Data Model

PostgreSQL is authoritative. All tenant data is scoped by `workspace_id`. Timestamps use `timestamptz`. Soft-delete is used selectively (`deleted_at`) for contacts/companies where retention matters; hard delete for ephemeral rows.

## Entity relationship (Milestone 1 core)

```
workspaces ──< workspace_members >── users
     │
     ├──< import_batches ──< import_rows
     ├──< companies ──< job_postings
     │       └──< company_contact_relationships >── contacts ──< contact_methods
     ├──< sender_identities ──< provider_connections
     ├──< campaigns ──< campaign_steps
     │       └──< campaign_enrollments ──< channel_activities
     ├──< suppression_entries
     ├──< domain_events / outbox_events   (schema M1, processors M2)
     ├──< ai_runs                         (schema stub M1, use M4)
     └──< audit_logs
```

## Tables

### Identity & tenancy

| Table | Purpose | Key constraints |
|-------|---------|-----------------|
| `users` | Global user accounts | unique `email` |
| `workspaces` | Tenant | unique `slug` |
| `workspace_members` | Membership + role | unique `(workspace_id, user_id)` |

### Ingestion

| Table | Purpose | Key constraints |
|-------|---------|-----------------|
| `import_batches` | One upload | `workspace_id`, status, stats JSON |
| `import_rows` | Raw + normalized row | unique `(batch_id, row_number)`; `raw_payload` jsonb; link to company/contact when resolved |
| `mapping_templates` | Reusable column maps per source | unique `(workspace_id, source_key)` |

### CRM

| Table | Purpose | Key constraints |
|-------|---------|-----------------|
| `companies` | Canonical company | unique `(workspace_id, normalized_name)` where not deleted |
| `job_postings` | Roles discovered | `company_id`, source URL; unique `(workspace_id, source_url)` when URL present |
| `contacts` | Decision-makers | never merge on name alone |
| `contact_methods` | Emails / LinkedIn URLs | unique `(workspace_id, type, normalized_value)` |
| `company_contact_relationships` | Employment link | unique `(company_id, contact_id)` |

**Identity matching order (deterministic):**
1. Exact LinkedIn URL (`contact_methods.type = linkedin`)
2. Exact email (`contact_methods.type = email`)
3. Fuzzy name+company → review queue (flag only; no auto-merge)

### Outreach

| Table | Purpose | Key constraints |
|-------|---------|-----------------|
| `sender_identities` | LinkedIn persona vs email identity | `channel`, `owner_user_id`, status |
| `provider_connections` | OAuth tokens (encrypted later) | unique `(identity_id, provider)` |
| `campaigns` | Outreach program | `workspace_id` |
| `campaign_steps` | Sequence definition | ordered per campaign |
| `campaign_enrollments` | Contact in campaign | unique `(campaign_id, contact_id)` |
| `channel_activities` | Per-channel events | `idempotency_key` unique per workspace |
| `suppression_entries` | Global/campaign do-not-contact | unique scope keys |

### Email (schema early; adapters M3)

| Table | Purpose |
|-------|---------|
| `email_threads` | Provider thread linkage |
| `email_messages` | Messages + headers; unique provider message id per connection |

### Scheduling & events (schema M1; engine M2)

| Table | Purpose | Key constraints |
|-------|---------|-----------------|
| `scheduled_actions` | Due work | unique `idempotency_key` |
| `domain_events` | Append-only domain facts | |
| `outbox_events` | Reliable publish | processed_at |
| `ai_runs` | AI invocation accounting | |
| `audit_logs` | Sensitive mutations | |

## Status enums (M1)

**Import batch:** `pending` → `mapping` → `processing` → `completed` | `failed`

**Campaign enrollment aggregate:** `active` | `paused` | `replied` | `interested` | `not_interested` | `meeting_booked` | `do_not_contact` | `completed` | `stopped`

**LinkedIn activity kinds:** `invitation_pending` | `invitation_sent` | `invitation_accepted` | `invitation_declined` | `invitation_unknown` | `message_sent` | `reply_received` | `manual_note`

**Email activity kinds:** `draft` | `approved` | `sent` | `replied` | `bounced` | `failed` | `manual_note`

## Indexes (critical)

- `(workspace_id, created_at)` on activity and enrollment lists
- `(workspace_id, normalized_name)` on companies
- `(workspace_id, type, normalized_value)` unique on contact_methods
- `(campaign_id, status)` on enrollments
- `(workspace_id, idempotency_key)` unique on channel_activities
- `(batch_id, row_number)` on import_rows

## Duplicate & provenance rules

- Importing a duplicate company updates/links the existing company; `import_rows` still store the original payload and point at the resolved `company_id`.
- Contact merge (future UI) must re-point FKs and keep both `import_rows` histories.
- Webhook/event duplicates (M3) are rejected via `idempotency_key` / provider message id uniqueness.

## Workspace isolation

Every tenant table includes `workspace_id` (or inherits via parent FK that is workspace-scoped). Application services require `workspaceId` as the first argument after auth context.
