import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { adminApi } from '@/api/adminApi';
import type { ApiAuditLog, ApiLicense, ApiRole, ApiSessionUser } from '@/api/types';
import {
  ALL_AUTH_PERMISSIONS,
  PERMISSION_LABELS,
  ROLE_LABELS,
  listPermissionsForRole,
  type AuthPermission,
  type AuthRole,
} from '@/auth/permissions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { ProjectSummary } from '@/store/projectStorage';
import { Download, FolderKanban, LogOut, Plus, Search, ShieldCheck, Trash2, Users } from 'lucide-react';

interface ProjectDashboardProps {
  currentProviderName: string;
  currentUserName: string;
  currentUserRole: AuthRole;
  canCreateProject: boolean;
  canDeleteProject: boolean;
  canExportProject: boolean;
  canReadUsers: boolean;
  canManageUsers: boolean;
  canReadRoles: boolean;
  canManageRoles: boolean;
  canReadLicense: boolean;
  canManageLicense: boolean;
  canReadAudit: boolean;
  currentProjectId?: string | null;
  projects: ProjectSummary[];
  onCreateProject: (name: string, description?: string) => Promise<boolean>;
  onOpenProject: (projectId: string) => Promise<void>;
  onDeleteProject: (projectId: string) => Promise<void>;
  onExportProject: (projectId: string) => Promise<void>;
  onRefreshSession: () => Promise<void>;
  onRefreshProjects: () => Promise<void>;
  onLogout: () => void;
}

interface LicenseDraft {
  key: string;
  status: 'active' | 'suspended' | 'expired';
  maxUsers: number;
  expiresAt: string;
}

const toErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const formatDate = (value: string) => {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return '-';
  return new Date(parsed).toLocaleString('pt-BR');
};

const PASSWORD_MIN_LENGTH = 8;
const USERNAME_REGEX = /^[a-z0-9._-]{3,40}$/;
const DISPLAY_NAME_MIN_LENGTH = 3;
const USER_PERMISSION_OPTIONS = ALL_AUTH_PERMISSIONS.filter(
  (permission) => permission !== 'license.update'
);
const USER_PERMISSION_SET = new Set<AuthPermission>(USER_PERMISSION_OPTIONS);

const mapUserToDraft = (user: ApiSessionUser) => ({
  id: user.id,
  username: user.username,
  displayName: user.displayName,
  role: user.role,
  active: user.active,
  permissions: Array.isArray(user.permissions) ? user.permissions : null,
  password: '',
});

type UserDraft = ReturnType<typeof mapUserToDraft>;

const getRoleEffectivePermissions = (roles: ApiRole[], roleId: AuthRole): AuthPermission[] => {
  const role = roles.find((item) => item.id === roleId);
  if (role) return role.effectivePermissions;
  return listPermissionsForRole(roleId);
};

export function ProjectDashboard({
  currentProviderName,
  currentUserName,
  currentUserRole,
  canCreateProject,
  canDeleteProject,
  canExportProject,
  canReadUsers,
  canManageUsers,
  canReadRoles,
  canManageRoles,
  canReadLicense,
  canManageLicense,
  canReadAudit,
  currentProjectId,
  projects,
  onCreateProject,
  onOpenProject,
  onDeleteProject,
  onExportProject,
  onRefreshSession,
  onRefreshProjects,
  onLogout,
}: ProjectDashboardProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'updated' | 'created' | 'name'>('updated');
  const [creating, setCreating] = useState(false);

  const [users, setUsers] = useState<ApiSessionUser[]>([]);
  const [roles, setRoles] = useState<ApiRole[]>([]);
  const [license, setLicense] = useState<ApiLicense | null>(null);
  const [licenseDraft, setLicenseDraft] = useState<LicenseDraft | null>(null);
  const [auditLogs, setAuditLogs] = useState<ApiAuditLog[]>([]);
  const [loadingAdminData, setLoadingAdminData] = useState(false);

  const [newUsername, setNewUsername] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<AuthRole>('viewer');
  const [newUserUseCustomPermissions, setNewUserUseCustomPermissions] = useState(false);
  const [newUserPermissions, setNewUserPermissions] = useState<AuthPermission[]>([]);

  const [userEditor, setUserEditor] = useState<UserDraft | null>(null);
  const [userEditorTab, setUserEditorTab] = useState<'details' | 'permissions'>('details');

  const filteredProjects = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const result = projects.filter((project) =>
      [project.name, project.description || ''].join(' ').toLowerCase().includes(term)
    );
    return result.sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name, 'pt-BR');
      if (sortBy === 'created') return Date.parse(b.createdAt) - Date.parse(a.createdAt);
      return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    });
  }, [projects, searchTerm, sortBy]);

  const getRolePermissions = useCallback(
    (roleId: AuthRole) =>
      getRoleEffectivePermissions(roles, roleId).filter((permission) =>
        USER_PERMISSION_SET.has(permission)
      ),
    [roles]
  );

  const getUserEffectivePermissions = useCallback(
    (user: UserDraft) =>
      user.permissions
        ? user.permissions.filter((permission) => USER_PERMISSION_SET.has(permission))
        : getRolePermissions(user.role),
    [getRolePermissions]
  );

  const togglePermission = useCallback(
    (current: AuthPermission[], permission: AuthPermission, enabled: boolean) => {
      const next = new Set(current);
      if (enabled) next.add(permission);
      else next.delete(permission);
      return Array.from(next);
    },
    []
  );

  const openUserEditor = useCallback(
    (user: ApiSessionUser, tab: 'details' | 'permissions' = 'details') => {
      setUserEditor(mapUserToDraft(user));
      setUserEditorTab(tab);
    },
    []
  );

  const closeUserEditor = useCallback(() => {
    setUserEditor(null);
    setUserEditorTab('details');
  }, []);

  const updateUserEditor = useCallback((patch: Partial<Omit<UserDraft, 'id'>>) => {
    setUserEditor((current) => (current ? { ...current, ...patch } : current));
  }, []);

  const loadAdminData = useCallback(async () => {
    if (!canReadUsers && !canReadRoles && !canReadLicense && !canReadAudit) return;
    setLoadingAdminData(true);
    try {
      const [nextUsers, nextRoles, nextLicense, nextLogs] = await Promise.all([
        canReadUsers ? adminApi.listUsers() : Promise.resolve([]),
        canReadRoles ? adminApi.listRoles() : Promise.resolve([]),
        canReadLicense ? adminApi.getLicense() : Promise.resolve(null),
        canReadAudit ? adminApi.listAuditLogs(80) : Promise.resolve([]),
      ]);

      setUsers(nextUsers);
      setRoles(nextRoles);
      setLicense(nextLicense);
      setAuditLogs(nextLogs);
      if (nextLicense) {
        setLicenseDraft({
          key: nextLicense.key,
          status: nextLicense.status,
          maxUsers: nextLicense.maxUsers,
          expiresAt: nextLicense.expiresAt.slice(0, 10),
        });
      }
    } catch (error) {
      toast.error(toErrorMessage(error, 'Falha ao carregar dados administrativos.'));
    } finally {
      setLoadingAdminData(false);
    }
  }, [canReadAudit, canReadLicense, canReadRoles, canReadUsers]);

  useEffect(() => {
    void loadAdminData();
  }, [loadAdminData]);

  const handleCreateProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreating(true);
    const created = await onCreateProject(name.trim(), description.trim() || undefined);
    setCreating(false);
    if (!created) return;
    setName('');
    setDescription('');
    await onRefreshProjects();
  };

  const handleCreateUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManageUsers) return;
    const username = newUsername.trim().toLowerCase();
    const displayName = newDisplayName.trim();
    const password = newPassword.trim();
    if (!username || !displayName || !password) {
      toast.error('Preencha usuario, nome e senha.');
      return;
    }
    if (!USERNAME_REGEX.test(username)) {
      toast.error('Usuario invalido. Use 3 a 40 caracteres sem espacos.');
      return;
    }
    if (displayName.length < DISPLAY_NAME_MIN_LENGTH) {
      toast.error('Nome do usuario deve ter ao menos 3 caracteres.');
      return;
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      toast.error(`A senha deve ter ao menos ${PASSWORD_MIN_LENGTH} caracteres.`);
      return;
    }
    try {
      const permissions = newUserUseCustomPermissions
        ? newUserPermissions.filter((permission) => USER_PERMISSION_SET.has(permission))
        : null;
      await adminApi.createUser({
        username,
        displayName,
        password,
        role: newRole,
        active: true,
        ...(newUserUseCustomPermissions ? { permissions } : {}),
      });
      setNewUsername('');
      setNewDisplayName('');
      setNewPassword('');
      setNewRole('viewer');
      setNewUserUseCustomPermissions(false);
      setNewUserPermissions([]);
      await loadAdminData();
      toast.success('Usuario criado.');
    } catch (error) {
      toast.error(toErrorMessage(error, 'Falha ao criar usuario.'));
    }
  };

  const toggleUserActive = async (user: ApiSessionUser) => {
    if (!canManageUsers) return;
    try {
      await adminApi.updateUser(user.id, { active: !user.active });
      await loadAdminData();
      await onRefreshSession();
    } catch (error) {
      toast.error(toErrorMessage(error, 'Falha ao atualizar usuario.'));
    }
  };

  const removeUser = async (user: ApiSessionUser) => {
    if (!canManageUsers) return;
    try {
      await adminApi.deleteUser(user.id);
      await loadAdminData();
      if (userEditor?.id === user.id) {
        closeUserEditor();
      }
    } catch (error) {
      toast.error(toErrorMessage(error, 'Falha ao remover usuario.'));
    }
  };

  const handleSaveUser = async (draft: UserDraft) => {
    if (!canManageUsers) return false;
    const username = draft.username.trim().toLowerCase();
    const displayName = draft.displayName.trim();
    if (!username || !displayName) {
      toast.error('Usuario e nome sao obrigatorios.');
      return false;
    }
    if (!USERNAME_REGEX.test(username)) {
      toast.error('Usuario invalido. Use 3 a 40 caracteres sem espacos.');
      return false;
    }
    if (displayName.length < DISPLAY_NAME_MIN_LENGTH) {
      toast.error('Nome do usuario deve ter ao menos 3 caracteres.');
      return false;
    }
    if (draft.password.trim() && draft.password.trim().length < PASSWORD_MIN_LENGTH) {
      toast.error(`A senha deve ter ao menos ${PASSWORD_MIN_LENGTH} caracteres.`);
      return false;
    }
    try {
      const permissions =
        draft.permissions === null
          ? null
          : draft.permissions.filter((permission) => USER_PERMISSION_SET.has(permission));
      await adminApi.updateUser(draft.id, {
        username,
        displayName,
        role: draft.role,
        active: draft.active,
        permissions,
        ...(draft.password.trim() ? { password: draft.password.trim() } : {}),
      });
      await loadAdminData();
      await onRefreshSession();
      toast.success('Usuario atualizado.');
      return true;
    } catch (error) {
      toast.error(toErrorMessage(error, 'Falha ao atualizar usuario.'));
      return false;
    }
  };

  const saveRolePermissions = async (role: ApiRole, rawPermissions: string) => {
    if (!canManageRoles) return;
    const permissions = rawPermissions
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    try {
      await adminApi.updateRole(role.id, permissions);
      await loadAdminData();
      await onRefreshSession();
      toast.success(`Perfil ${role.label} atualizado.`);
    } catch (error) {
      toast.error(toErrorMessage(error, 'Falha ao atualizar perfil.'));
    }
  };

  const saveLicense = async () => {
    if (!canManageLicense || !licenseDraft) return;
    try {
      const updated = await adminApi.updateLicense({
        key: licenseDraft.key,
        status: licenseDraft.status,
        maxUsers: licenseDraft.maxUsers,
        expiresAt: new Date(`${licenseDraft.expiresAt}T23:59:59`).toISOString(),
      });
      setLicense(updated);
      await onRefreshSession();
      toast.success('Licenca atualizada.');
    } catch (error) {
      toast.error(toErrorMessage(error, 'Falha ao atualizar licenca.'));
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-200 via-slate-100 to-white px-4 py-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <header className="rounded-2xl border border-slate-300/80 bg-white/90 px-5 py-5 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-slate-500">FTTH Modelagem</p>
              <h1 className="mt-1 text-2xl font-semibold text-slate-900">Dashboard Licenciado</h1>
              <p className="mt-1 text-sm text-slate-600">
                Provedor: <span className="font-medium text-slate-800">{currentProviderName}</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-right">
                <p className="text-xs text-slate-500">{currentUserName}</p>
                <Badge variant="secondary" className="mt-1">
                  {ROLE_LABELS[currentUserRole]}
                </Badge>
              </div>
              <Button variant="outline" onClick={onLogout}>
                <LogOut className="mr-1 h-4 w-4" />
                Sair
              </Button>
            </div>
          </div>
        </header>

        <Tabs defaultValue="projects">
          <TabsList className="h-auto w-full justify-start gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-white px-2 py-2">
            <TabsTrigger value="projects">Projetos</TabsTrigger>
            <TabsTrigger value="users" disabled={!canReadUsers && !canManageUsers}>Usuarios</TabsTrigger>
            <TabsTrigger value="roles" disabled={!canReadRoles && !canManageRoles}>Permissoes</TabsTrigger>
            <TabsTrigger value="license" disabled={!canReadLicense && !canManageLicense}>Licenca</TabsTrigger>
            <TabsTrigger value="audit" disabled={!canReadAudit}>Auditoria</TabsTrigger>
          </TabsList>

          <TabsContent value="projects">
            <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
              <Card className="border-slate-200">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Plus className="h-4 w-4 text-emerald-600" />
                    Novo Projeto
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form className="space-y-3" onSubmit={handleCreateProject}>
                    <div className="space-y-2">
                      <Label htmlFor="project-name">Nome</Label>
                      <Input id="project-name" value={name} onChange={(e) => setName(e.target.value)} disabled={!canCreateProject} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="project-description">Descricao</Label>
                      <Input id="project-description" value={description} onChange={(e) => setDescription(e.target.value)} disabled={!canCreateProject} />
                    </div>
                    <Button className="w-full" disabled={!canCreateProject || !name.trim() || creating}>
                      {creating ? 'Criando...' : 'Criar projeto'}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card className="border-slate-200">
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <FolderKanban className="h-4 w-4 text-blue-600" />
                      Projetos ({filteredProjects.length})
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-[220px] pl-9" placeholder="Buscar..." />
                      </div>
                      <Select value={sortBy} onValueChange={(value) => setSortBy(value as typeof sortBy)}>
                        <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="updated">Mais recentes</SelectItem>
                          <SelectItem value="created">Criacao</SelectItem>
                          <SelectItem value="name">Nome</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[56vh] pr-2">
                    <div className="space-y-3">
                      {filteredProjects.map((project) => (
                        <div key={project.id} className={`rounded-lg border p-3 ${currentProjectId === project.id ? 'border-emerald-300 bg-emerald-50/30' : 'border-slate-200'}`}>
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold text-slate-900">{project.name}</p>
                              <p className="text-xs text-slate-500">{project.description || 'Sem descricao'}</p>
                            </div>
                            <p className="text-[11px] text-slate-500">{formatDate(project.updatedAt)}</p>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Button size="sm" onClick={() => void onOpenProject(project.id)}>Abrir</Button>
                            <Button size="sm" variant="outline" disabled={!canExportProject} onClick={() => void onExportProject(project.id)}>
                              <Download className="mr-1 h-3.5 w-3.5" />
                              Exportar
                            </Button>
                            {canDeleteProject && (
                              <Button size="sm" variant="outline" onClick={() => void onDeleteProject(project.id)}>
                                <Trash2 className="mr-1 h-3.5 w-3.5" />
                                Excluir
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="users">
            <Card className="border-slate-200">
              <CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-4 w-4" />Usuarios</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {canManageUsers && (
                  <>
                    <form onSubmit={handleCreateUser} className="grid gap-2 md:grid-cols-5">
                      <Input placeholder="usuario" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} />
                      <Input placeholder="nome" value={newDisplayName} onChange={(e) => setNewDisplayName(e.target.value)} />
                      <Input type="password" placeholder="senha" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                      <Select value={newRole} onValueChange={(value) => setNewRole(value as AuthRole)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="viewer">Leitura</SelectItem>
                          <SelectItem value="editor">Editor</SelectItem>
                          <SelectItem value="manager">Gestor</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button type="submit">Criar</Button>
                    </form>

                    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-slate-900">Permissoes personalizadas</p>
                          <p className="text-xs text-slate-500">
                            Ative para definir permissoes especificas no cadastro.
                          </p>
                        </div>
                        <Switch
                          checked={newUserUseCustomPermissions}
                          onCheckedChange={(checked) => {
                            setNewUserUseCustomPermissions(checked);
                            setNewUserPermissions(checked ? getRolePermissions(newRole) : []);
                          }}
                        />
                      </div>
                      {newUserUseCustomPermissions && (
                        <div className="grid gap-2 md:grid-cols-2">
                          {USER_PERMISSION_OPTIONS.map((permission) => (
                            <label
                              key={`new-user:${permission}`}
                              className="flex cursor-pointer items-start gap-2 rounded-md border border-slate-200 bg-white p-2"
                            >
                              <Checkbox
                                checked={newUserPermissions.includes(permission)}
                                onCheckedChange={(checked) =>
                                  setNewUserPermissions((current) =>
                                    togglePermission(current, permission, checked === true)
                                  )
                                }
                              />
                              <span className="text-xs text-slate-700">
                                <span className="block font-medium text-slate-900">
                                  {PERMISSION_LABELS[permission]}
                                </span>
                                {permission}
                              </span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
                {loadingAdminData ? (
                  <p className="text-sm text-slate-500">Carregando...</p>
                ) : (
                  <ScrollArea className="h-[44vh] pr-2">
                    <div className="space-y-2">
                      {users.map((user) => {
                        const draft = mapUserToDraft(user);
                        const effectivePermissions = getUserEffectivePermissions(draft);
                        const isCustomPermissions = draft.permissions !== null;
                        return (
                          <div key={user.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-medium text-slate-900">{user.displayName}</p>
                                <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                                  {ROLE_LABELS[user.role]}
                                </Badge>
                                <Badge
                                  variant="outline"
                                  className={
                                    user.active
                                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                      : 'border-amber-200 bg-amber-50 text-amber-700'
                                  }
                                >
                                  {user.active ? 'Ativo' : 'Inativo'}
                                </Badge>
                                <Badge variant="outline" className="border-indigo-200 bg-indigo-50 text-indigo-700">
                                  {isCustomPermissions
                                    ? `Personalizado (${effectivePermissions.length})`
                                    : `Perfil (${effectivePermissions.length})`}
                                </Badge>
                              </div>
                              <p className="text-xs text-slate-500">{user.username}</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button size="sm" variant="outline" disabled={!canManageUsers} onClick={() => openUserEditor(user, 'details')}>
                                Editar
                              </Button>
                              <Button size="sm" variant="outline" disabled={!canManageUsers} onClick={() => openUserEditor(user, 'permissions')}>
                                Permissoes
                              </Button>
                              <Button size="sm" variant="outline" disabled={!canManageUsers} onClick={() => void toggleUserActive(user)}>
                                {user.active ? 'Desativar' : 'Ativar'}
                              </Button>
                              <Button size="sm" variant="destructive" disabled={!canManageUsers} onClick={() => void removeUser(user)}>
                                Remover
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                      {users.length === 0 && (
                        <p className="text-sm text-slate-500">Nenhum usuario encontrado.</p>
                      )}
                    </div>
                  </ScrollArea>
                )}

                <Dialog
                  open={Boolean(userEditor)}
                  onOpenChange={(open) => {
                    if (!open) closeUserEditor();
                  }}
                >
                  {userEditor && (
                    <DialogContent className="sm:max-w-3xl">
                      <DialogHeader>
                        <DialogTitle>Editar usuario</DialogTitle>
                        <p className="text-xs text-slate-500">
                          {currentProviderName} · {userEditor.username}
                        </p>
                      </DialogHeader>
                      <Tabs
                        value={userEditorTab}
                        onValueChange={(value) =>
                          setUserEditorTab(value as 'details' | 'permissions')
                        }
                        className="space-y-4"
                      >
                        <TabsList className="w-full justify-start">
                          <TabsTrigger value="details">Dados</TabsTrigger>
                          <TabsTrigger value="permissions">Permissoes</TabsTrigger>
                        </TabsList>
                        <TabsContent value="details">
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-1">
                              <Label>Usuario de acesso</Label>
                              <Input
                                value={userEditor.username}
                                onChange={(event) =>
                                  updateUserEditor({ username: event.target.value })
                                }
                              />
                            </div>
                            <div className="space-y-1">
                              <Label>Nome completo</Label>
                              <Input
                                value={userEditor.displayName}
                                onChange={(event) =>
                                  updateUserEditor({ displayName: event.target.value })
                                }
                              />
                            </div>
                            <div className="space-y-1">
                              <Label>Perfil</Label>
                              <Select
                                value={userEditor.role}
                                onValueChange={(value) =>
                                  updateUserEditor({ role: value as AuthRole })
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Perfil" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="viewer">Leitura</SelectItem>
                                  <SelectItem value="editor">Editor</SelectItem>
                                  <SelectItem value="manager">Gestor</SelectItem>
                                  <SelectItem value="admin">Administrador</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label>Status</Label>
                              <Select
                                value={userEditor.active ? 'active' : 'inactive'}
                                onValueChange={(value) =>
                                  updateUserEditor({ active: value === 'active' })
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="active">Ativo</SelectItem>
                                  <SelectItem value="inactive">Inativo</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1 md:col-span-2">
                              <Label>Nova senha (opcional)</Label>
                              <Input
                                type="password"
                                placeholder={`Minimo ${PASSWORD_MIN_LENGTH} caracteres`}
                                value={userEditor.password}
                                onChange={(event) =>
                                  updateUserEditor({ password: event.target.value })
                                }
                              />
                            </div>
                          </div>
                        </TabsContent>
                        <TabsContent value="permissions">
                          <div className="space-y-3">
                            <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                              <div>
                                <p className="text-sm font-medium text-slate-900">Permissoes personalizadas</p>
                                <p className="text-xs text-slate-500">
                                  {userEditor.permissions === null
                                    ? `Usando perfil ${ROLE_LABELS[userEditor.role]}`
                                    : 'Edite as permissoes deste usuario.'}
                                </p>
                              </div>
                              <Switch
                                checked={userEditor.permissions !== null}
                                onCheckedChange={(checked) => {
                                  updateUserEditor({
                                    permissions: checked ? getRolePermissions(userEditor.role) : null,
                                  });
                                }}
                              />
                            </div>
                            <div className="grid gap-2 md:grid-cols-2">
                              {USER_PERMISSION_OPTIONS.map((permission) => {
                                const currentPermissions =
                                  userEditor.permissions ?? getRolePermissions(userEditor.role);
                                return (
                                  <label
                                    key={`${userEditor.id}:${permission}`}
                                    className="flex cursor-pointer items-start gap-2 rounded-md border border-slate-200 bg-white p-2"
                                  >
                                    <Checkbox
                                      checked={currentPermissions.includes(permission)}
                                      disabled={userEditor.permissions === null}
                                      onCheckedChange={(checked) => {
                                        if (userEditor.permissions === null) return;
                                        updateUserEditor({
                                          permissions: togglePermission(
                                            userEditor.permissions,
                                            permission,
                                            checked === true
                                          ),
                                        });
                                      }}
                                    />
                                    <span className="text-xs text-slate-700">
                                      <span className="block font-medium text-slate-900">
                                        {PERMISSION_LABELS[permission]}
                                      </span>
                                      {permission}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        </TabsContent>
                      </Tabs>
                      <DialogFooter>
                        <Button variant="outline" onClick={closeUserEditor}>
                          Cancelar
                        </Button>
                        <Button
                          disabled={!canManageUsers}
                          onClick={async () => {
                            if (!userEditor) return;
                            const saved = await handleSaveUser(userEditor);
                            if (saved) closeUserEditor();
                          }}
                        >
                          Salvar
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  )}
                </Dialog>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="roles">
            <Card className="border-slate-200">
              <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" />Permissoes por perfil</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-slate-500">
                  Permissoes base do perfil. No tab Usuarios voce pode personalizar permissoes por pessoa.
                </p>
                {roles.map((role) => (
                  <RoleEditor key={role.id} role={role} canManageRoles={canManageRoles} onSave={saveRolePermissions} />
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="license">
            <Card className="border-slate-200">
              <CardHeader><CardTitle>Licenca</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {license && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                    <p>Status: {license.status.toUpperCase()}</p>
                    <p>Assentos: {license.seatsUsed}/{license.maxUsers}</p>
                    <p>Expiracao: {formatDate(license.expiresAt)}</p>
                  </div>
                )}
                {licenseDraft && (
                  <div className="grid gap-2 md:grid-cols-2">
                    <Input value={licenseDraft.key} onChange={(e) => setLicenseDraft({ ...licenseDraft, key: e.target.value })} disabled={!canManageLicense} />
                    <Select
                      value={licenseDraft.status}
                      onValueChange={(value) => setLicenseDraft({ ...licenseDraft, status: value as LicenseDraft['status'] })}
                      disabled={!canManageLicense}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Ativa</SelectItem>
                        <SelectItem value="suspended">Suspensa</SelectItem>
                        <SelectItem value="expired">Expirada</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input type="number" min={1} value={licenseDraft.maxUsers} onChange={(e) => setLicenseDraft({ ...licenseDraft, maxUsers: Math.max(1, Number(e.target.value || 1)) })} disabled={!canManageLicense} />
                    <Input type="date" value={licenseDraft.expiresAt} onChange={(e) => setLicenseDraft({ ...licenseDraft, expiresAt: e.target.value })} disabled={!canManageLicense} />
                    <Button className="md:col-span-2" disabled={!canManageLicense} onClick={() => void saveLicense()}>Salvar licenca</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="audit">
            <Card className="border-slate-200">
              <CardHeader><CardTitle>Auditoria</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {auditLogs.map((log) => (
                  <div key={log.id} className="rounded-lg border border-slate-200 p-3 text-xs">
                    <p className="font-medium">{log.action}</p>
                    <p className="text-slate-500">{formatDate(log.createdAt)} - {log.actorUsername}</p>
                    <p className="text-slate-600">{log.details}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => void onRefreshProjects()}>Atualizar projetos</Button>
          <Button variant="outline" onClick={() => void loadAdminData()}>Atualizar admin</Button>
        </div>
      </div>
    </div>
  );
}

function RoleEditor({
  role,
  canManageRoles,
  onSave,
}: {
  role: ApiRole;
  canManageRoles: boolean;
  onSave: (role: ApiRole, rawPermissions: string) => Promise<void>;
}) {
  const [value, setValue] = useState(role.directPermissions.join(', '));

  useEffect(() => {
    setValue(role.directPermissions.join(', '));
  }, [role.directPermissions]);

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="text-sm font-semibold text-slate-900">{role.label}</p>
      <p className="mt-1 text-xs text-slate-500">Permissoes diretas (separadas por virgula)</p>
      <Input className="mt-2" value={value} onChange={(event) => setValue(event.target.value)} disabled={!canManageRoles} />
      <Button className="mt-2" size="sm" variant="outline" disabled={!canManageRoles} onClick={() => void onSave(role, value)}>
        Salvar perfil
      </Button>
    </div>
  );
}
