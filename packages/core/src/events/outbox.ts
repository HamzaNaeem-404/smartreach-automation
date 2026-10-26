import { eq, isNull, sql } from "drizzle-orm";
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
 * Atomically claim unprocessed outbox rows (SKIP LOCKED), run handlers,
 * and leave failures reclaimable by clearing processed_at.
 * Handlers must be idempotent — at-least-once delivery.
 */
export async function processOutboxBatch(
  db: Database,
  handler: OutboxHandler,
  opts?: { limit?: number },
) {
  const limit = opts?.limit ?? 50;
  const nowIso = new Date().toISOString();

  // Claim by stamping processed_at inside the same UPDATE as SKIP LOCKED.
  // Failures below clear processed_at so another worker can retry.
  const claimed = await db.execute(sql`
    UPDATE outbox_events
    SET processed_at = ${nowIso}::timestamptz
    WHERE id IN (
      SELECT id FROM outbox_events
      WHERE processed_at IS NULL
      ORDER BY created_at ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, workspace_id, event_type, payload
  `);

  const claimedRows = Array.isArray(claimed)
    ? claimed
    : ((claimed as {
        rows?: {
          id: string;
          workspace_id: string;
          event_type: string;
          payload: Record<string, unknown>;
        }[];
      })?.rows ?? []);

  const results: { id: string; ok: boolean; error?: string }[] = [];

  for (const raw of claimedRows) {
    const row = raw as {
      id: string;
      workspace_id?: string;
      workspaceId?: string;
      event_type?: string;
      eventType?: string;
      payload: Record<string, unknown>;
    };
    const id = row.id;
    const workspaceId = row.workspace_id ?? row.workspaceId ?? "";
    const eventType = row.event_type ?? row.eventType ?? "";
    try {
      await handler({
        id,
        workspaceId,
        eventType,
        payload: (row.payload ?? {}) as Record<string, unknown>,
      });
      results.push({ id, ok: true });
    } catch (err) {
      await db
        .update(outboxEvents)
        .set({ processedAt: null })
        .where(eq(outboxEvents.id, id));
      results.push({
        id,
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
