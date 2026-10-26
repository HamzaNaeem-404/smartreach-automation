import { and, eq, isNull, lt, sql } from "drizzle-orm";
import type { Database } from "@smartreach/db";
import {
  importBatches,
  outboxEvents,
  scheduledActions,
  suppressionEntries,
} from "@smartreach/db";
import { countUnprocessedOutbox } from "../events/outbox";

/**
 * Operational counters for dashboards / structured logs.
 * Avoids PII — counts and statuses only.
 */
export async function getOperationalMetrics(
  db: Database,
  workspaceId: string,
  opts?: { now?: Date },
) {
  const now = opts?.now ?? new Date();

  const countByStatus = async (status: string) => {
    const [row] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(scheduledActions)
      .where(
        and(
          eq(scheduledActions.workspaceId, workspaceId),
          eq(scheduledActions.status, status),
        ),
      );
    return row?.value ?? 0;
  };

  const [overdue] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(scheduledActions)
    .where(
      and(
        eq(scheduledActions.workspaceId, workspaceId),
        sql`${scheduledActions.status} IN ('pending','awaiting_approval','reserved')`,
        lt(scheduledActions.dueAt, now),
      ),
    );

  const [staleClaims] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(scheduledActions)
    .where(
      and(
        eq(scheduledActions.workspaceId, workspaceId),
        eq(scheduledActions.status, "reserved"),
        lt(scheduledActions.leaseExpiresAt, now),
      ),
    );

  const [failedImports] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(importBatches)
    .where(
      and(
        eq(importBatches.workspaceId, workspaceId),
        eq(importBatches.status, "failed"),
      ),
    );

  const [activeSuppressions] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(suppressionEntries)
    .where(
      and(
        eq(suppressionEntries.workspaceId, workspaceId),
        isNull(suppressionEntries.deletedAt),
      ),
    );

  const [suppressionCancels] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(scheduledActions)
    .where(
      and(
        eq(scheduledActions.workspaceId, workspaceId),
        eq(scheduledActions.status, "cancelled"),
        sql`${scheduledActions.cancelReason} ILIKE 'suppression:%'`,
      ),
    );

  const outboxBacklog = await countUnprocessedOutbox(db);

  return {
    workspaceId,
    evaluatedAt: now.toISOString(),
    scheduledActions: {
      pending: await countByStatus("pending"),
      awaitingApproval: await countByStatus("awaiting_approval"),
      reserved: await countByStatus("reserved"),
      blocked: await countByStatus("blocked"),
      cancelled: await countByStatus("cancelled"),
      completed: await countByStatus("completed"),
      failed: await countByStatus("failed"),
      overdue: overdue?.value ?? 0,
      staleClaims: staleClaims?.value ?? 0,
    },
    outboxBacklog,
    failedImports: failedImports?.value ?? 0,
    activeSuppressions: activeSuppressions?.value ?? 0,
    suppressionTriggeredCancellations: suppressionCancels?.value ?? 0,
  };
}

export function logOperationalEvent(
  event: string,
  fields: Record<string, string | number | boolean | null | undefined>,
) {
  // Structured, PII-minimized log line for workers / API
  const safe = Object.fromEntries(
    Object.entries(fields).filter(
      ([k]) =>
        !/email|token|password|secret|body|subject/i.test(k),
    ),
  );
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...safe }));
}
