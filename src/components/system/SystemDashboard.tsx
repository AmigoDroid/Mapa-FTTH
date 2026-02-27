import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import {
  ShieldCheck,
  ShieldOff,
  Building2,
  LogOut,
  RefreshCcw,
  Trash2,
  Plus,
  Users,
  FolderKanban,
} from 'lucide-react';
import { systemApi } from '@/api/systemApi';
import type {
  ApiAuditLog,
  ApiProjectSummary,
  ApiProviderSummary,
  ApiSessionUser,
} from '@/api/types';
import type { AuthRole } from '@/auth/permissions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSystemAuth } from '@/store/systemAuthStore';

interface LicenseDraft {
  key: string;
  company: string;
  plan: string;
  status: 'active' | 'suspended' | 'expired';
  maxUsers: number;
  expiresAt: string;
}

interface ProviderDraft {
  name: string;
  slug: string;
  status: 'active' | 'suspended';
}

interface ProviderUserDraft {
  id: string;
  username: string;
  displayName: string;
  role: AuthRole;
  active: boolean;
  password: string;
}

interface ProviderProjectDraft {
  id: string;
  name: string;
  description: string;
  updatedAt: string;
  cityCount: number;
  popCount: number;
  boxCount: number;
  cableCount: number;
  reserveCount: number;
}

const formatDate = (iso: string) => {
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) return '-';
  return new Date(timestamp).toLocaleString('pt-BR');
};

const toErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const mapUserToDraft = (user: ApiSessionUser): ProviderUserDraft => ({
  id: user.id,
  username: user.username,
  displayName: user.displayName,
  role: user.role,
  active: user.active,
  password: '',
});

const mapProjectToDraft = (project: ApiProjectSummary): ProviderProjectDraft => ({
  id: project.id,
  name: project.name,
  description: project.description || '',
  updatedAt: project.updatedAt,
  cityCount: project.cityCount,
  popCount: project.popCount,
  boxCount: project.boxCount,
  cableCount: project.cableCount,
  reserveCount: project.reserveCount,
});

export function SystemDashboard() {
  const { admin, logout } = useSystemAuth();
  const [providers, setProviders] = useState<ApiProviderSummary[]>([]);
  const [auditLogs, setAuditLogs] = useState<ApiAuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingProviderData, setLoadingProviderData] = useState(false);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [managerUsername, setManagerUsername] = useState('manager');
  const [managerDisplayName, setManagerDisplayName] = useState('Gestor do Provedor');
  const [managerPassword, setManagerPassword] = useState('');
  const [maxUsers, setMaxUsers] = useState(20);

  const [selectedProviderId, setSelectedProviderId] = useState<string>('');
  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === selectedProviderId) || null,
    [providers, selectedProviderId]
  );

  const [providerDraft, setProviderDraft] = useState<ProviderDraft | null>(null);
  const [licenseDraft, setLicenseDraft] = useState<LicenseDraft | null>(null);
  const [providerUsers, setProviderUsers] = useState<ProviderUserDraft[]>([]);
  const [providerProjects, setProviderProjects] = useState<ProviderProjectDraft[]>([]);

  const [newUserUsername, setNewUserUsername] = useState('');
  const [newUserDisplayName, setNewUserDisplayName] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<AuthRole>('manager');
  const [newUserActive, setNewUserActive] = useState(true);

  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [nextProviders, nextLogs] = await Promise.all([
        systemApi.listProviders(),
        systemApi.listAuditLogs(120),
      ]);
      setProviders(nextProviders);
      setAuditLogs(nextLogs);
      setSelectedProviderId((currentId) => {
        if (nextProviders.length === 0) return '';
        if (nextProviders.some((provider) => provider.id === currentId)) return currentId;
        return nextProviders[0].id;
      });
    } catch (error) {
      toast.error(toErrorMessage(error, 'Falha ao carregar dados globais.'));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadProviderData = useCallback(async (providerId: string) => {
    setLoadingProviderData(true);
    try {
      const [users, projects] = await Promise.all([
        systemApi.listProviderUsers(providerId),
        systemApi.listProviderProjects(providerId),
      ]);
      setProviderUsers(users.map(mapUserToDraft));
      setProviderProjects(projects.map(mapProjectToDraft));
    } catch (error) {
      setProviderUsers([]);
      setProviderProjects([]);
      toast.error(toErrorMessage(error, 'Falha ao carregar usuarios e projetos do provedor.'));
    } finally {
      setLoadingProviderData(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedProvider) {
      setProviderDraft(null);
      setLicenseDraft(null);
      setProviderUsers([]);
      setProviderProjects([]);
      return;
    }

    setProviderDraft({
      name: selectedProvider.name,
      slug: selectedProvider.slug,
      status: selectedProvider.status,
    });
    setLicenseDraft({
      key: selectedProvider.license.key,
      company: selectedProvider.license.company,
      plan: selectedProvider.license.plan,
      status: selectedProvider.license.status,
      maxUsers: selectedProvider.license.maxUsers,
      expiresAt: selectedProvider.license.expiresAt.slice(0, 10),
    });
    setNewUserUsername('');
    setNewUserDisplayName('');
    setNewUserPassword('');
    setNewUserRole('manager');
    setNewUserActive(true);
    setNewProjectName('');
    setNewProjectDescription('');
  }, [selectedProvider]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!selectedProviderId) return;
    void loadProviderData(selectedProviderId);
  }, [loadProviderData, selectedProviderId]);

  const refreshSelectedProviderData = async () => {
    if (!selectedProviderId) {
      await loadData();
      return;
    }
    await Promise.all([loadData(), loadProviderData(selectedProviderId)]);
  };

  const handleCreateProvider = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim() || !managerPassword.trim()) {
      toast.error('Preencha nome do provedor e senha do gestor.');
      return;
    }

    try {
      const provider = await systemApi.createProvider({
        name: name.trim(),
        slug: slug.trim() || undefined,
        managerUsername: managerUsername.trim() || 'manager',
        managerDisplayName: managerDisplayName.trim() || 'Gestor do Provedor',
        managerPassword: managerPassword,
        maxUsers,
      });
      setName('');
      setSlug('');
      setManagerUsername('manager');
      setManagerDisplayName('Gestor do Provedor');
      setManagerPassword('');
      setMaxUsers(20);
      await loadData();
      setSelectedProviderId(provider.id);
      toast.success('Provedor criado com sucesso.');
    } catch (error) {
      toast.error(toErrorMessage(error, 'Falha ao criar provedor.'));
    }
  };

  const saveProviderMeta = async () => {
    if (!selectedProvider || !providerDraft) return;
    try {
      await systemApi.updateProvider(selectedProvider.id, {
        name: providerDraft.name,
        slug: providerDraft.slug,
        status: providerDraft.status,
      });
      await loadData();
      toast.success('Dados do provedor atualizados.');
    } catch (error) {
      toast.error(toErrorMessage(error, 'Falha ao atualizar provedor.'));
    }
  };

  const saveLicense = async () => {
    if (!selectedProvider || !licenseDraft) return;
    try {
      await systemApi.updateProviderLicense(selectedProvider.id, {
        key: licenseDraft.key,
        company: licenseDraft.company,
        plan: licenseDraft.plan,
        status: licenseDraft.status,
        maxUsers: licenseDraft.maxUsers,
        expiresAt: new Date(`${licenseDraft.expiresAt}T23:59:59`).toISOString(),
      });
      await loadData();
      toast.success('Licenca do provedor atualizada.');
    } catch (error) {
      toast.error(toErrorMessage(error, 'Falha ao atualizar licenca.'));
    }
  };

  const authorizeProvider = async () => {
    if (!selectedProvider) return;
    try {
      await systemApi.authorizeProvider(selectedProvider.id);
      await loadData();
      toast.success('Provedor autorizado.');
    } catch (error) {
      toast.error(toErrorMessage(error, 'Falha ao autorizar provedor.'));
    }
  };

  const revokeProvider = async () => {
    if (!selectedProvider) return;
    try {
      await systemApi.revokeProvider(selectedProvider.id);
      await loadData();
      toast.success('Provedor revogado/suspenso.');
    } catch (error) {
      toast.error(toErrorMessage(error, 'Falha ao revogar provedor.'));
    }
  };

  const removeProvider = async () => {
    if (!selectedProvider) return;
    try {
      await systemApi.deleteProvider(selectedProvider.id);
      await loadData();
      toast.success('Provedor removido.');
    } catch (error) {
      toast.error(toErrorMessage(error, 'Falha ao remover provedor.'));
    }
  };

  const updateProviderUserDraft = (
    userId: string,
    patch: Partial<Omit<ProviderUserDraft, 'id'>>
  ) => {
    setProviderUsers((current) =>
      current.map((user) => (user.id === userId ? { ...user, ...patch } : user))
    );
  };

  const handleCreateProviderUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedProvider) return;

    const username = newUserUsername.trim().toLowerCase();
    const displayName = newUserDisplayName.trim();
    const password = newUserPassword.trim();
    if (!username || !displayName || !password) {
      toast.error('Preencha username, nome e senha para criar usuario.');
      return;
    }

    try {
      await systemApi.createProviderUser(selectedProvider.id, {
        username,
        displayName,
        password,
        role: newUserRole,
        active: newUserActive,
      });
      setNewUserUsername('');
      setNewUserDisplayName('');
      setNewUserPassword('');
      setNewUserRole('manager');
      setNewUserActive(true);
      await refreshSelectedProviderData();
      toast.success('Usuario criado no provedor.');
    } catch (error) {
      toast.error(toErrorMessage(error, 'Falha ao criar usuario do provedor.'));
    }
  };

  const handleSaveProviderUser = async (draft: ProviderUserDraft) => {
    if (!selectedProvider) return;
    const username = draft.username.trim().toLowerCase();
    const displayName = draft.displayName.trim();
    if (!username || !displayName) {
      toast.error('Username e nome sao obrigatorios.');
      return;
    }

    try {
      await systemApi.updateProviderUser(selectedProvider.id, draft.id, {
        username,
        displayName,
        role: draft.role,
        active: draft.active,
        ...(draft.password.trim() ? { password: draft.password.trim() } : {}),
      });
      await refreshSelectedProviderData();
      toast.success('Usuario atualizado.');
    } catch (error) {
      toast.error(toErrorMessage(error, 'Falha ao atualizar usuario.'));
    }
  };

  const handleDeleteProviderUser = async (draft: ProviderUserDraft) => {
    if (!selectedProvider) return;
    if (!window.confirm(`Excluir o usuario "${draft.username}" deste provedor?`)) return;
    try {
      await systemApi.deleteProviderUser(selectedProvider.id, draft.id);
      await refreshSelectedProviderData();
      toast.success('Usuario removido.');
    } catch (error) {
      toast.error(toErrorMessage(error, 'Falha ao remover usuario.'));
    }
  };

  const updateProviderProjectDraft = (
    projectId: string,
    patch: Partial<Omit<ProviderProjectDraft, 'id'>>
  ) => {
    setProviderProjects((current) =>
      current.map((project) =>
        project.id === projectId ? { ...project, ...patch } : project
      )
    );
  };

  const handleCreateProviderProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedProvider) return;

    const projectName = newProjectName.trim();
    const description = newProjectDescription.trim();
    if (!projectName) {
      toast.error('Informe o nome do projeto.');
      return;
    }

    try {
      await systemApi.createProviderProject(selectedProvider.id, {
        name: projectName,
        description: description || undefined,
      });
      setNewProjectName('');
      setNewProjectDescription('');
      await refreshSelectedProviderData();
      toast.success('Projeto criado no provedor.');
    } catch (error) {
      toast.error(toErrorMessage(error, 'Falha ao criar projeto.'));
    }
  };

  const handleSaveProviderProject = async (draft: ProviderProjectDraft) => {
    if (!selectedProvider) return;
    const projectName = draft.name.trim();
    if (!projectName) {
      toast.error('Nome do projeto obrigatorio.');
      return;
    }

    try {
      await systemApi.updateProviderProject(selectedProvider.id, draft.id, {
        name: projectName,
        description: draft.description.trim() || undefined,
      });
      await refreshSelectedProviderData();
      toast.success('Projeto atualizado.');
    } catch (error) {
      toast.error(toErrorMessage(error, 'Falha ao atualizar projeto.'));
    }
  };

  const handleDeleteProviderProject = async (draft: ProviderProjectDraft) => {
    if (!selectedProvider) return;
    if (!window.confirm(`Excluir o projeto "${draft.name}" deste provedor?`)) return;
    try {
      await systemApi.deleteProviderProject(selectedProvider.id, draft.id);
      await refreshSelectedProviderData();
      toast.success('Projeto removido.');
    } catch (error) {
      toast.error(toErrorMessage(error, 'Falha ao remover projeto.'));
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-200 via-slate-100 to-white px-4 py-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <header className="rounded-2xl border border-slate-300/80 bg-white/90 px-5 py-5 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Painel Global</p>
              <h1 className="mt-1 text-2xl font-semibold text-slate-900">Controle Total de Provedores</h1>
              <p className="mt-1 text-sm text-slate-600">
                Cadastre provedores, revogue/autorize acesso e administre licencas.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-right">
                <p className="text-xs text-slate-500">{admin?.displayName || 'Admin'}</p>
                <Badge variant="secondary" className="mt-1">
                  Global
                </Badge>
              </div>
              <Button variant="outline" onClick={() => void refreshSelectedProviderData()}>
                <RefreshCcw className="mr-1 h-4 w-4" />
                Atualizar
              </Button>
              <Button variant="outline" onClick={logout}>
                <LogOut className="mr-1 h-4 w-4" />
                Sair
              </Button>
            </div>
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Plus className="h-4 w-4 text-emerald-600" />
                Novo Provedor
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={handleCreateProvider}>
                <div className="space-y-2">
                  <Label>Nome do provedor</Label>
                  <Input value={name} onChange={(event) => setName(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Slug (opcional)</Label>
                  <Input value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="ex: provedor-x" />
                </div>
                <div className="space-y-2">
                  <Label>Usuario gestor</Label>
                  <Input value={managerUsername} onChange={(event) => setManagerUsername(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Nome do gestor</Label>
                  <Input value={managerDisplayName} onChange={(event) => setManagerDisplayName(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Senha inicial do gestor</Label>
                  <Input type="password" value={managerPassword} onChange={(event) => setManagerPassword(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Maximo de usuarios</Label>
                  <Input type="number" min={1} value={maxUsers} onChange={(event) => setMaxUsers(Math.max(1, Number(event.target.value || 1)))} />
                </div>
                <Button className="w-full" type="submit">
                  Cadastrar provedor
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-4 w-4 text-blue-600" />
                Provedores ({providers.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select value={selectedProviderId} onValueChange={setSelectedProviderId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um provedor" />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((provider) => (
                    <SelectItem key={provider.id} value={provider.id}>
                      {provider.name} ({provider.slug})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {loading ? (
                <p className="text-sm text-slate-500">Carregando dados globais...</p>
              ) : selectedProvider ? (
                <div className="space-y-3">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                    <p className="font-semibold text-slate-900">{selectedProvider.name}</p>
                    <p>Slug: {selectedProvider.slug}</p>
                    <p>Status: {selectedProvider.status}</p>
                    <p>Usuarios: {selectedProvider.activeUsersCount}/{selectedProvider.license.maxUsers}</p>
                    <p>Projetos: {selectedProvider.projectsCount}</p>
                    <p>Expira: {formatDate(selectedProvider.license.expiresAt)}</p>
                  </div>

                  {providerDraft && (
                    <div className="grid gap-2 md:grid-cols-3">
                      <Input
                        value={providerDraft.name}
                        onChange={(event) =>
                          setProviderDraft({
                            ...providerDraft,
                            name: event.target.value,
                          })
                        }
                      />
                      <Input
                        value={providerDraft.slug}
                        onChange={(event) =>
                          setProviderDraft({
                            ...providerDraft,
                            slug: event.target.value,
                          })
                        }
                      />
                      <Select
                        value={providerDraft.status}
                        onValueChange={(value) =>
                          setProviderDraft({
                            ...providerDraft,
                            status: value as ProviderDraft['status'],
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Ativo</SelectItem>
                          <SelectItem value="suspended">Suspenso</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {licenseDraft && (
                    <div className="grid gap-2 md:grid-cols-2">
                      <Input value={licenseDraft.key} onChange={(event) => setLicenseDraft({ ...licenseDraft, key: event.target.value })} />
                      <Input value={licenseDraft.company} onChange={(event) => setLicenseDraft({ ...licenseDraft, company: event.target.value })} />
                      <Input value={licenseDraft.plan} onChange={(event) => setLicenseDraft({ ...licenseDraft, plan: event.target.value })} />
                      <Select
                        value={licenseDraft.status}
                        onValueChange={(value) =>
                          setLicenseDraft({
                            ...licenseDraft,
                            status: value as LicenseDraft['status'],
                          })
                        }
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Ativa</SelectItem>
                          <SelectItem value="suspended">Suspensa</SelectItem>
                          <SelectItem value="expired">Expirada</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input type="number" min={1} value={licenseDraft.maxUsers} onChange={(event) => setLicenseDraft({ ...licenseDraft, maxUsers: Math.max(1, Number(event.target.value || 1)) })} />
                      <Input type="date" value={licenseDraft.expiresAt} onChange={(event) => setLicenseDraft({ ...licenseDraft, expiresAt: event.target.value })} />
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={saveProviderMeta}>
                      Salvar provedor
                    </Button>
                    <Button variant="outline" onClick={saveLicense}>
                      Salvar licenca
                    </Button>
                    <Button variant="outline" onClick={authorizeProvider}>
                      <ShieldCheck className="mr-1 h-4 w-4" />
                      Autorizar
                    </Button>
                    <Button variant="outline" onClick={revokeProvider}>
                      <ShieldOff className="mr-1 h-4 w-4" />
                      Revogar
                    </Button>
                    <Button variant="outline" onClick={removeProvider}>
                      <Trash2 className="mr-1 h-4 w-4" />
                      Excluir
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500">Selecione um provedor para editar.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4 text-indigo-600" />
                Usuarios do Provedor
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!selectedProvider ? (
                <p className="text-sm text-slate-500">Selecione um provedor para gerenciar usuarios.</p>
              ) : (
                <>
                  <form className="grid gap-2 md:grid-cols-2" onSubmit={handleCreateProviderUser}>
                    <Input
                      placeholder="Username"
                      value={newUserUsername}
                      onChange={(event) => setNewUserUsername(event.target.value)}
                    />
                    <Input
                      placeholder="Nome do usuario"
                      value={newUserDisplayName}
                      onChange={(event) => setNewUserDisplayName(event.target.value)}
                    />
                    <Input
                      type="password"
                      placeholder="Senha inicial"
                      value={newUserPassword}
                      onChange={(event) => setNewUserPassword(event.target.value)}
                    />
                    <Select
                      value={newUserRole}
                      onValueChange={(value) => setNewUserRole(value as AuthRole)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="viewer">Leitura</SelectItem>
                        <SelectItem value="editor">Editor</SelectItem>
                        <SelectItem value="manager">Gestor</SelectItem>
                        <SelectItem value="admin">Administrador</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select
                      value={newUserActive ? 'active' : 'inactive'}
                      onValueChange={(value) => setNewUserActive(value === 'active')}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Ativo</SelectItem>
                        <SelectItem value="inactive">Inativo</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button type="submit">Criar usuario</Button>
                  </form>

                  {loadingProviderData ? (
                    <p className="text-sm text-slate-500">Carregando usuarios...</p>
                  ) : (
                    <ScrollArea className="h-[34vh] pr-2">
                      <div className="space-y-2">
                        {providerUsers.map((user) => (
                          <div key={user.id} className="space-y-2 rounded-lg border border-slate-200 p-3">
                            <div className="grid gap-2 md:grid-cols-2">
                              <Input
                                value={user.username}
                                onChange={(event) =>
                                  updateProviderUserDraft(user.id, {
                                    username: event.target.value,
                                  })
                                }
                              />
                              <Input
                                value={user.displayName}
                                onChange={(event) =>
                                  updateProviderUserDraft(user.id, {
                                    displayName: event.target.value,
                                  })
                                }
                              />
                              <Select
                                value={user.role}
                                onValueChange={(value) =>
                                  updateProviderUserDraft(user.id, {
                                    role: value as AuthRole,
                                  })
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="viewer">Leitura</SelectItem>
                                  <SelectItem value="editor">Editor</SelectItem>
                                  <SelectItem value="manager">Gestor</SelectItem>
                                  <SelectItem value="admin">Administrador</SelectItem>
                                </SelectContent>
                              </Select>
                              <Select
                                value={user.active ? 'active' : 'inactive'}
                                onValueChange={(value) =>
                                  updateProviderUserDraft(user.id, {
                                    active: value === 'active',
                                  })
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="active">Ativo</SelectItem>
                                  <SelectItem value="inactive">Inativo</SelectItem>
                                </SelectContent>
                              </Select>
                              <Input
                                type="password"
                                placeholder="Nova senha (opcional)"
                                value={user.password}
                                onChange={(event) =>
                                  updateProviderUserDraft(user.id, {
                                    password: event.target.value,
                                  })
                                }
                              />
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button variant="outline" onClick={() => void handleSaveProviderUser(user)}>
                                Salvar
                              </Button>
                              <Button variant="outline" onClick={() => void handleDeleteProviderUser(user)}>
                                <Trash2 className="mr-1 h-4 w-4" />
                                Excluir
                              </Button>
                            </div>
                          </div>
                        ))}
                        {providerUsers.length === 0 && (
                          <p className="text-sm text-slate-500">Nenhum usuario cadastrado neste provedor.</p>
                        )}
                      </div>
                    </ScrollArea>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FolderKanban className="h-4 w-4 text-emerald-600" />
                Projetos do Provedor
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!selectedProvider ? (
                <p className="text-sm text-slate-500">Selecione um provedor para gerenciar projetos.</p>
              ) : (
                <>
                  <form className="grid gap-2 md:grid-cols-2" onSubmit={handleCreateProviderProject}>
                    <Input
                      placeholder="Nome do projeto"
                      value={newProjectName}
                      onChange={(event) => setNewProjectName(event.target.value)}
                    />
                    <Input
                      placeholder="Descricao (opcional)"
                      value={newProjectDescription}
                      onChange={(event) => setNewProjectDescription(event.target.value)}
                    />
                    <Button type="submit" className="md:col-span-2">
                      Criar projeto
                    </Button>
                  </form>

                  {loadingProviderData ? (
                    <p className="text-sm text-slate-500">Carregando projetos...</p>
                  ) : (
                    <ScrollArea className="h-[34vh] pr-2">
                      <div className="space-y-2">
                        {providerProjects.map((project) => (
                          <div key={project.id} className="space-y-2 rounded-lg border border-slate-200 p-3">
                            <div className="grid gap-2">
                              <Input
                                value={project.name}
                                onChange={(event) =>
                                  updateProviderProjectDraft(project.id, {
                                    name: event.target.value,
                                  })
                                }
                              />
                              <Input
                                value={project.description}
                                onChange={(event) =>
                                  updateProviderProjectDraft(project.id, {
                                    description: event.target.value,
                                  })
                                }
                              />
                            </div>
                            <p className="text-xs text-slate-500">
                              Atualizado: {formatDate(project.updatedAt)} | cidades: {project.cityCount} | pops: {project.popCount} | caixas: {project.boxCount} | cabos: {project.cableCount} | reservas: {project.reserveCount}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              <Button variant="outline" onClick={() => void handleSaveProviderProject(project)}>
                                Salvar
                              </Button>
                              <Button variant="outline" onClick={() => void handleDeleteProviderProject(project)}>
                                <Trash2 className="mr-1 h-4 w-4" />
                                Excluir
                              </Button>
                            </div>
                          </div>
                        ))}
                        {providerProjects.length === 0 && (
                          <p className="text-sm text-slate-500">Nenhum projeto cadastrado neste provedor.</p>
                        )}
                      </div>
                    </ScrollArea>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle>Auditoria Global</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[28vh] pr-2">
              <div className="space-y-2">
                {auditLogs.map((log) => (
                  <div key={log.id} className="rounded-lg border border-slate-200 p-3 text-xs">
                    <p className="font-medium text-slate-900">{log.action}</p>
                    <p className="text-slate-500">{formatDate(log.createdAt)} - {log.actorId || log.actorUsername || 'system'}</p>
                    <p className="text-slate-600">{log.details}</p>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
