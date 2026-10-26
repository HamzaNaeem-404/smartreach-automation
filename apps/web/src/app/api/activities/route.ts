import { recordActivity } from "@smartreach/core";
import { recordActivitySchema } from "@smartreach/shared";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const body = recordActivitySchema.parse(await request.json());
    const result = await recordActivity(db, session.workspaceId, {
      ...body,
      occurredAt: body.occurredAt ? new Date(body.occurredAt) : undefined,
      recordedByUserId: session.userId,
    });
    return jsonOk(result, result.duplicate ? 200 : 201);
  } catch (err) {
    return jsonError(err);
  }
}
