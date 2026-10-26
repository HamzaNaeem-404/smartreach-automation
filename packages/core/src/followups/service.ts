import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { Database } from "@smartreach/db";
import {
  campaignEnrollments,
  campaignSteps,
  campaigns,
  contacts,
  scheduledActions,
  channelActivities,
} from "@smartreach/db";
import {
  ELIGIBILITY_POLICY_VERSION,
  NotFoundError,
  ValidationError,
  type Channel,
  type FollowUpQueueBucket,
} from "@smartreach/shared";
import { appendDomainEvent } from "../events/outbox";
import {
  evaluateActionEligibility,
  evaluateScheduledAction,
} from "./eligibility";

const OPEN_STATUSES = ["pending", "awaiting_approval", "reserved", "blocked"] as const;

function startOfUtcDay(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function endOfUtcDay(d: Date) {
  const s = startOfUtcDay(d);
  return new Date(s.getTime() + 86_400_000);
}

export async function scheduleFollowUp(
  db: Database,
  workspaceId: string,
  input: {
    enrollmentId: string;
    stepId?: string;
    channel: Channel;
    actionType: string;
    dueAt: Date;
    senderIdentityId?: string;
    payload?: Record<string, unknown>;
    requiresApproval?: boolean;
    idempotencyKey?: string;
    actorUserId?: string;
  },
) {
  const enrollment = await db.query.campaignEnrollments.findFirst({
    where: and(
      eq(campaignEnrollments.id, input.enrollmentId),
      eq(campaignEnrollments.workspaceId, workspaceId),
    ),
    with: { campaign: true },
  });
  if (!enrollment) throw new NotFoundError("Enrollment");

  const idempotencyKey =
    input.idempotencyKey ??
    `followup:${enrollment.id}:${input.channel}:${input.actionType}:${input.dueAt.toISOString()}`;

  const existing = await db.query.scheduledActions.findFirst({
    where: and(
      eq(scheduledActions.workspaceId, workspaceId),
      eq(scheduledActions.idempotencyKey, idempotencyKey),
    ),
  });
  if (existing) return { action: existing, created: false };

  const eligibility = await evaluateActionEligibility(db, {
    workspaceId,
    enrollmentId: enrollment.id,
    contactId: enrollment.contactId,
    campaignId: enrollment.campaignId,
    channel: input.channel,
    actionType: input.actionType,
    senderIdentityId: input.senderIdentityId,
  });

  const requiresApproval = input.requiresApproval ?? true;
  const status = !eligibility.eligible
    ? "blocked"
    : requiresApproval
      ? "awaiting_approval"
      : "pending";

  const [action] = await db
    .insert(scheduledActions)
    .values({
      workspaceId,
      enrollmentId: enrollment.id,
      contactId: enrollment.contactId,
      campaignId: enrollment.campaignId,
      stepId: input.stepId,
      senderIdentityId: input.senderIdentityId,
      channel: input.channel,
      actionType: input.actionType,
      status,
      dueAt: input.dueAt,
      idempotencyKey,
      payload: input.payload ?? {},
      blockedReasons: eligibility.blockingReasons,
      policyVersion: ELIGIBILITY_POLICY_VERSION,
      requiresApproval: requiresApproval ? 1 : 0,
    })
    .returning();

  if (!action) throw new Error("Failed to schedule follow-up");

  await db
    .update(campaignEnrollments)
    .set({
      followUpDueAt: input.dueAt,
      followUpReason: input.actionType,
      nextPermittedAction: `${input.channel}:${input.actionType}`,
      updatedAt: new Date(),
    })
    .where(eq(campaignEnrollments.id, enrollment.id));

  await appendDomainEvent(db, {
    workspaceId,
    eventType: "followup.scheduled",
    aggregateType: "scheduled_action",
    aggregateId: action.id,
    payload: {
      enrollmentId: enrollment.id,
      channel: input.channel,
      dueAt: input.dueAt.toISOString(),
      status,
    },
    actorUserId: input.actorUserId,
  });

  return { action, created: true, eligibility };
}

/** Schedule next campaign step follow-up after an activity (e.g. email sent). */
export async function scheduleNextStepFollowUp(
  db: Database,
  workspaceId: string,
  input: {
    enrollmentId: string;
    afterStepOrder?: number;
    fromTime?: Date;
    actorUserId?: string;
  },
) {
  const enrollment = await db.query.campaignEnrollments.findFirst({
    where: and(
      eq(campaignEnrollments.id, input.enrollmentId),
      eq(campaignEnrollments.workspaceId, workspaceId),
    ),
  });
  if (!enrollment) throw new NotFoundError("Enrollment");

  const steps = await db.query.campaignSteps.findMany({
    where: and(
      eq(campaignSteps.campaignId, enrollment.campaignId),
      eq(campaignSteps.workspaceId, workspaceId),
    ),
    orderBy: [asc(campaignSteps.stepOrder)],
  });

  const after = input.afterStepOrder ?? 0;
  const next = steps.find((s) => s.stepOrder > after);
  if (!next) return { action: null, created: false };

  const from = input.fromTime ?? new Date();
  const dueAt = new Date(from.getTime() + next.delayDays * 86_400_000);

  return scheduleFollowUp(db, workspaceId, {
    enrollmentId: enrollment.id,
    stepId: next.id,
    channel: next.channel,
    actionType: next.channel === "email" ? "email_followup" : "linkedin_task",
    dueAt,
    payload: {
      stepOrder: next.stepOrder,
      stepName: next.name,
      templateBody: next.templateBody,
    },
    actorUserId: input.actorUserId,
    idempotencyKey: `step:${enrollment.id}:${next.id}`,
  });
}

export async function cancelScheduledAction(
  db: Database,
  workspaceId: string,
  input: {
    actionId: string;
    reason: string;
    actorUserId?: string;
  },
) {
  const action = await db.query.scheduledActions.findFirst({
    where: and(
      eq(scheduledActions.id, input.actionId),
      eq(scheduledActions.workspaceId, workspaceId),
    ),
  });
  if (!action) throw new NotFoundError("Scheduled action");

  if (["cancelled", "completed"].includes(action.status)) {
    return { action, changed: false };
  }

  const [updated] = await db
    .update(scheduledActions)
    .set({
      status: "cancelled",
      cancelReason: input.reason,
      cancelledAt: new Date(),
      updatedAt: new Date(),
      reservedAt: null,
    })
    .where(
      and(
        eq(scheduledActions.id, action.id),
        inArray(scheduledActions.status, [...OPEN_STATUSES]),
      ),
    )
    .returning();

  if (!updated) return { action, changed: false };

  await appendDomainEvent(db, {
    workspaceId,
    eventType: "followup.cancelled",
    aggregateType: "scheduled_action",
    aggregateId: action.id,
    payload: { reason: input.reason, previousStatus: action.status },
    actorUserId: input.actorUserId,
  });

  return { action: updated, changed: true };
}

/**
 * Re-evaluate open actions for an enrollment and cancel those now ineligible
 * (e.g. after email reply).
 */
export async function invalidateIneligibleFollowUps(
  db: Database,
  workspaceId: string,
  input: {
    enrollmentId?: string;
    contactId?: string;
    reason: string;
    actorUserId?: string;
  },
) {
  const conditions = [
    eq(scheduledActions.workspaceId, workspaceId),
    inArray(scheduledActions.status, [...OPEN_STATUSES]),
  ];
  if (input.enrollmentId) {
    conditions.push(eq(scheduledActions.enrollmentId, input.enrollmentId));
  }
  if (input.contactId) {
    conditions.push(eq(scheduledActions.contactId, input.contactId));
  }

  const open = await db.query.scheduledActions.findMany({
    where: and(...conditions),
  });

  const cancelled = [];
  for (const action of open) {
    const eligibility = await evaluateActionEligibility(db, {
      workspaceId,
      enrollmentId: action.enrollmentId,
      contactId: action.contactId,
      campaignId: action.campaignId,
      channel: action.channel,
      actionType: action.actionType,
      senderIdentityId: action.senderIdentityId,
      attemptCount: action.attemptCount,
      maxAttempts: action.maxAttempts,
      status: action.status,
    });

    if (!eligibility.eligible) {
      const result = await cancelScheduledAction(db, workspaceId, {
        actionId: action.id,
        reason: `${input.reason}: ${eligibility.blockingReasons.join(",")}`,
        actorUserId: input.actorUserId,
      });
      if (result.changed) cancelled.push(result.action);
    } else if (eligibility.blockingReasons.length === 0) {
      // refresh blocked → awaiting if previously blocked for stale reasons
      if (action.status === "blocked") {
        await db
          .update(scheduledActions)
          .set({
            status: action.requiresApproval ? "awaiting_approval" : "pending",
            blockedReasons: [],
            updatedAt: new Date(),
          })
          .where(eq(scheduledActions.id, action.id));
      }
    }
  }

  return { cancelled };
}

export async function approveScheduledAction(
  db: Database,
  workspaceId: string,
  actionId: string,
  actorUserId?: string,
) {
  const evaluated = await evaluateScheduledAction(db, workspaceId, actionId);
  if (!evaluated.action) throw new NotFoundError("Scheduled action");
  if (!evaluated.eligible) {
    throw new ValidationError(
      `Action not eligible: ${evaluated.blockingReasons.join(", ")}`,
    );
  }

  const [updated] = await db
    .update(scheduledActions)
    .set({
      status: "pending",
      blockedReasons: [],
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(scheduledActions.id, actionId),
        eq(scheduledActions.workspaceId, workspaceId),
        inArray(scheduledActions.status, ["awaiting_approval", "blocked"]),
      ),
    )
    .returning();

  if (!updated) throw new ValidationError("Action cannot be approved in current state");

  await appendDomainEvent(db, {
    workspaceId,
    eventType: "followup.approved",
    aggregateType: "scheduled_action",
    aggregateId: actionId,
    payload: {},
    actorUserId,
  });

  return updated;
}

export async function completeScheduledAction(
  db: Database,
  workspaceId: string,
  input: {
    actionId: string;
    actorUserId?: string;
    note?: string;
    /** When true, skip eligibility (manual override complete) — still refuses if cancelled */
    force?: boolean;
  },
) {
  const action = await db.query.scheduledActions.findFirst({
    where: and(
      eq(scheduledActions.id, input.actionId),
      eq(scheduledActions.workspaceId, workspaceId),
    ),
  });
  if (!action) throw new NotFoundError("Scheduled action");
  if (action.status === "cancelled") {
    throw new ValidationError("Cannot complete a cancelled follow-up");
  }
  if (action.status === "completed") return { action, changed: false };

  if (!input.force) {
    const eligibility = await evaluateActionEligibility(db, {
      workspaceId,
      enrollmentId: action.enrollmentId,
      contactId: action.contactId,
      campaignId: action.campaignId,
      channel: action.channel,
      actionType: action.actionType,
      senderIdentityId: action.senderIdentityId,
      status: action.status,
    });
    if (!eligibility.eligible) {
      throw new ValidationError(
        `Cannot execute ineligible follow-up: ${eligibility.blockingReasons.join(", ")}`,
      );
    }
  }

  const [updated] = await db
    .update(scheduledActions)
    .set({
      status: "completed",
      completedAt: new Date(),
      executedAt: new Date(),
      updatedAt: new Date(),
      reservedAt: null,
      payload: {
        ...(action.payload ?? {}),
        completionNote: input.note,
      },
    })
    .where(
      and(
        eq(scheduledActions.id, action.id),
        eq(scheduledActions.workspaceId, workspaceId),
        inArray(scheduledActions.status, [
          "pending",
          "awaiting_approval",
          "reserved",
          "blocked",
        ]),
      ),
    )
    .returning();

  if (!updated) {
    throw new ValidationError("Follow-up was claimed or cancelled concurrently");
  }

  await appendDomainEvent(db, {
    workspaceId,
    eventType: "followup.completed",
    aggregateType: "scheduled_action",
    aggregateId: action.id,
    payload: { note: input.note },
    actorUserId: input.actorUserId,
  });

  return { action: updated, changed: true };
}

export async function deferScheduledAction(
  db: Database,
  workspaceId: string,
  input: { actionId: string; dueAt: Date; actorUserId?: string },
) {
  const [updated] = await db
    .update(scheduledActions)
    .set({
      dueAt: input.dueAt,
      status: "awaiting_approval",
      reservedAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(scheduledActions.id, input.actionId),
        eq(scheduledActions.workspaceId, workspaceId),
        inArray(scheduledActions.status, [...OPEN_STATUSES]),
      ),
    )
    .returning();

  if (!updated) throw new NotFoundError("Scheduled action");

  await appendDomainEvent(db, {
    workspaceId,
    eventType: "followup.deferred",
    aggregateType: "scheduled_action",
    aggregateId: updated.id,
    payload: { dueAt: input.dueAt.toISOString() },
    actorUserId: input.actorUserId,
  });

  return updated;
}

/**
 * Atomically claim due actions for worker processing (skip locked).
 * Does NOT send messages — marks reserved and returns rows for eligibility re-check.
 * Never blindly retries external sends when delivery is uncertain (M2: no send).
 */
export async function claimDueActions(
  db: Database,
  opts?: { limit?: number; now?: Date },
) {
  const now = opts?.now ?? new Date();
  const limit = opts?.limit ?? 20;
  const nowIso = now.toISOString();

  const result = await db.execute(sql`
    UPDATE scheduled_actions
    SET status = 'reserved',
        reserved_at = ${nowIso}::timestamptz,
        attempt_count = attempt_count + 1,
        updated_at = ${nowIso}::timestamptz
    WHERE id IN (
      SELECT id FROM scheduled_actions
      WHERE status = 'pending'
        AND due_at <= ${nowIso}::timestamptz
        AND attempt_count < max_attempts
      ORDER BY due_at ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  `);

  const rows = Array.isArray(result)
    ? result
    : ((result as { rows?: { id: string }[] })?.rows ?? []);
  const ids = rows
    .map((r) => (r as { id: string })?.id)
    .filter((id): id is string => Boolean(id));

  if (ids.length === 0) return [];

  return db.query.scheduledActions.findMany({
    where: inArray(scheduledActions.id, ids),
  });
}

/**
 * Process a reserved action: re-check eligibility; never blind-retry uncertain sends.
 * M2: marks completed only via manual/human path or safe no-op for linkedin tasks
 * that require approval — email auto-send is disabled.
 */
export async function processReservedAction(
  db: Database,
  workspaceId: string,
  actionId: string,
) {
  const evaluated = await evaluateScheduledAction(db, workspaceId, actionId);
  const action = evaluated.action;
  if (!action) throw new NotFoundError("Scheduled action");

  if (!evaluated.eligible) {
    await cancelScheduledAction(db, workspaceId, {
      actionId,
      reason: `auto_invalidated:${evaluated.blockingReasons.join(",")}`,
    });
    return { outcome: "cancelled" as const, eligibility: evaluated };
  }

  if (evaluated.requiresHumanApproval || action.requiresApproval) {
    await db
      .update(scheduledActions)
      .set({
        status: "awaiting_approval",
        reservedAt: null,
        updatedAt: new Date(),
        blockedReasons: ["requires_human_approval"],
      })
      .where(eq(scheduledActions.id, actionId));
    return { outcome: "awaiting_approval" as const, eligibility: evaluated };
  }

  // Safe path: no external send in M2
  await completeScheduledAction(db, workspaceId, {
    actionId,
    note: "Auto-completed (no external send)",
  });
  return { outcome: "completed" as const, eligibility: evaluated };
}

export async function listFollowUpActions(
  db: Database,
  workspaceId: string,
  opts?: { bucket?: FollowUpQueueBucket; limit?: number; now?: Date },
) {
  const now = opts?.now ?? new Date();
  const limit = opts?.limit ?? 100;
  const bucket = opts?.bucket;

  const base = [eq(scheduledActions.workspaceId, workspaceId)];

  if (!bucket) {
    base.push(inArray(scheduledActions.status, [...OPEN_STATUSES]));
  } else if (bucket === "due_today") {
    base.push(
      inArray(scheduledActions.status, [
        "pending",
        "awaiting_approval",
        "reserved",
      ]),
      gte(scheduledActions.dueAt, startOfUtcDay(now)),
      lt(scheduledActions.dueAt, endOfUtcDay(now)),
    );
  } else if (bucket === "overdue") {
    base.push(
      inArray(scheduledActions.status, [
        "pending",
        "awaiting_approval",
        "reserved",
      ]),
      lt(scheduledActions.dueAt, startOfUtcDay(now)),
    );
  } else if (bucket === "upcoming") {
    base.push(
      inArray(scheduledActions.status, ["pending", "awaiting_approval"]),
      gte(scheduledActions.dueAt, endOfUtcDay(now)),
    );
  } else if (bucket === "awaiting_approval") {
    base.push(eq(scheduledActions.status, "awaiting_approval"));
  } else if (bucket === "blocked") {
    base.push(eq(scheduledActions.status, "blocked"));
  } else if (bucket === "cancelled") {
    base.push(eq(scheduledActions.status, "cancelled"));
  } else if (bucket === "completed") {
    base.push(eq(scheduledActions.status, "completed"));
  } else if (bucket === "failed") {
    base.push(eq(scheduledActions.status, "failed"));
  }

  const rows = await db.query.scheduledActions.findMany({
    where: and(...base),
    orderBy: [asc(scheduledActions.dueAt)],
    limit,
  });

  // Attach contact / campaign / recent activity
  const contactIds = [
    ...new Set(rows.map((r) => r.contactId).filter(Boolean) as string[]),
  ];
  const campaignIds = [
    ...new Set(rows.map((r) => r.campaignId).filter(Boolean) as string[]),
  ];

  const contactRows =
    contactIds.length > 0
      ? await db.query.contacts.findMany({
          where: and(
            eq(contacts.workspaceId, workspaceId),
            inArray(contacts.id, contactIds),
          ),
          with: { methods: true, relationships: { with: { company: true } } },
        })
      : [];

  const campaignRows =
    campaignIds.length > 0
      ? await db.query.campaigns.findMany({
          where: and(
            eq(campaigns.workspaceId, workspaceId),
            inArray(campaigns.id, campaignIds),
          ),
        })
      : [];

  const contactMap = Object.fromEntries(contactRows.map((c) => [c.id, c]));
  const campaignMap = Object.fromEntries(campaignRows.map((c) => [c.id, c]));

  const enriched = [];
  for (const row of rows) {
    const eligibility = await evaluateActionEligibility(db, {
      workspaceId,
      enrollmentId: row.enrollmentId,
      contactId: row.contactId,
      campaignId: row.campaignId,
      channel: row.channel,
      actionType: row.actionType,
      senderIdentityId: row.senderIdentityId,
      status: row.status,
      attemptCount: row.attemptCount,
      maxAttempts: row.maxAttempts,
      now,
    });

    let recentActivity = null;
    if (row.contactId) {
      recentActivity = await db.query.channelActivities.findFirst({
        where: and(
          eq(channelActivities.workspaceId, workspaceId),
          eq(channelActivities.contactId, row.contactId),
        ),
        orderBy: [desc(channelActivities.occurredAt)],
      });
    }

    enriched.push({
      ...row,
      contact: row.contactId ? contactMap[row.contactId] ?? null : null,
      campaign: row.campaignId ? campaignMap[row.campaignId] ?? null : null,
      eligibility,
      recentActivity,
    });
  }

  return enriched;
}

export async function pauseCampaignFollowUps(
  db: Database,
  workspaceId: string,
  campaignId: string,
  actorUserId?: string,
) {
  await db
    .update(campaigns)
    .set({ status: "paused", updatedAt: new Date() })
    .where(
      and(eq(campaigns.id, campaignId), eq(campaigns.workspaceId, workspaceId)),
    );

  const open = await db.query.scheduledActions.findMany({
    where: and(
      eq(scheduledActions.workspaceId, workspaceId),
      eq(scheduledActions.campaignId, campaignId),
      inArray(scheduledActions.status, ["pending", "awaiting_approval", "reserved"]),
    ),
  });

  for (const action of open) {
    await db
      .update(scheduledActions)
      .set({
        status: "blocked",
        blockedReasons: ["campaign_paused"],
        updatedAt: new Date(),
        reservedAt: null,
      })
      .where(eq(scheduledActions.id, action.id));
  }

  await appendDomainEvent(db, {
    workspaceId,
    eventType: "campaign.paused",
    aggregateType: "campaign",
    aggregateId: campaignId,
    payload: { blockedActions: open.length },
    actorUserId,
  });

  return { blocked: open.length };
}

export async function resumeCampaignFollowUps(
  db: Database,
  workspaceId: string,
  campaignId: string,
  actorUserId?: string,
) {
  await db
    .update(campaigns)
    .set({ status: "active", updatedAt: new Date() })
    .where(
      and(eq(campaigns.id, campaignId), eq(campaigns.workspaceId, workspaceId)),
    );

  const blocked = await db.query.scheduledActions.findMany({
    where: and(
      eq(scheduledActions.workspaceId, workspaceId),
      eq(scheduledActions.campaignId, campaignId),
      eq(scheduledActions.status, "blocked"),
    ),
  });

  let resumed = 0;
  for (const action of blocked) {
    const eligibility = await evaluateActionEligibility(db, {
      workspaceId,
      enrollmentId: action.enrollmentId,
      contactId: action.contactId,
      campaignId: action.campaignId,
      channel: action.channel,
      actionType: action.actionType,
      senderIdentityId: action.senderIdentityId,
    });
    if (eligibility.eligible) {
      await db
        .update(scheduledActions)
        .set({
          status: action.requiresApproval ? "awaiting_approval" : "pending",
          blockedReasons: [],
          updatedAt: new Date(),
        })
        .where(eq(scheduledActions.id, action.id));
      resumed += 1;
    }
  }

  await appendDomainEvent(db, {
    workspaceId,
    eventType: "campaign.resumed",
    aggregateType: "campaign",
    aggregateId: campaignId,
    payload: { resumed },
    actorUserId,
  });

  return { resumed };
}
