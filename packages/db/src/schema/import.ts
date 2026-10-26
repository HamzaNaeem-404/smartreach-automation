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
import { companies, contacts, jobPostings } from "./crm";

export const importBatchStatusEnum = pgEnum("import_batch_status", [
  "pending",
  "mapping",
  "processing",
  "completed",
  "failed",
]);

export const importBatches = pgTable(
  "import_batches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    uploadedByUserId: uuid("uploaded_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    fileName: text("file_name").notNull(),
    sourceKey: text("source_key"),
    status: importBatchStatusEnum("status").notNull().default("pending"),
    columnMapping: jsonb("column_mapping").$type<Record<string, string | null>>(),
    headers: jsonb("headers").$type<string[]>(),
    stats: jsonb("stats").$type<{
      totalRows?: number;
      processedRows?: number;
      companiesCreated?: number;
      companiesMatched?: number;
      contactsCreated?: number;
      contactsMatched?: number;
      jobPostingsCreated?: number;
      errors?: number;
      fuzzyCandidates?: number;
    }>(),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("import_batches_ws_created_idx").on(t.workspaceId, t.createdAt)],
);

export const importRows = pgTable(
  "import_rows",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => importBatches.id, { onDelete: "cascade" }),
    rowNumber: integer("row_number").notNull(),
    rawPayload: jsonb("raw_payload").$type<Record<string, string>>().notNull(),
    normalizedPayload: jsonb("normalized_payload").$type<
      Record<string, string | null>
    >(),
    status: text("status").notNull().default("pending"),
    errorMessage: text("error_message"),
    companyId: uuid("company_id").references(() => companies.id, {
      onDelete: "set null",
    }),
    contactId: uuid("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    jobPostingId: uuid("job_posting_id").references(() => jobPostings.id, {
      onDelete: "set null",
    }),
    isDuplicate: integer("is_duplicate").notNull().default(0),
    fuzzyCandidate: integer("fuzzy_candidate").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("import_rows_batch_row_uidx").on(t.batchId, t.rowNumber),
    index("import_rows_batch_idx").on(t.batchId),
  ],
);

export const mappingTemplates = pgTable(
  "mapping_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sourceKey: text("source_key").notNull(),
    name: text("name").notNull(),
    mapping: jsonb("mapping")
      .$type<Record<string, string | null>>()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("mapping_templates_ws_source_uidx").on(
      t.workspaceId,
      t.sourceKey,
    ),
  ],
);

export const importBatchesRelations = relations(importBatches, ({ many }) => ({
  rows: many(importRows),
}));

export const importRowsRelations = relations(importRows, ({ one }) => ({
  batch: one(importBatches, {
    fields: [importRows.batchId],
    references: [importBatches.id],
  }),
}));
