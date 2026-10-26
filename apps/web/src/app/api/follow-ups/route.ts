import {
  listFollowUpActions,
  scheduleFollowUp,
  approveScheduledAction,
  completeScheduledAction,
  cancelScheduledAction,
  deferScheduledAction,
  evaluateScheduledAction,
} from "@smartreach/core";
import {
  FollowUpQueueBuckets,
  scheduleFollowUpSchema,
  followUpActionSchema,
} from "@smartreach/shared";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";

export async function GET(request: Request) {
  try {
    const session = await requirePermission("followups:read");
    const url = new URL(request.url);
    const bucketParam = url.searchParams.get("bucket");
    const bucket =
      bucketParam &&
      (FollowUpQueueBuckets as readonly string[]).includes(bucketParam)
        ? (bucketParam as (typeof FollowUpQueueBuckets)[number])
        : undefined;

    const queue = await listFollowUpActions(db, session.workspaceId, {
      bucket,
      limit: Number(url.searchParams.get("limit") ?? 50),
      offset: Number(url.searchParams.get("offset") ?? 0),
    });
    return jsonOk({ queue, bucket: bucket ?? "all", role: session.role });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = body?.op as string | undefined;

    if (action === "schedule" || !action) {
      const session = await requirePermission("followups:schedule");
      const parsed = scheduleFollowUpSchema.parse(body);
      const result = await scheduleFollowUp(db, session.workspaceId, {
        enrollmentId: parsed.enrollmentId,
        channel: parsed.channel,
        actionType: parsed.actionType,
        dueAt: new Date(parsed.dueAt),
        stepId: parsed.stepId,
        senderIdentityId: parsed.senderIdentityId,
        payload: parsed.payload,
        requiresApproval: parsed.requiresApproval,
        idempotencyKey: parsed.idempotencyKey,
        actorUserId: session.userId,
      });
      return jsonOk(result, result.created ? 201 : 200);
    }

    const parsed = followUpActionSchema.parse(body);

    if (action === "approve") {
      const session = await requirePermission("followups:approve");
      // Revalidate eligibility at approval time
      const evaluated = await evaluateScheduledAction(
        db,
        session.workspaceId,
        parsed.actionId,
      );
      if (!evaluated.eligible) {
        return jsonError(
          new Error(
            `Not eligible: ${evaluated.blockingReasons.join(", ")}`,
          ),
        );
      }
      const updated = await approveScheduledAction(
        db,
        session.workspaceId,
        parsed.actionId,
        session.userId,
      );
      return jsonOk({ action: updated, eligibility: evaluated });
    }

    if (action === "complete") {
      const session = await requirePermission("followups:complete");
      const result = await completeScheduledAction(db, session.workspaceId, {
        actionId: parsed.actionId,
        actorUserId: session.userId,
        note: parsed.note,
      });
      return jsonOk(result);
    }

    if (action === "cancel" || action === "reject") {
      const session = await requirePermission("followups:cancel");
      const result = await cancelScheduledAction(db, session.workspaceId, {
        actionId: parsed.actionId,
        reason:
          parsed.reason ??
          (action === "reject" ? "operator_rejected" : "operator_cancelled"),
        actorUserId: session.userId,
      });
      return jsonOk(result);
    }

    if (action === "defer") {
      const session = await requirePermission("followups:approve");
      if (!parsed.dueAt) {
        return jsonError(new Error("dueAt required for defer"));
      }
      const updated = await deferScheduledAction(db, session.workspaceId, {
        actionId: parsed.actionId,
        dueAt: new Date(parsed.dueAt),
        actorUserId: session.userId,
      });
      return jsonOk({ action: updated });
    }

    return jsonError(new Error(`Unknown op: ${action}`));
  } catch (err) {
    return jsonError(err);
  }
}
