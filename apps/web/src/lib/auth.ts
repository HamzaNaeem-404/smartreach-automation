import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { users } from "@smartreach/db";
import { assertPermission, verifyPassword } from "@smartreach/core";
import {
  UnauthorizedError,
  type Permission,
  type WorkspaceRole,
} from "@smartreach/shared";
import { db } from "./db";

const COOKIE_NAME = "sr_session";

function getSecret() {
  const secret =
    process.env.AUTH_SECRET ?? "dev-secret-change-me-in-production-min-32-chars";
  return new TextEncoder().encode(secret);
}

export type SessionPayload = {
  userId: string;
  email: string;
  name: string | null;
  workspaceId: string;
  /** Present after login/refresh; always re-validated from DB in requireSession */
  role?: WorkspaceRole;
};

export async function createSession(payload: SessionPayload) {
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());

  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export type AuthedSession = SessionPayload & { role: WorkspaceRole };

export async function requireSession(): Promise<AuthedSession> {
  const session = await getSession();
  if (!session?.userId || !session.workspaceId) {
    throw new UnauthorizedError();
  }

  const membership = await db.query.workspaceMembers.findFirst({
    where: (m, { and, eq: e }) =>
      and(e(m.userId, session.userId), e(m.workspaceId, session.workspaceId)),
  });
  if (!membership) {
    throw new UnauthorizedError("Workspace membership revoked");
  }

  return {
    ...session,
    role: membership.role,
  };
}

export async function requirePermission(
  permission: Permission,
): Promise<AuthedSession> {
  const session = await requireSession();
  assertPermission(session.role, permission);
  return session;
}

export async function loginWithCredentials(email: string, password: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.email, email.toLowerCase().trim()),
  });
  if (!user?.passwordHash) {
    throw new UnauthorizedError("Invalid credentials");
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) throw new UnauthorizedError("Invalid credentials");

  const memberships = await db.query.workspaceMembers.findMany({
    where: (m, { eq: e }) => e(m.userId, user.id),
  });
  const membership = memberships[0];
  if (!membership?.workspaceId) {
    throw new UnauthorizedError("No workspace membership");
  }

  await createSession({
    userId: user.id,
    email: user.email,
    name: user.name,
    workspaceId: membership.workspaceId,
    role: membership.role,
  });

  return { user, workspaceId: membership.workspaceId, role: membership.role };
}

export async function switchWorkspace(workspaceId: string) {
  const session = await requireSession();
  const membership = await db.query.workspaceMembers.findFirst({
    where: (m, { and, eq: e }) =>
      and(e(m.userId, session.userId), e(m.workspaceId, workspaceId)),
  });
  if (!membership) throw new UnauthorizedError("Not a workspace member");

  await createSession({
    ...session,
    workspaceId,
    role: membership.role,
  });
}
