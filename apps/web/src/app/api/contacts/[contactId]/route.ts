import { getContact, getContactTimeline } from "@smartreach/core";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";

export async function GET(
  _request: Request,
  context: { params: Promise<{ contactId: string }> },
) {
  try {
    const session = await requireSession();
    const { contactId } = await context.params;
    const [contact, timeline] = await Promise.all([
      getContact(db, session.workspaceId, contactId),
      getContactTimeline(db, session.workspaceId, contactId),
    ]);
    return jsonOk({ contact, timeline });
  } catch (err) {
    return jsonError(err);
  }
}
