import type { WorkspaceRole } from "./enums";

/** Named capabilities enforced server-side. */
export const Permissions = [
  "contacts:read",
  "contacts:write",
  "companies:write",
  "imports:write",
  "campaigns:read",
  "campaigns:write",
  "campaigns:enroll",
  "campaigns:pause",
  "activities:write",
  "followups:read",
  "followups:approve",
  "followups:complete",
  "followups:cancel",
  "followups:schedule",
  "suppressions:read",
  "suppressions:write",
  "senders:write",
  "workspace:manage",
] as const;

export type Permission = (typeof Permissions)[number];

const ALL: Permission[] = [...Permissions];

const MEMBER: Permission[] = [
  "contacts:read",
  "contacts:write",
  "companies:write",
  "imports:write",
  "campaigns:read",
  "campaigns:enroll",
  "activities:write",
  "followups:read",
  "followups:complete",
  "suppressions:read",
];

const ADMIN: Permission[] = [
  ...MEMBER,
  "campaigns:write",
  "campaigns:pause",
  "followups:approve",
  "followups:cancel",
  "followups:schedule",
  "suppressions:write",
  "senders:write",
];

const ROLE_PERMISSIONS: Record<WorkspaceRole, Permission[]> = {
  owner: ALL,
  admin: ADMIN,
  member: MEMBER,
};

export function permissionsForRole(role: WorkspaceRole): Permission[] {
  return ROLE_PERMISSIONS[role] ?? MEMBER;
}

export function roleHasPermission(
  role: WorkspaceRole,
  permission: Permission,
): boolean {
  return permissionsForRole(role).includes(permission);
}
