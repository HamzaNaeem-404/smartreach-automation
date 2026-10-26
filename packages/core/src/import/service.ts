import { and, eq, sql } from "drizzle-orm";
import { parse } from "csv-parse/sync";
import type { Database } from "@smartreach/db";
import {
  companies,
  contacts,
  contactMethods,
  companyContactRelationships,
  importBatches,
  importRows,
  jobPostings,
  mappingTemplates,
} from "@smartreach/db";
import {
  normalizeEmail,
  normalizeLinkedInUrl,
  normalizeName,
  NotFoundError,
  parseSourceTimestamp,
  parsedTimestampToMetadata,
  splitFullName,
  ValidationError,
  type CanonicalCsvField,
} from "@smartreach/shared";
import { applyMapping, autoMapColumns } from "./mapping";

export type ImportStats = {
  totalRows: number;
  processedRows: number;
  companiesCreated: number;
  companiesMatched: number;
  contactsCreated: number;
  contactsMatched: number;
  jobPostingsCreated: number;
  errors: number;
  fuzzyCandidates: number;
};

function emptyStats(): ImportStats {
  return {
    totalRows: 0,
    processedRows: 0,
    companiesCreated: 0,
    companiesMatched: 0,
    contactsCreated: 0,
    contactsMatched: 0,
    jobPostingsCreated: 0,
    errors: 0,
    fuzzyCandidates: 0,
  };
}

export function parseCsv(content: string): {
  headers: string[];
  rows: Record<string, string>[];
} {
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as Record<string, string>[];

  if (records.length === 0) {
    throw new ValidationError("CSV contains no data rows");
  }

  const headers = Object.keys(records[0] ?? {});
  if (headers.length === 0) {
    throw new ValidationError("CSV has no headers");
  }

  return { headers, rows: records };
}

export async function createImportBatch(
  db: Database,
  input: {
    workspaceId: string;
    userId: string;
    fileName: string;
    content: string;
    sourceKey?: string;
  },
) {
  const { headers, rows } = parseCsv(input.content);
  let mapping = autoMapColumns(headers, input.sourceKey) as Record<
    string,
    string | null
  >;

  if (input.sourceKey) {
    const template = await db.query.mappingTemplates.findFirst({
      where: and(
        eq(mappingTemplates.workspaceId, input.workspaceId),
        eq(mappingTemplates.sourceKey, input.sourceKey),
      ),
    });
    if (template) {
      mapping = { ...mapping, ...template.mapping };
    }
  }

  const [batch] = await db
    .insert(importBatches)
    .values({
      workspaceId: input.workspaceId,
      uploadedByUserId: input.userId,
      fileName: input.fileName,
      sourceKey: input.sourceKey,
      status: "mapping",
      headers,
      columnMapping: mapping,
      stats: { ...emptyStats(), totalRows: rows.length },
    })
    .returning();

  if (!batch) throw new Error("Failed to create import batch");

  const rowValues = rows.map((raw, index) => ({
    workspaceId: input.workspaceId,
    batchId: batch.id,
    rowNumber: index + 1,
    rawPayload: raw,
    status: "pending",
  }));

  // Insert in chunks for large files
  const chunkSize = 500;
  for (let i = 0; i < rowValues.length; i += chunkSize) {
    await db.insert(importRows).values(rowValues.slice(i, i + chunkSize));
  }

  return {
    batch,
    preview: rows.slice(0, 10),
    suggestedMapping: mapping,
  };
}

export async function getImportBatch(
  db: Database,
  workspaceId: string,
  batchId: string,
) {
  const batch = await db.query.importBatches.findFirst({
    where: and(
      eq(importBatches.id, batchId),
      eq(importBatches.workspaceId, workspaceId),
    ),
  });
  if (!batch) throw new NotFoundError("Import batch");
  return batch;
}

export async function listImportBatches(db: Database, workspaceId: string) {
  return db.query.importBatches.findMany({
    where: eq(importBatches.workspaceId, workspaceId),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });
}

export async function confirmMappingAndProcess(
  db: Database,
  input: {
    workspaceId: string;
    batchId: string;
    mapping: Record<string, string | null>;
    saveAsTemplate?: boolean;
    templateSourceKey?: string;
  },
) {
  const batch = await getImportBatch(db, input.workspaceId, input.batchId);

  if (batch.status === "completed") {
    return batch;
  }

  await db
    .update(importBatches)
    .set({
      columnMapping: input.mapping,
      status: "processing",
      updatedAt: new Date(),
    })
    .where(eq(importBatches.id, batch.id));

  if (input.saveAsTemplate && input.templateSourceKey) {
    await db
      .insert(mappingTemplates)
      .values({
        workspaceId: input.workspaceId,
        sourceKey: input.templateSourceKey,
        name: input.templateSourceKey,
        mapping: input.mapping,
      })
      .onConflictDoUpdate({
        target: [mappingTemplates.workspaceId, mappingTemplates.sourceKey],
        set: {
          mapping: input.mapping,
          updatedAt: new Date(),
        },
      });
  }

  const stats = await processImportRows(db, {
    workspaceId: input.workspaceId,
    batchId: batch.id,
    mapping: input.mapping,
    observationTime: batch.createdAt ?? new Date(),
    sourceKey: batch.sourceKey,
  });

  const [updated] = await db
    .update(importBatches)
    .set({
      status: "completed",
      stats,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(importBatches.id, batch.id))
    .returning();

  return updated ?? batch;
}

async function findCompanyByNormalizedName(
  db: Database,
  workspaceId: string,
  normalizedName: string,
) {
  return db.query.companies.findFirst({
    where: and(
      eq(companies.workspaceId, workspaceId),
      eq(companies.normalizedName, normalizedName),
      sql`${companies.deletedAt} IS NULL`,
    ),
  });
}

async function findContactByMethod(
  db: Database,
  workspaceId: string,
  type: "email" | "linkedin",
  normalizedValue: string,
) {
  const method = await db.query.contactMethods.findFirst({
    where: and(
      eq(contactMethods.workspaceId, workspaceId),
      eq(contactMethods.type, type),
      eq(contactMethods.normalizedValue, normalizedValue),
    ),
  });
  if (!method) return null;
  return db.query.contacts.findFirst({
    where: eq(contacts.id, method.contactId),
  });
}

export async function processImportRows(
  db: Database,
  input: {
    workspaceId: string;
    batchId: string;
    mapping: Record<string, string | null>;
    observationTime?: Date;
    sourceKey?: string | null;
  },
): Promise<ImportStats> {
  const stats = emptyStats();
  const rows = await db.query.importRows.findMany({
    where: eq(importRows.batchId, input.batchId),
    orderBy: (t, { asc }) => [asc(t.rowNumber)],
  });

  stats.totalRows = rows.length;
  const observationTime = input.observationTime ?? new Date();

  for (const row of rows) {
    try {
      const normalized = applyMapping(row.rawPayload, input.mapping);
      const result = await upsertFromNormalizedRow(db, {
        workspaceId: input.workspaceId,
        normalized,
        stats,
        observationTime,
        sourceKey: input.sourceKey,
      });

      await db
        .update(importRows)
        .set({
          normalizedPayload: normalized,
          status: "processed",
          companyId: result.companyId,
          contactId: result.contactId,
          jobPostingId: result.jobPostingId,
          isDuplicate: result.wasDuplicate ? 1 : 0,
          fuzzyCandidate: result.fuzzyCandidate ? 1 : 0,
        })
        .where(eq(importRows.id, row.id));

      stats.processedRows += 1;
    } catch (err) {
      stats.errors += 1;
      await db
        .update(importRows)
        .set({
          status: "error",
          errorMessage: err instanceof Error ? err.message : "Unknown error",
        })
        .where(eq(importRows.id, row.id));
    }
  }

  return stats;
}

async function upsertFromNormalizedRow(
  db: Database,
  input: {
    workspaceId: string;
    normalized: Record<CanonicalCsvField, string | null>;
    stats: ImportStats;
    observationTime: Date;
    sourceKey?: string | null;
  },
): Promise<{
  companyId: string | null;
  contactId: string | null;
  jobPostingId: string | null;
  wasDuplicate: boolean;
  fuzzyCandidate: boolean;
}> {
  const { workspaceId, normalized, stats, observationTime } = input;
  let companyId: string | null = null;
  let contactId: string | null = null;
  let jobPostingId: string | null = null;
  let wasDuplicate = false;
  let fuzzyCandidate = false;

  const discoveredParsed = parseSourceTimestamp(
    normalized.discoveredAt,
    observationTime,
  );

  if (normalized.companyName) {
    const normalizedName = normalizeName(normalized.companyName);
    const existing = await findCompanyByNormalizedName(
      db,
      workspaceId,
      normalizedName,
    );

    if (existing) {
      companyId = existing.id;
      stats.companiesMatched += 1;
      wasDuplicate = true;
    } else {
      const [created] = await db
        .insert(companies)
        .values({
          workspaceId,
          name: normalized.companyName,
          normalizedName,
        })
        .returning();
      companyId = created?.id ?? null;
      stats.companiesCreated += 1;
    }
  }

  if (companyId && normalized.jobTitle) {
    if (normalized.jobUrl) {
      const existingJob = await db.query.jobPostings.findFirst({
        where: and(
          eq(jobPostings.workspaceId, workspaceId),
          eq(jobPostings.sourceUrl, normalized.jobUrl),
        ),
      });
      if (existingJob) {
        jobPostingId = existingJob.id;
        wasDuplicate = true;
      }
    }

    if (!jobPostingId) {
      const discoveredAt =
        discoveredParsed.absolute ??
        (discoveredParsed.status === "null" ? observationTime : null);

      const [job] = await db
        .insert(jobPostings)
        .values({
          workspaceId,
          companyId,
          title: normalized.jobTitle,
          source: normalized.source ?? input.sourceKey ?? null,
          sourceUrl: normalized.jobUrl,
          location: normalized.location,
          discoveredAt,
          rawMetadata: {
            ...normalized,
            discoveredAtParse: parsedTimestampToMetadata(discoveredParsed),
          },
        })
        .onConflictDoNothing()
        .returning();

      if (job) {
        jobPostingId = job.id;
        stats.jobPostingsCreated += 1;
      } else if (normalized.jobUrl) {
        // Re-import: keep original discoveredAt (do not recompute relative times)
        const existingJob = await db.query.jobPostings.findFirst({
          where: and(
            eq(jobPostings.workspaceId, workspaceId),
            eq(jobPostings.sourceUrl, normalized.jobUrl),
          ),
        });
        jobPostingId = existingJob?.id ?? null;
      }
    } else {
      // Existing job matched by URL — never overwrite discoveredAt with a
      // freshly resolved relative timestamp.
      wasDuplicate = true;
    }
  }

  const email = normalized.contactEmail
    ? normalizeEmail(normalized.contactEmail)
    : null;
  const linkedin = normalized.contactLinkedIn
    ? normalizeLinkedInUrl(normalized.contactLinkedIn)
    : null;

  if (email || linkedin || normalized.contactName) {
    let matchedContact =
      (linkedin
        ? await findContactByMethod(db, workspaceId, "linkedin", linkedin)
        : null) ??
      (email ? await findContactByMethod(db, workspaceId, "email", email) : null);

    if (matchedContact) {
      contactId = matchedContact.id;
      stats.contactsMatched += 1;
      wasDuplicate = true;
    } else if (normalized.contactName && !email && !linkedin) {
      // Name-only: do NOT auto-merge; create new and flag fuzzy if same name at company
      fuzzyCandidate = true;
      stats.fuzzyCandidates += 1;
    }

    if (!contactId) {
      const names = splitFullName(normalized.contactName ?? "Unknown");
      const [created] = await db
        .insert(contacts)
        .values({
          workspaceId,
          firstName: names.firstName,
          lastName: names.lastName,
          fullName: normalized.contactName ?? "Unknown",
          title: normalized.contactTitle,
        })
        .returning();
      contactId = created?.id ?? null;
      stats.contactsCreated += 1;

      if (contactId && email) {
        await db
          .insert(contactMethods)
          .values({
            workspaceId,
            contactId,
            type: "email",
            value: normalized.contactEmail!,
            normalizedValue: email,
            isPrimary: true,
            provenance: "import",
          })
          .onConflictDoNothing();
      }

      if (contactId && linkedin) {
        await db
          .insert(contactMethods)
          .values({
            workspaceId,
            contactId,
            type: "linkedin",
            value: normalized.contactLinkedIn!,
            normalizedValue: linkedin,
            isPrimary: !email,
            provenance: "import",
          })
          .onConflictDoNothing();
      }
    }

    if (contactId && companyId) {
      await db
        .insert(companyContactRelationships)
        .values({
          workspaceId,
          companyId,
          contactId,
          title: normalized.contactTitle,
          isPrimary: true,
        })
        .onConflictDoNothing();
    }
  }

  return { companyId, contactId, jobPostingId, wasDuplicate, fuzzyCandidate };
}
