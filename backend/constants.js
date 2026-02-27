export const AUTH_ROLES = ['viewer', 'editor', 'manager', 'admin'];

export const PERMISSIONS = {
  DASHBOARD_READ: 'dashboard.read',
  NETWORK_READ: 'network.read',
  NETWORK_CREATE: 'network.create',
  NETWORK_UPDATE: 'network.update',
  NETWORK_DELETE: 'network.delete',
  NETWORK_IMPORT: 'network.import',
  NETWORK_EXPORT: 'network.export',
  NETWORK_RESET: 'network.reset',
  NETWORK_EDIT_MODE: 'network.editMode',
  ANALYSIS_RUN: 'analysis.run',
  USERS_READ: 'users.read',
  USERS_CREATE: 'users.create',
  USERS_UPDATE: 'users.update',
  USERS_DELETE: 'users.delete',
  ROLES_READ: 'roles.read',
  ROLES_UPDATE: 'roles.update',
  LICENSE_READ: 'license.read',
  LICENSE_UPDATE: 'license.update',
  AUDIT_READ: 'audit.read',
};

export const ALL_PERMISSIONS = Object.values(PERMISSIONS);

export const ROLE_LABELS = {
  viewer: 'Leitura',
  editor: 'Editor',
  manager: 'Gestor',
  admin: 'Administrador',
};

export const ROLE_PARENT = {
  viewer: null,
  editor: 'viewer',
  manager: 'editor',
  admin: 'manager',
};

export const ROLE_DIRECT_PERMISSIONS = {
  viewer: [PERMISSIONS.DASHBOARD_READ, PERMISSIONS.NETWORK_READ, PERMISSIONS.ANALYSIS_RUN],
  editor: [PERMISSIONS.NETWORK_CREATE, PERMISSIONS.NETWORK_UPDATE, PERMISSIONS.NETWORK_EDIT_MODE],
  manager: [
    PERMISSIONS.NETWORK_IMPORT,
    PERMISSIONS.NETWORK_EXPORT,
    PERMISSIONS.USERS_READ,
    PERMISSIONS.USERS_CREATE,
    PERMISSIONS.USERS_UPDATE,
    PERMISSIONS.USERS_DELETE,
    PERMISSIONS.ROLES_READ,
    PERMISSIONS.ROLES_UPDATE,
    PERMISSIONS.LICENSE_READ,
    PERMISSIONS.AUDIT_READ,
  ],
  admin: [PERMISSIONS.NETWORK_DELETE, PERMISSIONS.NETWORK_RESET],
};

export const LICENSE_FEATURES = [
  'api_access',
  'project_management',
  'network_modeling',
  'user_management',
  'role_management',
  'audit_logs',
];
