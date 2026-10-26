import { confirmMappingAndProcess } from "@smartreach/core";
import { confirmImportMappingSchema } from "@smartreach/shared";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";

export async function POST(
  request: Request,
  context: { params: Promise<{ batchId: string }> },
) {
  try {
    const session = await requireSession();
    const { batchId } = await context.params;
    const body = await request.json();
    const parsed = confirmImportMappingSchema.parse({
      ...body,
      batchId,
    });

    const batch = await confirmMappingAndProcess(db, {
      workspaceId: session.workspaceId,
      batchId: parsed.batchId,
      mapping: parsed.mapping,
      saveAsTemplate: parsed.saveAsTemplate,
      templateSourceKey: parsed.templateSourceKey,
    });

    return jsonOk({ batch });
  } catch (err) {
    return jsonError(err);
  }
}
