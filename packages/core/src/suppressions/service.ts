import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import type { Database } from "@smartreach/db";
import { contactMethods, contacts, suppressionEntries } from "@smartreach/db";
import {
  normalizeEmail,
  normalizeLinkedInUrl,
  NotFoundError,
  ValidationError,
} from "@smartreach/shared";
import { appendDomainEvent } from "../events/outbox";
import { invalidateIneligibleFollowUps } from "../followups/service";

export type SuppressionChannel = "all" | "email" | "linkedin";
export type SuppressionOrigin =
  | "manual"
  | "unsubscribe"
  | "hard_bounce"
  | "import"
  | "system";

export async function listSuppressions(
  db: Database,
  workspaceId: string,
  opts?: {
    search?: string;
    channel?: SuppressionChannel;
    origin?: SuppressionOrigin;
    includeDeleted?: boolean;
    limit?: number;
    offset?: number;
  },
) {
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;
  const conditions = [eq(suppressionEntries.workspaceId, workspaceId)];
  if (!opts?.includeDeleted) {
    conditions.push(isNull(suppressionEntries.deletedAt));
  }
  if (opts?.channel) {
    conditions.push(eq(suppressionEntries.channel, opts.channel));
  }
  if (opts?.origin) {
    conditions.push(eq(suppressionEntries.origin, opts.origin));
  }
  if (opts?.search) {
    const q = `%${opts.search}%`;
    conditions.push(
      or(
        ilike(suppressionEntries.email, q),
        ilike(suppressionEntries.linkedinUrl, q),
        ilike(suppressionEntries.reason, q),
      )!,
    );
  }

  return db.query.suppressionEntries.findMany({
    where: and(...conditions),
    orderBy: [desc(suppressionEntries.createdAt)],
    limit,
    offset,
  });
}

export async function getContactSuppressions(
  db: Database,
  workspaceId: string,
  contactId: string,
) {
  return db.query.suppressionEntries.findMany({
    where: and(
      eq(suppressionEntries.workspaceId, workspaceId),
      eq(suppressionEntries.contactId, contactId),
      isNull(suppressionEntries.deletedAt),
    ),
    orderBy: [desc(suppressionEntries.createdAt)],
  });
}

/**
 * Create or revive a suppression, cancel affected follow-ups, emit audit/domain events.
 */
export async function createSuppression(
  db: Database,
  workspaceId: string,
  input: {
    scope?: "global" | "campaign";
    channel?: SuppressionChannel;
    origin?: SuppressionOrigin;
    campaignId?: string;
    contactId?: string;
    email?: string;
    linkedinUrl?: string;
    reason: string;
    actorUserId?: string;
  },
) {
  const scope = input.scope ?? "global";
  const channel = input.channel ?? "all";
  const origin = input.origin ?? "manual";

  if (!input.contactId && !input.email && !input.linkedinUrl) {
    throw new ValidationError(
      "Suppression requires contactId, email, or linkedinUrl",
    );
  }
  if (scope === "campaign" && !input.campaignId) {
    throw new ValidationError("Campaign-scoped suppression requires campaignId");
  }

  let contactId = input.contactId ?? null;
  let email = input.email ? normalizeEmail(input.email) : null;
  let linkedinUrl = input.linkedinUrl
    ? normalizeLinkedInUrl(input.linkedinUrl)
    : null;

  // Resolve contact methods when only contactId given
  if (contactId && (!email || !linkedinUrl)) {
    const methods = await db.query.contactMethods.findMany({
      where: and(
        eq(contactMethods.workspaceId, workspaceId),
        eq(contactMethods.contactId, contactId),
      ),
    });
    email =
      email ??
      methods.find((m) => m.type === "email")?.normalizedValue ??
      null;
    linkedinUrl =
      linkedinUrl ??
      methods.find((m) => m.type === "linkedin")?.normalizedValue ??
      null;
  }

  // Resolve contact from email/linkedin when missing
  if (!contactId && (email || linkedinUrl)) {
    const method = await db.query.contactMethods.findFirst({
      where: and(
        eq(contactMethods.workspaceId, workspaceId),
        email
          ? and(
              eq(contactMethods.type, "email"),
              eq(contactMethods.normalizedValue, email),
            )
          : and(
              eq(contactMethods.type, "linkedin"),
              eq(contactMethods.normalizedValue, linkedinUrl!),
            ),
      ),
    });
    contactId = method?.contactId ?? null;
  }

  if (contactId) {
    await db.query.contacts.findFirst({
      where: and(
        eq(contacts.id, contactId),
        eq(contacts.workspaceId, workspaceId),
      ),
    }).then((c) => {
      if (!c) throw new NotFoundError("Contact");
    });
  }

  // Soft-deleted match → revive
  if (contactId) {
    const existing = await db.query.suppressionEntries.findFirst({
      where: and(
        eq(suppressionEntries.workspaceId, workspaceId),
        eq(suppressionEntries.contactId, contactId),
        eq(suppressionEntries.channel, channel),
        eq(suppressionEntries.scope, scope),
      ),
    });
    if (existing && !existing.deletedAt) {
      return { suppression: existing, created: false, cancelled: 0 };
    }
    if (existing?.deletedAt) {
      const [revived] = await db
        .update(suppressionEntries)
        .set({
          deletedAt: null,
          reason: input.reason,
          origin,
          email,
          linkedinUrl,
          campaignId: input.campaignId,
          createdByUserId: input.actorUserId,
          updatedAt: new Date(),
        })
        .where(eq(suppressionEntries.id, existing.id))
        .returning();
      const cancelled = await cancelAffected(db, workspaceId, {
        contactId,
        reason: `suppression:${origin}`,
        actorUserId: input.actorUserId,
      });
      await appendDomainEvent(db, {
        workspaceId,
        eventType: "suppression.revived",
        aggregateType: "suppression_entry",
        aggregateId: existing.id,
        payload: { channel, origin, reason: input.reason },
        actorUserId: input.actorUserId,
      });
      return { suppression: revived, created: true, cancelled };
    }
  }

  const [row] = await db
    .insert(suppressionEntries)
    .values({
      workspaceId,
      scope,
      channel,
      origin,
      campaignId: input.campaignId,
      contactId,
      email,
      linkedinUrl,
      reason: input.reason,
      createdByUserId: input.actorUserId,
    })
    .returning();

  if (!row) throw new Error("Failed to create suppression");

  const cancelled = await cancelAffected(db, workspaceId, {
    contactId: contactId ?? undefined,
    reason: `suppression:${origin}:${row.id}`,
    actorUserId: input.actorUserId,
  });

  await appendDomainEvent(db, {
    workspaceId,
    eventType: "suppression.created",
    aggregateType: "suppression_entry",
    aggregateId: row.id,
    payload: {
      channel,
      origin,
      scope,
      contactId,
      reason: input.reason,
      cancelledActions: cancelled,
    },
    actorUserId: input.actorUserId,
  });

  return { suppression: row, created: true, cancelled };
}

async function cancelAffected(
  db: Database,
  workspaceId: string,
  input: { contactId?: string; reason: string; actorUserId?: string },
) {
  if (!input.contactId) return 0;
  const { cancelled } = await invalidateIneligibleFollowUps(db, workspaceId, {
    contactId: input.contactId,
    reason: input.reason,
    actorUserId: input.actorUserId,
  });
  return cancelled.length;
}

export async function removeSuppression(
  db: Database,
  workspaceId: string,
  input: {
    suppressionId: string;
    reason?: string;
    actorUserId?: string;
  },
) {
  const existing = await db.query.suppressionEntries.findFirst({
    where: and(
      eq(suppressionEntries.id, input.suppressionId),
      eq(suppressionEntries.workspaceId, workspaceId),
      isNull(suppressionEntries.deletedAt),
    ),
  });
  if (!existing) throw new NotFoundError("Suppression");

  const [updated] = await db
    .update(suppressionEntries)
    .set({
      deletedAt: new Date(),
      updatedAt: new Date(),
      reason: input.reason
        ? `${existing.reason ?? ""} | removed: ${input.reason}`
        : existing.reason,
    })
    .where(eq(suppressionEntries.id, existing.id))
    .returning();

  await appendDomainEvent(db, {
    workspaceId,
    eventType: "suppression.removed",
    aggregateType: "suppression_entry",
    aggregateId: existing.id,
    payload: { reason: input.reason },
    actorUserId: input.actorUserId,
  });

  return updated;
}

export async function countActiveSuppressions(db: Database, workspaceId: string) {
  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(suppressionEntries)
    .where(
      and(
        eq(suppressionEntries.workspaceId, workspaceId),
        isNull(suppressionEntries.deletedAt),
      ),
    );
  return row?.value ?? 0;
}
