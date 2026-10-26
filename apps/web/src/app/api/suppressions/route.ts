import {
  createSuppression,
  listSuppressions,
  removeSuppression,
} from "@smartreach/core";
import {
  createSuppressionSchema,
  removeSuppressionSchema,
} from "@smartreach/shared";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";

export async function GET(request: Request) {
  try {
    const session = await requirePermission("suppressions:read");
    const url = new URL(request.url);
    const search = url.searchParams.get("search") ?? undefined;
    const channel = url.searchParams.get("channel") as
      | "all"
      | "email"
      | "linkedin"
      | null;
    const origin = url.searchParams.get("origin") as
      | "manual"
      | "unsubscribe"
      | "hard_bounce"
      | "import"
      | "system"
      | null;

    const rows = await listSuppressions(db, session.workspaceId, {
      search,
      channel: channel ?? undefined,
      origin: origin ?? undefined,
      limit: 100,
    });
    return jsonOk({ suppressions: rows });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("suppressions:write");
    const body = await request.json();
    const op = body?.op as string | undefined;

    if (op === "remove") {
      const parsed = removeSuppressionSchema.parse(body);
      const updated = await removeSuppression(db, session.workspaceId, {
        suppressionId: parsed.suppressionId,
        reason: parsed.reason,
        actorUserId: session.userId,
      });
      return jsonOk({ suppression: updated });
    }

    const parsed = createSuppressionSchema.parse(body);
    const result = await createSuppression(db, session.workspaceId, {
      ...parsed,
      actorUserId: session.userId,
    });
    return jsonOk(result, result.created ? 201 : 200);
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await requirePermission("suppressions:write");
    const url = new URL(request.url);
    const suppressionId = url.searchParams.get("id");
    if (!suppressionId) {
      return jsonError(new Error("id required"));
    }
    const updated = await removeSuppression(db, session.workspaceId, {
      suppressionId,
      actorUserId: session.userId,
      reason: "operator_removed",
    });
    return jsonOk({ suppression: updated });
  } catch (err) {
    return jsonError(err);
  }
}
