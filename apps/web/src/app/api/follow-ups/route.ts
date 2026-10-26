import { listFollowUpQueue } from "@smartreach/core";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";

export async function GET() {
  try {
    const session = await requireSession();
    const queue = await listFollowUpQueue(db, session.workspaceId);
    return jsonOk({ queue });
  } catch (err) {
    return jsonError(err);
  }
}
