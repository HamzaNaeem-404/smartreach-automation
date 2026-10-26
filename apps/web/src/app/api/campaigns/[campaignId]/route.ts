import { getCampaign } from "@smartreach/core";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";

export async function GET(
  _request: Request,
  context: { params: Promise<{ campaignId: string }> },
) {
  try {
    const session = await requireSession();
    const { campaignId } = await context.params;
    const campaign = await getCampaign(db, session.workspaceId, campaignId);
    return jsonOk({ campaign });
  } catch (err) {
    return jsonError(err);
  }
}
