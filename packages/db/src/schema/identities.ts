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

export const senderIdentityStatusEnum = pgEnum("sender_identity_status", [
  "pending",
  "connected",
  "disconnected",
  "disabled",
]);

export const senderChannelEnum = pgEnum("sender_channel", [
  "linkedin",
  "email",
]);

export const senderIdentities = pgTable(
  "sender_identities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    channel: senderChannelEnum("channel").notNull(),
    displayName: text("display_name").notNull(),
    persona: text("persona"),
    emailAddress: text("email_address"),
    linkedinUrl: text("linkedin_url"),
    status: senderIdentityStatusEnum("status").notNull().default("pending"),
    dailySendLimit: integer("daily_send_limit"),
    settings: jsonb("settings").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("sender_identities_ws_idx").on(t.workspaceId, t.channel),
  ],
);

export const providerConnections = pgTable(
  "provider_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    identityId: uuid("identity_id")
      .notNull()
      .references(() => senderIdentities.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    status: text("status").notNull().default("disconnected"),
    /** Encrypted in M3; plaintext never logged */
    accessTokenEncrypted: text("access_token_encrypted"),
    refreshTokenEncrypted: text("refresh_token_encrypted"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    scopes: text("scopes"),
    externalAccountId: text("external_account_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("provider_connections_identity_provider_uidx").on(
      t.identityId,
      t.provider,
    ),
  ],
);

export const senderIdentitiesRelations = relations(
  senderIdentities,
  ({ one, many }) => ({
    owner: one(users, {
      fields: [senderIdentities.ownerUserId],
      references: [users.id],
    }),
    connections: many(providerConnections),
  }),
);

export const providerConnectionsRelations = relations(
  providerConnections,
  ({ one }) => ({
    identity: one(senderIdentities, {
      fields: [providerConnections.identityId],
      references: [senderIdentities.id],
    }),
  }),
);
