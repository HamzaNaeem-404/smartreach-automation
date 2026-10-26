import { createContact, listContacts } from "@smartreach/core";
import { createContactSchema } from "@smartreach/shared";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";

export async function GET(request: Request) {
  try {
    const session = await requirePermission("contacts:read");
    const { searchParams } = new URL(request.url);
    const contacts = await listContacts(db, session.workspaceId, {
      search: searchParams.get("search") ?? undefined,
      limit: Number(searchParams.get("limit") ?? 50),
      offset: Number(searchParams.get("offset") ?? 0),
    });
    return jsonOk({ contacts });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("contacts:write");
    const body = createContactSchema.parse(await request.json());
    const result = await createContact(db, session.workspaceId, {
      ...body,
      ownerUserId: session.userId,
    });
    return jsonOk(result, result.created ? 201 : 200);
  } catch (err) {
    return jsonError(err);
  }
}
