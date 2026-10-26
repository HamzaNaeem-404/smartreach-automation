import { getOperationalMetrics } from "@smartreach/core";
import { ForbiddenError } from "@smartreach/shared";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";

/** Workspace operational counters — no PII. Admin/owner only. */
export async function GET() {
  try {
    const session = await requireSession();
    if (session.role !== "owner" && session.role !== "admin") {
      throw new ForbiddenError("Ops metrics require admin or owner");
    }
    const metrics = await getOperationalMetrics(db, session.workspaceId);
    return jsonOk({ metrics });
  } catch (err) {
    return jsonError(err);
  }
}
