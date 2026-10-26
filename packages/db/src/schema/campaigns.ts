import { relations } from "drizzle-orm";
import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  index,
} from "drizzle-orm/pg-core";
import { workspaces, users } from "./identity";
import { contacts } from "./crm";
import { senderIdentities } from "./identities";

export const channelEnum = pgEnum("channel", ["linkedin", "email"]);

export const enrollmentStatusEnum = pgEnum("enrollment_status", [
  "active",
  "paused",
  "replied",
  "interested",
  "not_interested",
  "meeting_booked",
  "do_not_contact",
  "completed",
  "stopped",
]);

export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status").notNull().default("draft"),
    ownerUserId: uuid("owner_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("campaigns_ws_created_idx").on(t.workspaceId, t.createdAt)],
);

export const campaignSteps = pgTable(
  "campaign_steps",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    stepOrder: integer("step_order").notNull(),
    channel: channelEnum("channel").notNull(),
    name: text("name").notNull(),
    delayDays: integer("delay_days").notNull().default(0),
    templateBody: text("template_body"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("campaign_steps_order_uidx").on(t.campaignId, t.stepOrder),
  ],
);

export const campaignEnrollments = pgTable(
  "campaign_enrollments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    status: enrollmentStatusEnum("status").notNull().default("active"),
    assignedUserId: uuid("assigned_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    followUpDueAt: timestamp("follow_up_due_at", { withTimezone: true }),
    followUpReason: text("follow_up_reason"),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
    nextPermittedAction: text("next_permitted_action"),
    enrolledAt: timestamp("enrolled_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("campaign_enrollments_uidx").on(t.campaignId, t.contactId),
    index("campaign_enrollments_status_idx").on(t.campaignId, t.status),
    index("campaign_enrollments_ws_idx").on(t.workspaceId, t.status),
  ],
);

export const channelActivities = pgTable(
  "channel_activities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").references(() => campaigns.id, {
      onDelete: "set null",
    }),
    enrollmentId: uuid("enrollment_id").references(
      () => campaignEnrollments.id,
      { onDelete: "set null" },
    ),
    senderIdentityId: uuid("sender_identity_id").references(
      () => senderIdentities.id,
      { onDelete: "set null" },
    ),
    channel: channelEnum("channel").notNull(),
    kind: text("kind").notNull(),
    subject: text("subject"),
    body: text("body"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    idempotencyKey: text("idempotency_key").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    recordedByUserId: uuid("recorded_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("channel_activities_ws_idem_uidx").on(
      t.workspaceId,
      t.idempotencyKey,
    ),
    index("channel_activities_contact_idx").on(t.contactId, t.occurredAt),
    index("channel_activities_ws_created_idx").on(t.workspaceId, t.createdAt),
  ],
);

export const suppressionScopeEnum = pgEnum("suppression_scope", [
  "global",
  "campaign",
]);

export const suppressionEntries = pgTable(
  "suppression_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    scope: suppressionScopeEnum("scope").notNull().default("global"),
    campaignId: uuid("campaign_id").references(() => campaigns.id, {
      onDelete: "cascade",
    }),
    contactId: uuid("contact_id").references(() => contacts.id, {
      onDelete: "cascade",
    }),
    email: text("email"),
    linkedinUrl: text("linkedin_url"),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("suppression_ws_idx").on(t.workspaceId, t.scope),
  ],
);

export const campaignsRelations = relations(campaigns, ({ many }) => ({
  steps: many(campaignSteps),
  enrollments: many(campaignEnrollments),
}));

export const campaignStepsRelations = relations(campaignSteps, ({ one }) => ({
  campaign: one(campaigns, {
    fields: [campaignSteps.campaignId],
    references: [campaigns.id],
  }),
}));

export const campaignEnrollmentsRelations = relations(
  campaignEnrollments,
  ({ one, many }) => ({
    campaign: one(campaigns, {
      fields: [campaignEnrollments.campaignId],
      references: [campaigns.id],
    }),
    contact: one(contacts, {
      fields: [campaignEnrollments.contactId],
      references: [contacts.id],
    }),
    activities: many(channelActivities),
  }),
);

export const channelActivitiesRelations = relations(
  channelActivities,
  ({ one }) => ({
    contact: one(contacts, {
      fields: [channelActivities.contactId],
      references: [contacts.id],
    }),
    enrollment: one(campaignEnrollments, {
      fields: [channelActivities.enrollmentId],
      references: [campaignEnrollments.id],
    }),
  }),
);
