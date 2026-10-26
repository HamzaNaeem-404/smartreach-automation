import { createCampaign, listCampaigns } from "@smartreach/core";
import { createCampaignSchema } from "@smartreach/shared";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";

export async function GET() {
  try {
    const session = await requireSession();
    const campaigns = await listCampaigns(db, session.workspaceId);
    return jsonOk({ campaigns });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const body = createCampaignSchema.parse(await request.json());
    const campaign = await createCampaign(db, session.workspaceId, {
      ...body,
      ownerUserId: session.userId,
    });
    return jsonOk({ campaign }, 201);
  } catch (err) {
    return jsonError(err);
  }
}
