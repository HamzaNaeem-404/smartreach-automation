import { and, eq } from "drizzle-orm";
import type { Database } from "@smartreach/db";
import { workspaceMembers, workspaces } from "@smartreach/db";
import {
  ForbiddenError,
  NotFoundError,
  slugify,
  type WorkspaceRole,
} from "@smartreach/shared";

export type AuthContext = {
  userId: string;
  workspaceId: string;
  role: WorkspaceRole;
};

export async function assertWorkspaceMember(
  db: Database,
  userId: string,
  workspaceId: string,
): Promise<AuthContext> {
  const membership = await db.query.workspaceMembers.findFirst({
    where: and(
      eq(workspaceMembers.workspaceId, workspaceId),
      eq(workspaceMembers.userId, userId),
    ),
  });

  if (!membership) {
    throw new ForbiddenError("Not a member of this workspace");
  }

  return {
    userId,
    workspaceId,
    role: membership.role,
  };
}

export async function listUserWorkspaces(db: Database, userId: string) {
  const rows = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
      role: workspaceMembers.role,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, userId));

  return rows;
}

export async function createWorkspace(
  db: Database,
  userId: string,
  input: { name: string; slug?: string },
) {
  const slug = input.slug ?? slugify(input.name);
  const [workspace] = await db
    .insert(workspaces)
    .values({ name: input.name, slug })
    .returning();

  if (!workspace) {
    throw new Error("Failed to create workspace");
  }

  await db.insert(workspaceMembers).values({
    workspaceId: workspace.id,
    userId,
    role: "owner",
  });

  return workspace;
}

export async function getWorkspaceBySlug(
  db: Database,
  userId: string,
  slug: string,
) {
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.slug, slug),
  });
  if (!workspace) throw new NotFoundError("Workspace");
  await assertWorkspaceMember(db, userId, workspace.id);
  return workspace;
}
