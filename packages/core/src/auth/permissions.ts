import { ForbiddenError, roleHasPermission, type Permission, type WorkspaceRole } from "@smartreach/shared";

export function assertPermission(
  role: WorkspaceRole,
  permission: Permission,
  message?: string,
) {
  if (!roleHasPermission(role, permission)) {
    throw new ForbiddenError(
      message ?? `Missing permission: ${permission}`,
    );
  }
}

export function hasPermission(role: WorkspaceRole, permission: Permission) {
  return roleHasPermission(role, permission);
}
