import { createImportBatch, listImportBatches } from "@smartreach/core";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";

export async function GET() {
  try {
    const session = await requirePermission("imports:write");
    const batches = await listImportBatches(db, session.workspaceId);
    return jsonOk({ batches });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("imports:write");
    const form = await request.formData();
    const file = form.get("file");
    const sourceKey = (form.get("sourceKey") as string | null) ?? undefined;

    if (!(file instanceof File)) {
      return jsonError(new Error("file is required"));
    }

    const content = await file.text();
    const result = await createImportBatch(db, {
      workspaceId: session.workspaceId,
      userId: session.userId,
      fileName: file.name,
      content,
      sourceKey,
    });

    return jsonOk(result, 201);
  } catch (err) {
    return jsonError(err);
  }
}
