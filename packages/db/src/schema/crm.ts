import { relations, sql } from "drizzle-orm";
import {
  boolean,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  index,
} from "drizzle-orm/pg-core";
import { workspaces, users } from "./identity";

export const contactMethodTypeEnum = pgEnum("contact_method_type", [
  "email",
  "linkedin",
  "phone",
]);

export const companies = pgTable(
  "companies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    domain: text("domain"),
    website: text("website"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("companies_ws_norm_name_uidx")
      .on(t.workspaceId, t.normalizedName)
      .where(sql`${t.deletedAt} IS NULL`),
    index("companies_ws_created_idx").on(t.workspaceId, t.createdAt),
  ],
);

export const jobPostings = pgTable(
  "job_postings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    source: text("source"),
    sourceUrl: text("source_url"),
    location: text("location"),
    discoveredAt: timestamp("discovered_at", { withTimezone: true }),
    rawMetadata: jsonb("raw_metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("job_postings_ws_source_url_uidx")
      .on(t.workspaceId, t.sourceUrl)
      .where(sql`${t.sourceUrl} IS NOT NULL`),
    index("job_postings_company_idx").on(t.companyId),
    index("job_postings_ws_created_idx").on(t.workspaceId, t.createdAt),
  ],
);

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    firstName: text("first_name"),
    lastName: text("last_name"),
    fullName: text("full_name"),
    title: text("title"),
    notes: text("notes"),
    ownerUserId: uuid("owner_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    matchConfidence: numeric("match_confidence", { precision: 4, scale: 3 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("contacts_ws_created_idx").on(t.workspaceId, t.createdAt),
    index("contacts_ws_name_idx").on(t.workspaceId, t.fullName),
  ],
);

export const contactMethods = pgTable(
  "contact_methods",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    type: contactMethodTypeEnum("type").notNull(),
    value: text("value").notNull(),
    normalizedValue: text("normalized_value").notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    confidence: numeric("confidence", { precision: 4, scale: 3 }),
    provenance: text("provenance"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("contact_methods_ws_type_value_uidx").on(
      t.workspaceId,
      t.type,
      t.normalizedValue,
    ),
    index("contact_methods_contact_idx").on(t.contactId),
  ],
);

export const companyContactRelationships = pgTable(
  "company_contact_relationships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    title: text("title"),
    isPrimary: boolean("is_primary").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("company_contact_rel_uidx").on(t.companyId, t.contactId),
  ],
);

export const companiesRelations = relations(companies, ({ many }) => ({
  jobPostings: many(jobPostings),
  relationships: many(companyContactRelationships),
}));

export const jobPostingsRelations = relations(jobPostings, ({ one }) => ({
  company: one(companies, {
    fields: [jobPostings.companyId],
    references: [companies.id],
  }),
}));

export const contactsRelations = relations(contacts, ({ many }) => ({
  methods: many(contactMethods),
  relationships: many(companyContactRelationships),
}));

export const contactMethodsRelations = relations(contactMethods, ({ one }) => ({
  contact: one(contacts, {
    fields: [contactMethods.contactId],
    references: [contacts.id],
  }),
}));

export const companyContactRelationshipsRelations = relations(
  companyContactRelationships,
  ({ one }) => ({
    company: one(companies, {
      fields: [companyContactRelationships.companyId],
      references: [companies.id],
    }),
    contact: one(contacts, {
      fields: [companyContactRelationships.contactId],
      references: [contacts.id],
    }),
  }),
);
