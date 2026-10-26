import { getDashboardStats } from "@smartreach/core";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";

export async function GET() {
  try {
    const session = await requireSession();
    const stats = await getDashboardStats(db, session.workspaceId);
    return jsonOk(stats);
  } catch (err) {
    return jsonError(err);
  }
}
