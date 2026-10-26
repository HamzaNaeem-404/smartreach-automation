import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  index,
} from "drizzle-orm/pg-core";
import { workspaces } from "./identity";

/** Schema present in M1; processors land in M2/M3/M4 */
export const emailThreads = pgTable(
  "email_threads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    providerConnectionId: uuid("provider_connection_id"),
    providerThreadId: text("provider_thread_id"),
    subject: text("subject"),
    contactId: uuid("contact_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("email_threads_provider_uidx").on(
      t.workspaceId,
      t.providerConnectionId,
      t.providerThreadId,
    ),
  ],
);

export const emailMessages = pgTable(
  "email_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id").references(() => emailThreads.id, {
      onDelete: "cascade",
    }),
    providerMessageId: text("provider_message_id"),
    direction: text("direction"),
    fromAddress: text("from_address"),
    toAddresses: jsonb("to_addresses").$type<string[]>(),
    subject: text("subject"),
    bodyPreview: text("body_preview"),
    headers: jsonb("headers").$type<Record<string, string>>(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("email_messages_provider_uidx").on(
      t.workspaceId,
      t.providerMessageId,
    ),
  ],
);

export const scheduledActions = pgTable(
  "scheduled_actions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    enrollmentId: uuid("enrollment_id"),
    contactId: uuid("contact_id"),
    campaignId: uuid("campaign_id"),
    stepId: uuid("step_id"),
    senderIdentityId: uuid("sender_identity_id"),
    channel: text("channel"),
    actionType: text("action_type").notNull(),
    /** pending | awaiting_approval | reserved | blocked | cancelled | completed | failed */
    status: text("status").notNull().default("pending"),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    blockedReasons: jsonb("blocked_reasons").$type<string[]>(),
    cancelReason: text("cancel_reason"),
    policyVersion: text("policy_version"),
    requiresApproval: integer("requires_approval").notNull().default(1),
    attemptCount: integer("attempt_count").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    lastError: text("last_error"),
    reservedAt: timestamp("reserved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    executedAt: timestamp("executed_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("scheduled_actions_idem_uidx").on(
      t.workspaceId,
      t.idempotencyKey,
    ),
    index("scheduled_actions_due_idx").on(t.status, t.dueAt),
    index("scheduled_actions_ws_status_idx").on(t.workspaceId, t.status, t.dueAt),
    index("scheduled_actions_enrollment_idx").on(t.enrollmentId, t.status),
  ],
);

export const domainEvents = pgTable(
  "domain_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("domain_events_ws_occurred_idx").on(t.workspaceId, t.occurredAt),
  ],
);

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [
    index("outbox_events_unprocessed_idx").on(t.processedAt, t.createdAt),
  ],
);

export const aiRuns = pgTable(
  "ai_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    taskType: text("task_type").notNull(),
    model: text("model"),
    inputHash: text("input_hash"),
    status: text("status").notNull().default("pending"),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    costUsd: text("cost_usd"),
    result: jsonb("result"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("ai_runs_ws_created_idx").on(t.workspaceId, t.createdAt)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("audit_logs_ws_created_idx").on(t.workspaceId, t.createdAt)],
);
