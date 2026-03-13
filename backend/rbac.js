import {
  ALL_PERMISSIONS,
  AUTH_ROLES,
  ROLE_DIRECT_PERMISSIONS,
  ROLE_LABELS,
  ROLE_PARENT,
} from './constants.js';

export const roleExists = (roleId) => AUTH_ROLES.includes(roleId);

export const listPermissionsForRole = (roles, roleId) => {
  const role = roles.find((item) => item.id === roleId);
  const visited = new Set();
  const permissions = new Set();

  const walk = (currentRole) => {
    if (!currentRole || visited.has(currentRole)) return;
    visited.add(currentRole);
    const roleDefinition = roles.find((item) => item.id === currentRole);
    if (!roleDefinition) return;
    (roleDefinition.directPermissions || []).forEach((permission) => permissions.add(permission));
    if (roleDefinition.parentRole) {
      walk(roleDefinition.parentRole);
    }
  };

  if (role) {
    walk(role.id);
  }

  return Array.from(permissions);
};

export const hasPermission = (permissions, permission) => permissions.includes(permission);

export const createDefaultRoles = (nowIso) =>
  AUTH_ROLES.map((roleId) => ({
    id: roleId,
    label: ROLE_LABELS[roleId],
    parentRole: ROLE_PARENT[roleId],
    directPermissions: ROLE_DIRECT_PERMISSIONS[roleId],
    createdAt: nowIso,
    updatedAt: nowIso,
  }));

export const normalizePermissions = (permissions) => {
  if (!Array.isArray(permissions)) return null;
  const normalized = [];
  const seen = new Set();
  permissions.forEach((permission) => {
    const value = String(permission).trim();
    if (!ALL_PERMISSIONS.includes(value)) return;
    if (seen.has(value)) return;
    seen.add(value);
    normalized.push(value);
  });
  return normalized;
};

export const resolveUserPermissions = (provider, user) => {
  if (Array.isArray(user?.permissions)) {
    return normalizePermissions(user.permissions) ?? [];
  }
  return listPermissionsForRole(provider.roles || [], user.role);
};
