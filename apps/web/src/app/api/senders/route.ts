import { eq } from "drizzle-orm";
import { senderIdentities } from "@smartreach/db";
import { createSenderIdentitySchema } from "@smartreach/shared";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";

export async function GET() {
  try {
    const session = await requirePermission("senders:write");
    const identities = await db.query.senderIdentities.findMany({
      where: eq(senderIdentities.workspaceId, session.workspaceId),
    });
    return jsonOk({ identities });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("senders:write");
    const body = createSenderIdentitySchema.parse(await request.json());
    const [identity] = await db
      .insert(senderIdentities)
      .values({
        workspaceId: session.workspaceId,
        ownerUserId: session.userId,
        channel: body.channel,
        displayName: body.displayName,
        persona: body.persona,
        emailAddress: body.emailAddress,
        linkedinUrl: body.linkedinUrl,
        status: "pending",
      })
      .returning();
    return jsonOk({ identity }, 201);
  } catch (err) {
    return jsonError(err);
  }
}
