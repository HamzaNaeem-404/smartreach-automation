import { and, desc, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Database } from "@smartreach/db";
import {
  campaigns,
  campaignSteps,
  campaignEnrollments,
  channelActivities,
  contacts,
  auditLogs,
} from "@smartreach/db";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  type Channel,
  type EnrollmentStatus,
  type ActivityKind,
} from "@smartreach/shared";
import {
  invalidateIneligibleFollowUps,
  scheduleNextStepFollowUp,
} from "../followups/service";
import { appendDomainEvent } from "../events/outbox";
import { createSuppression } from "../suppressions/service";

const REPLY_KINDS = new Set(["reply_received", "replied"]);
const DNC_KINDS = new Set(["bounced"]);

export async function listCampaigns(db: Database, workspaceId: string) {
  return db.query.campaigns.findMany({
    where: eq(campaigns.workspaceId, workspaceId),
    orderBy: [desc(campaigns.createdAt)],
    with: {
      enrollments: true,
      steps: true,
    },
  });
}

export async function getCampaign(
  db: Database,
  workspaceId: string,
  campaignId: string,
) {
  const campaign = await db.query.campaigns.findFirst({
    where: and(
      eq(campaigns.id, campaignId),
      eq(campaigns.workspaceId, workspaceId),
    ),
    with: {
      steps: true,
      enrollments: {
        with: { contact: { with: { methods: true } } },
      },
    },
  });
  if (!campaign) throw new NotFoundError("Campaign");
  return campaign;
}

export async function createCampaign(
  db: Database,
  workspaceId: string,
  input: {
    name: string;
    description?: string;
    ownerUserId?: string;
  },
) {
  const [campaign] = await db
    .insert(campaigns)
    .values({
      workspaceId,
      name: input.name,
      description: input.description,
      ownerUserId: input.ownerUserId,
      status: "active",
    })
    .returning();

  if (!campaign) throw new Error("Failed to create campaign");

  await db.insert(campaignSteps).values([
    {
      workspaceId,
      campaignId: campaign.id,
      stepOrder: 1,
      channel: "linkedin",
      name: "LinkedIn invitation",
      delayDays: 0,
    },
    {
      workspaceId,
      campaignId: campaign.id,
      stepOrder: 2,
      channel: "email",
      name: "Intro email",
      delayDays: 2,
    },
    {
      workspaceId,
      campaignId: campaign.id,
      stepOrder: 3,
      channel: "email",
      name: "Email follow-up",
      delayDays: 3,
    },
  ]);

  return getCampaign(db, workspaceId, campaign.id);
}

export async function enrollContacts(
  db: Database,
  workspaceId: string,
  input: {
    campaignId: string;
    contactIds: string[];
    assignedUserId?: string;
  },
) {
  await getCampaign(db, workspaceId, input.campaignId);

  const existingContacts = await db.query.contacts.findMany({
    where: and(
      eq(contacts.workspaceId, workspaceId),
      inArray(contacts.id, input.contactIds),
    ),
  });

  if (existingContacts.length !== input.contactIds.length) {
    throw new ValidationError("One or more contacts not found in workspace");
  }

  const enrolled = [];
  const skipped = [];

  for (const contactId of input.contactIds) {
    const [row] = await db
      .insert(campaignEnrollments)
      .values({
        workspaceId,
        campaignId: input.campaignId,
        contactId,
        status: "active",
        assignedUserId: input.assignedUserId,
        nextPermittedAction: "linkedin_invite",
      })
      .onConflictDoNothing()
      .returning();

    if (row) enrolled.push(row);
    else skipped.push(contactId);
  }

  return { enrolled, skipped };
}

export async function updateEnrollmentStatus(
  db: Database,
  workspaceId: string,
  input: {
    enrollmentId: string;
    status: EnrollmentStatus;
    reason?: string;
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

  const [updated] = await db
    .update(campaignEnrollments)
    .set({
      status: input.status,
      followUpReason: input.reason,
      updatedAt: new Date(),
    })
    .where(eq(campaignEnrollments.id, enrollment.id))
    .returning();

  await db.insert(auditLogs).values({
    workspaceId,
    actorUserId: input.actorUserId,
    action: "enrollment.status_changed",
    entityType: "campaign_enrollment",
    entityId: enrollment.id,
    metadata: {
      from: enrollment.status,
      to: input.status,
      reason: input.reason,
    },
  });

  return updated;
}

export async function recordActivity(
  db: Database,
  workspaceId: string,
  input: {
    contactId: string;
    campaignId?: string;
    enrollmentId?: string;
    channel: Channel;
    kind: ActivityKind;
    subject?: string;
    body?: string;
    occurredAt?: Date;
    idempotencyKey?: string;
    metadata?: Record<string, unknown>;
    recordedByUserId?: string;
    senderIdentityId?: string;
  },
) {
  const contact = await db.query.contacts.findFirst({
    where: and(
      eq(contacts.id, input.contactId),
      eq(contacts.workspaceId, workspaceId),
    ),
  });
  if (!contact) throw new NotFoundError("Contact");

  if (input.channel === "linkedin") {
    const linkedinKinds = [
      "invitation_pending",
      "invitation_sent",
      "invitation_accepted",
      "invitation_declined",
      "invitation_unknown",
      "message_sent",
      "reply_received",
      "manual_note",
    ];
    if (!linkedinKinds.includes(input.kind)) {
      throw new ValidationError(
        `Kind ${input.kind} is not valid for LinkedIn channel`,
      );
    }
  } else {
    const emailKinds = [
      "draft",
      "approved",
      "sent",
      "replied",
      "bounced",
      "failed",
      "manual_note",
    ];
    if (!emailKinds.includes(input.kind)) {
      throw new ValidationError(
        `Kind ${input.kind} is not valid for email channel`,
      );
    }
  }

  const idempotencyKey =
    input.idempotencyKey ??
    `manual:${input.channel}:${input.kind}:${input.contactId}:${randomUUID()}`;

  const existing = await db.query.channelActivities.findFirst({
    where: and(
      eq(channelActivities.workspaceId, workspaceId),
      eq(channelActivities.idempotencyKey, idempotencyKey),
    ),
  });
  if (existing) {
    return { activity: existing, duplicate: true };
  }

  let enrollmentId = input.enrollmentId;
  if (!enrollmentId && input.campaignId) {
    const enrollment = await db.query.campaignEnrollments.findFirst({
      where: and(
        eq(campaignEnrollments.workspaceId, workspaceId),
        eq(campaignEnrollments.campaignId, input.campaignId),
        eq(campaignEnrollments.contactId, input.contactId),
      ),
    });
    enrollmentId = enrollment?.id;
  }

  if (enrollmentId) {
    const enrollment = await db.query.campaignEnrollments.findFirst({
      where: and(
        eq(campaignEnrollments.id, enrollmentId),
        eq(campaignEnrollments.workspaceId, workspaceId),
      ),
    });
    if (!enrollment) {
      throw new NotFoundError("Enrollment");
    }
  }

  const [activity] = await db
    .insert(channelActivities)
    .values({
      workspaceId,
      contactId: input.contactId,
      campaignId: input.campaignId,
      enrollmentId,
      senderIdentityId: input.senderIdentityId,
      channel: input.channel,
      kind: input.kind,
      subject: input.subject,
      body: input.body,
      metadata: input.metadata,
      idempotencyKey,
      occurredAt: input.occurredAt ?? new Date(),
      recordedByUserId: input.recordedByUserId,
    })
    .returning();

  if (!activity) throw new ConflictError("Failed to record activity");

  if (enrollmentId) {
    const patch: Partial<typeof campaignEnrollments.$inferInsert> = {
      lastActivityAt: activity.occurredAt,
      updatedAt: new Date(),
    };

    if (REPLY_KINDS.has(input.kind)) {
      patch.status = "replied";
      patch.nextPermittedAction = "human_review";
    } else if (input.kind === "invitation_accepted") {
      patch.nextPermittedAction = "linkedin_message_or_email";
    } else if (DNC_KINDS.has(input.kind)) {
      patch.status = "do_not_contact";
      patch.nextPermittedAction = "none";
    }

    await db
      .update(campaignEnrollments)
      .set(patch)
      .where(
        and(
          eq(campaignEnrollments.id, enrollmentId),
          eq(campaignEnrollments.workspaceId, workspaceId),
        ),
      );

    // After a successful email send, schedule the next campaign step (follow-up)
    if (input.channel === "email" && input.kind === "sent") {
      const metaStepOrder =
        typeof input.metadata?.stepOrder === "number"
          ? input.metadata.stepOrder
          : 2;
      await scheduleNextStepFollowUp(db, workspaceId, {
        enrollmentId,
        afterStepOrder: metaStepOrder,
        fromTime: activity.occurredAt,
        actorUserId: input.recordedByUserId,
      });
    }
  }

  // Reply / bounce cancel open follow-ups even without enrollment context
  if (REPLY_KINDS.has(input.kind) || DNC_KINDS.has(input.kind)) {
    await invalidateIneligibleFollowUps(db, workspaceId, {
      enrollmentId: enrollmentId ?? undefined,
      contactId: input.contactId,
      reason: `activity:${input.channel}:${input.kind}`,
      actorUserId: input.recordedByUserId,
    });
  }

  // Hard bounce → durable email suppression
  if (input.channel === "email" && input.kind === "bounced") {
    await createSuppression(db, workspaceId, {
      contactId: input.contactId,
      channel: "email",
      origin: "hard_bounce",
      scope: "global",
      reason: input.subject ?? "Hard bounce recorded",
      actorUserId: input.recordedByUserId,
    });
  }

  await appendDomainEvent(db, {
    workspaceId,
    eventType: "activity.recorded",
    aggregateType: "channel_activity",
    aggregateId: activity.id,
    payload: {
      channel: input.channel,
      kind: input.kind,
      contactId: input.contactId,
      enrollmentId,
    },
    actorUserId: input.recordedByUserId,
  });

  return { activity, duplicate: false };
}

export async function listFollowUpQueue(db: Database, workspaceId: string) {
  return db.query.campaignEnrollments.findMany({
    where: and(
      eq(campaignEnrollments.workspaceId, workspaceId),
      eq(campaignEnrollments.status, "active"),
    ),
    orderBy: [desc(campaignEnrollments.followUpDueAt)],
    with: {
      contact: { with: { methods: true } },
      campaign: true,
    },
    limit: 100,
  });
}
