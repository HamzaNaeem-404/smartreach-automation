import { ValidationError } from "@smartreach/shared";
import { loginWithCredentials } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/api";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: string; password?: string };
    if (!body.email || !body.password) {
      return jsonError(new ValidationError("Email and password required"));
    }
    const result = await loginWithCredentials(body.email, body.password);
    return jsonOk({
      userId: result.user.id,
      workspaceId: result.workspaceId,
    });
  } catch (err) {
    return jsonError(err);
  }
}
