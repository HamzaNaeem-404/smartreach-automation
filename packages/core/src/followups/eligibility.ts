import { and, eq } from "drizzle-orm";
import type { Database } from "@smartreach/db";
import {
  campaigns,
  campaignEnrollments,
  channelActivities,
  senderIdentities,
  suppressionEntries,
  scheduledActions,
} from "@smartreach/db";
import {
  ELIGIBILITY_POLICY_VERSION,
  type Channel,
  type EligibilityBlockReason,
} from "@smartreach/shared";

export type ActionEligibilityInput = {
  workspaceId: string;
  actionId?: string;
  enrollmentId?: string | null;
  contactId?: string | null;
  campaignId?: string | null;
  channel: Channel | string | null;
  actionType: string;
  senderIdentityId?: string | null;
  attemptCount?: number;
  maxAttempts?: number;
  status?: string | null;
  /** Cross-channel: if true, LinkedIn accepted cancels email sequence */
  cancelEmailOnLinkedInAccept?: boolean;
  now?: Date;
  /** Optional schedule window in local minutes from midnight [start, end) */
  scheduleWindow?: { startMinute: number; endMinute: number; timeZone?: string };
};

export type ActionEligibilityResult = {
  eligible: boolean;
  blockingReasons: EligibilityBlockReason[];
  policyVersion: string;
  evaluatedAt: string;
  relatedEventRefs: string[];
  requiresHumanApproval: boolean;
};

const TERMINAL_ACTION_STATUSES = new Set([
  "cancelled",
  "completed",
  "failed",
]);

function minuteOfDayInTz(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

/**
 * Deterministic eligibility check for outreach / follow-up actions.
 * Hard blocks (suppression, opt-out, bounce, reply) always win over AI suggestions.
 */
export async function evaluateActionEligibility(
  db: Database,
  input: ActionEligibilityInput,
): Promise<ActionEligibilityResult> {
  const now = input.now ?? new Date();
  const blockingReasons: EligibilityBlockReason[] = [];
  const relatedEventRefs: string[] = [];
  let requiresHumanApproval = input.channel === "linkedin";

  if (input.status && TERMINAL_ACTION_STATUSES.has(input.status)) {
    blockingReasons.push("action_already_terminal");
  }

  if (
    (input.attemptCount ?? 0) >= (input.maxAttempts ?? 3) &&
    input.status === "reserved"
  ) {
    blockingReasons.push("retry_limit_exceeded");
  }

  const contactId = input.contactId;
  const channel = input.channel;

  if (contactId) {
    const suppressions = await db.query.suppressionEntries.findMany({
      where: and(
        eq(suppressionEntries.workspaceId, input.workspaceId),
        eq(suppressionEntries.contactId, contactId),
      ),
    });

    for (const s of suppressions) {
      relatedEventRefs.push(`suppression:${s.id}`);
      if (s.scope === "global") {
        blockingReasons.push("global_do_not_contact");
      } else if (
        s.scope === "campaign" &&
        input.campaignId &&
        s.campaignId === input.campaignId
      ) {
        blockingReasons.push("channel_suppression");
      }
    }
  }

  if (input.campaignId) {
    const campaign = await db.query.campaigns.findFirst({
      where: and(
        eq(campaigns.id, input.campaignId),
        eq(campaigns.workspaceId, input.workspaceId),
      ),
    });
    if (!campaign) {
      blockingReasons.push("campaign_inactive");
    } else if (campaign.status === "paused") {
      blockingReasons.push("campaign_paused");
    } else if (campaign.status !== "active" && campaign.status !== "draft") {
      // draft allowed for scheduling; paused/archived blocked
      if (campaign.status === "archived" || campaign.status === "stopped") {
        blockingReasons.push("campaign_inactive");
      }
    }
  }

  if (input.enrollmentId) {
    const enrollment = await db.query.campaignEnrollments.findFirst({
      where: and(
        eq(campaignEnrollments.id, input.enrollmentId),
        eq(campaignEnrollments.workspaceId, input.workspaceId),
      ),
    });
    if (!enrollment) {
      blockingReasons.push("enrollment_not_active");
    } else {
      relatedEventRefs.push(`enrollment:${enrollment.id}:${enrollment.status}`);
      if (enrollment.status === "paused") {
        blockingReasons.push("enrollment_not_active");
      } else if (enrollment.status === "replied") {
        blockingReasons.push("enrollment_replied");
      } else if (enrollment.status === "do_not_contact") {
        blockingReasons.push("enrollment_do_not_contact");
      } else if (
        enrollment.status !== "active" &&
        enrollment.status !== "interested"
      ) {
        blockingReasons.push("enrollment_not_active");
      }
    }
  }

  if (contactId && channel) {
    const activities = await db.query.channelActivities.findMany({
      where: and(
        eq(channelActivities.workspaceId, input.workspaceId),
        eq(channelActivities.contactId, contactId),
      ),
      orderBy: (t, { desc }) => [desc(t.occurredAt)],
      limit: 100,
    });

    const emailReplied = activities.some(
      (a) => a.channel === "email" && a.kind === "replied",
    );
    const emailBounced = activities.some(
      (a) => a.channel === "email" && a.kind === "bounced",
    );
    const linkedinDeclined = activities.some(
      (a) => a.channel === "linkedin" && a.kind === "invitation_declined",
    );
    const linkedinAccepted = activities.some(
      (a) => a.channel === "linkedin" && a.kind === "invitation_accepted",
    );

    if (channel === "email" && emailReplied) {
      blockingReasons.push("email_replied");
      const reply = activities.find(
        (a) => a.channel === "email" && a.kind === "replied",
      );
      if (reply) relatedEventRefs.push(`activity:${reply.id}`);
    }
    if (channel === "email" && emailBounced) {
      blockingReasons.push("email_bounced");
    }
    if (channel === "linkedin" && linkedinDeclined) {
      blockingReasons.push("linkedin_declined");
    }
    if (
      channel === "email" &&
      linkedinAccepted &&
      input.cancelEmailOnLinkedInAccept
    ) {
      blockingReasons.push("cross_channel_policy");
    }
  }

  if (input.senderIdentityId) {
    const identity = await db.query.senderIdentities.findFirst({
      where: and(
        eq(senderIdentities.id, input.senderIdentityId),
        eq(senderIdentities.workspaceId, input.workspaceId),
      ),
    });
    if (
      !identity ||
      identity.status === "disabled" ||
      identity.status === "disconnected"
    ) {
      blockingReasons.push("sender_identity_disabled");
    }
  }

  if (input.scheduleWindow) {
    const tz = input.scheduleWindow.timeZone ?? "UTC";
    const minute = minuteOfDayInTz(now, tz);
    if (
      minute < input.scheduleWindow.startMinute ||
      minute >= input.scheduleWindow.endMinute
    ) {
      blockingReasons.push("outside_schedule_window");
    }
  }

  // LinkedIn is always human-executed in M2
  if (channel === "linkedin") {
    requiresHumanApproval = true;
  }

  // Email send remains approval-gated until M3 live provider
  if (channel === "email" && input.actionType !== "manual_complete") {
    requiresHumanApproval = true;
  }

  if (requiresHumanApproval && input.status === "pending") {
    // Informational — does not block eligibility for queue display, but
    // execution path must check requiresHumanApproval.
  }

  const uniqueReasons = [...new Set(blockingReasons)];

  return {
    eligible: uniqueReasons.length === 0,
    blockingReasons: uniqueReasons,
    policyVersion: ELIGIBILITY_POLICY_VERSION,
    evaluatedAt: now.toISOString(),
    relatedEventRefs: [...new Set(relatedEventRefs)],
    requiresHumanApproval,
  };
}

export async function evaluateScheduledAction(
  db: Database,
  workspaceId: string,
  actionId: string,
  opts?: { cancelEmailOnLinkedInAccept?: boolean; now?: Date },
) {
  const action = await db.query.scheduledActions.findFirst({
    where: and(
      eq(scheduledActions.id, actionId),
      eq(scheduledActions.workspaceId, workspaceId),
    ),
  });
  if (!action) {
    return {
      eligible: false,
      blockingReasons: ["action_already_terminal" as EligibilityBlockReason],
      policyVersion: ELIGIBILITY_POLICY_VERSION,
      evaluatedAt: new Date().toISOString(),
      relatedEventRefs: [],
      requiresHumanApproval: true,
      action: null,
    };
  }

  const result = await evaluateActionEligibility(db, {
    workspaceId,
    actionId: action.id,
    enrollmentId: action.enrollmentId,
    contactId: action.contactId,
    campaignId: action.campaignId,
    channel: action.channel,
    actionType: action.actionType,
    senderIdentityId: action.senderIdentityId,
    attemptCount: action.attemptCount,
    maxAttempts: action.maxAttempts,
    status: action.status,
    cancelEmailOnLinkedInAccept: opts?.cancelEmailOnLinkedInAccept,
    now: opts?.now,
  });

  return { ...result, action };
}
