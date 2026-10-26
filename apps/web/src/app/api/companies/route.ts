import { createCompany, listCompanies } from "@smartreach/core";
import { createCompanySchema } from "@smartreach/shared";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(request.url);
    const companies = await listCompanies(db, session.workspaceId, {
      search: searchParams.get("search") ?? undefined,
    });
    return jsonOk({ companies });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const body = createCompanySchema.parse(await request.json());
    const company = await createCompany(db, session.workspaceId, body);
    return jsonOk({ company }, 201);
  } catch (err) {
    return jsonError(err);
  }
}
