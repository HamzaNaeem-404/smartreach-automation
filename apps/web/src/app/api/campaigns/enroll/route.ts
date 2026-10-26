import { enrollContacts } from "@smartreach/core";
import { enrollContactsSchema } from "@smartreach/shared";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const body = enrollContactsSchema.parse(await request.json());
    const result = await enrollContacts(db, session.workspaceId, {
      ...body,
      assignedUserId: session.userId,
    });
    return jsonOk(result, 201);
  } catch (err) {
    return jsonError(err);
  }
}
