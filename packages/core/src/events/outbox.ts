import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "@smartreach/db";
import { auditLogs, domainEvents, outboxEvents } from "@smartreach/db";

export type DomainEventInput = {
  workspaceId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  occurredAt?: Date;
  actorUserId?: string | null;
};

/**
 * Persist a domain event + outbox row (and optional audit) in one DB session.
 * Callers should pass a transactional `db` when atomicity with other writes is required.
 */
export async function appendDomainEvent(db: Database, input: DomainEventInput) {
  const occurredAt = input.occurredAt ?? new Date();

  const [domain] = await db
    .insert(domainEvents)
    .values({
      workspaceId: input.workspaceId,
      eventType: input.eventType,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      payload: input.payload,
      occurredAt,
    })
    .returning();

  const [outbox] = await db
    .insert(outboxEvents)
    .values({
      workspaceId: input.workspaceId,
      eventType: input.eventType,
      payload: {
        ...input.payload,
        domainEventId: domain?.id,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        occurredAt: occurredAt.toISOString(),
      },
    })
    .returning();

  if (input.actorUserId !== undefined) {
    await db.insert(auditLogs).values({
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: input.eventType,
      entityType: input.aggregateType,
      entityId: input.aggregateId,
      metadata: input.payload,
    });
  }

  return { domainEvent: domain, outboxEvent: outbox };
}

export type OutboxHandler = (event: {
  id: string;
  workspaceId: string;
  eventType: string;
  payload: Record<string, unknown>;
}) => Promise<void>;

/**
 * Claim and process unprocessed outbox rows. Marks processed_at only after
 * the handler succeeds. Safe to re-run after crashes.
 */
export async function processOutboxBatch(
  db: Database,
  handler: OutboxHandler,
  opts?: { limit?: number },
) {
  const limit = opts?.limit ?? 50;
  const rows = await db
    .select()
    .from(outboxEvents)
    .where(isNull(outboxEvents.processedAt))
    .orderBy(asc(outboxEvents.createdAt))
    .limit(limit);

  const results: { id: string; ok: boolean; error?: string }[] = [];

  for (const row of rows) {
    try {
      await handler({
        id: row.id,
        workspaceId: row.workspaceId,
        eventType: row.eventType,
        payload: (row.payload ?? {}) as Record<string, unknown>,
      });
      await db
        .update(outboxEvents)
        .set({ processedAt: new Date() })
        .where(
          and(eq(outboxEvents.id, row.id), isNull(outboxEvents.processedAt)),
        );
      results.push({ id: row.id, ok: true });
    } catch (err) {
      results.push({
        id: row.id,
        ok: false,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  return results;
}

/** Count unprocessed outbox events (recovery observability). */
export async function countUnprocessedOutbox(db: Database) {
  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(outboxEvents)
    .where(isNull(outboxEvents.processedAt));
  return row?.value ?? 0;
}
