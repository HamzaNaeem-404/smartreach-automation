import {
  listFollowUpActions,
  scheduleFollowUp,
  approveScheduledAction,
  completeScheduledAction,
  cancelScheduledAction,
  deferScheduledAction,
} from "@smartreach/core";
import {
  FollowUpQueueBuckets,
  scheduleFollowUpSchema,
  followUpActionSchema,
} from "@smartreach/shared";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const url = new URL(request.url);
    const bucketParam = url.searchParams.get("bucket");
    const bucket =
      bucketParam &&
      (FollowUpQueueBuckets as readonly string[]).includes(bucketParam)
        ? (bucketParam as (typeof FollowUpQueueBuckets)[number])
        : undefined;

    const queue = await listFollowUpActions(db, session.workspaceId, {
      bucket,
      limit: 100,
    });
    return jsonOk({ queue, bucket: bucket ?? "all" });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const body = await request.json();
    const action = body?.op as string | undefined;

    if (action === "schedule" || !action) {
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
      const updated = await approveScheduledAction(
        db,
        session.workspaceId,
        parsed.actionId,
        session.userId,
      );
      return jsonOk({ action: updated });
    }

    if (action === "complete") {
      const result = await completeScheduledAction(db, session.workspaceId, {
        actionId: parsed.actionId,
        actorUserId: session.userId,
        note: parsed.note,
      });
      return jsonOk(result);
    }

    if (action === "cancel") {
      const result = await cancelScheduledAction(db, session.workspaceId, {
        actionId: parsed.actionId,
        reason: parsed.reason ?? "operator_cancelled",
        actorUserId: session.userId,
      });
      return jsonOk(result);
    }

    if (action === "defer") {
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
