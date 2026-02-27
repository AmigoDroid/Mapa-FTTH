export type AuthRole = 'viewer' | 'editor' | 'manager' | 'admin';

export type AuthPermission =
  | 'dashboard.read'
  | 'network.read'
  | 'network.create'
  | 'network.update'
  | 'network.delete'
  | 'network.import'
  | 'network.export'
  | 'network.reset'
  | 'network.editMode'
  | 'analysis.run'
  | 'users.read'
  | 'users.create'
  | 'users.update'
  | 'users.delete'
  | 'roles.read'
  | 'roles.update'
  | 'license.read'
  | 'license.update'
  | 'audit.read';

export const ALL_AUTH_PERMISSIONS: AuthPermission[] = [
  'dashboard.read',
  'network.read',
  'network.create',
  'network.update',
  'network.delete',
  'network.import',
  'network.export',
  'network.reset',
  'network.editMode',
  'analysis.run',
  'users.read',
  'users.create',
  'users.update',
  'users.delete',
  'roles.read',
  'roles.update',
  'license.read',
  'license.update',
  'audit.read',
];

const ROLE_PARENT: Record<AuthRole, AuthRole | null> = {
  viewer: null,
  editor: 'viewer',
  manager: 'editor',
  admin: 'manager',
};

const ROLE_DIRECT_PERMISSIONS: Record<AuthRole, AuthPermission[]> = {
  viewer: ['dashboard.read', 'network.read', 'analysis.run'],
  editor: ['network.create', 'network.update', 'network.editMode'],
  manager: [
    'network.import',
    'network.export',
    'users.read',
    'users.create',
    'users.update',
    'users.delete',
    'roles.read',
    'roles.update',
    'license.read',
    'audit.read',
  ],
  admin: ['network.delete', 'network.reset'],
};

export const ROLE_LABELS: Record<AuthRole, string> = {
  viewer: 'Leitura',
  editor: 'Editor',
  manager: 'Gestor',
  admin: 'Administrador',
};

export const PERMISSION_LABELS: Record<AuthPermission, string> = {
  'dashboard.read': 'Acessar dashboard',
  'network.read': 'Visualizar rede',
  'network.create': 'Criar rede',
  'network.update': 'Editar rede',
  'network.delete': 'Excluir itens da rede',
  'network.import': 'Importar rede',
  'network.export': 'Exportar rede',
  'network.reset': 'Resetar rede',
  'network.editMode': 'Ativar modo de edicao',
  'analysis.run': 'Executar analises',
  'users.read': 'Listar usuarios',
  'users.create': 'Criar usuarios',
  'users.update': 'Atualizar usuarios',
  'users.delete': 'Excluir usuarios',
  'roles.read': 'Visualizar perfis',
  'roles.update': 'Atualizar perfis',
  'license.read': 'Visualizar licenca',
  'license.update': 'Atualizar licenca',
  'audit.read': 'Visualizar auditoria',
};

const collectPermissions = (role: AuthRole, acc: Set<AuthPermission>) => {
  ROLE_DIRECT_PERMISSIONS[role].forEach((permission) => acc.add(permission));
  const parent = ROLE_PARENT[role];
  if (parent) {
    collectPermissions(parent, acc);
  }
};

export const listPermissionsForRole = (role: AuthRole): AuthPermission[] => {
  const permissions = new Set<AuthPermission>();
  collectPermissions(role, permissions);
  return Array.from(permissions);
};

export const hasRolePermission = (role: AuthRole, permission: AuthPermission): boolean =>
  listPermissionsForRole(role).includes(permission);
