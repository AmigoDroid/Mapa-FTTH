import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  BarChart3,
  ShieldCheck,
  ShieldOff,
  Building2,
  Clock3,
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
  ApiRole,
  ApiSessionUser,
} from '@/api/types';
import {
  ALL_AUTH_PERMISSIONS,
  PERMISSION_LABELS,
  ROLE_LABELS,
  type AuthPermission,
  type AuthRole,
} from '@/auth/permissions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSystemAuth } from '@/store/systemAuthStore';

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const LICENSE_WARNING_DAYS = 30;
const AUDIT_LIMIT_OPTIONS = [100, 200, 500, 1000] as const;
const ROLE_ORDER: AuthRole[] = ['viewer', 'editor', 'manager', 'admin'];
const ALL_PERMISSION_SET = new Set<AuthPermission>(ALL_AUTH_PERMISSIONS);
const NUMBER_FORMATTER = new Intl.NumberFormat('pt-BR');
const PASSWORD_MIN_LENGTH = 8;
const USERNAME_REGEX = /^[a-z0-9._-]{3,40}$/;
const DISPLAY_NAME_MIN_LENGTH = 3;

const LICENSE_FEATURE_OPTIONS = [
  {
    id: 'api_access',
    label: 'Acesso a API',
    description: 'Permite integracoes externas e automacoes.',
  },
  {
    id: 'project_management',
    label: 'Gestao de projetos',
    description: 'Libera criacao e manutencao de projetos.',
  },
  {
    id: 'network_modeling',
    label: 'Modelagem de rede',
    description: 'Habilita desenho e edicao da topologia FTTH.',
  },
  {
    id: 'user_management',
    label: 'Gestao de usuarios',
    description: 'Libera CRUD de usuarios do provedor.',
  },
  {
    id: 'role_management',
    label: 'Gestao de perfis',
    description: 'Permite alterar permissoes dos perfis.',
  },
  {
    id: 'audit_logs',
    label: 'Logs de auditoria',
    description: 'Libera acesso aos logs internos do provedor.',
  },
] as const;
const LICENSE_FEATURE_IDS = LICENSE_FEATURE_OPTIONS.map((feature) => feature.id);

interface LicenseDraft {
  key: string;
  company: string;
  plan: string;
  status: 'active' | 'suspended' | 'expired';
  maxUsers: number;
  expiresAt: string;
  features: string[];
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

interface ProviderRiskData {
  level: 'healthy' | 'warning' | 'critical';
  score: number;
  reasons: string[];
  daysToExpire: number | null;
  seatUsagePct: number;
}

interface DashboardOverview {
  totalProviders: number;
  activeProviders: number;
  suspendedProviders: number;
  totalProjects: number;
  totalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  totalPrivilegedUsers: number;
  activePrivilegedUsers: number;
  totalSeats: number;
  seatUsagePct: number;
  expiringSoon: number;
  suspendedLicenses: number;
  expiredLicenses: number;
  providersWithAttention: number;
}

type ProviderFilter = 'all' | 'active' | 'suspended' | 'attention';
type ProviderUserFilter = 'all' | 'active' | 'inactive' | 'privileged';

const createDefaultRoleDrafts = (): Record<AuthRole, AuthPermission[]> => ({
  viewer: [],
  editor: [],
  manager: [],
  admin: [],
});

const formatDate = (iso: string) => {
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) return '-';
  return new Date(timestamp).toLocaleString('pt-BR');
};

const formatNumber = (value: number) => NUMBER_FORMATTER.format(value);

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

const normalizePermissions = (permissions: Array<AuthPermission | string>): AuthPermission[] => {
  const normalized = new Set<AuthPermission>();
  permissions.forEach((permission) => {
    if (ALL_PERMISSION_SET.has(permission as AuthPermission)) {
      normalized.add(permission as AuthPermission);
    }
  });
  return Array.from(normalized);
};

const mapRolesToDrafts = (roles: ApiRole[]): Record<AuthRole, AuthPermission[]> => {
  const next = createDefaultRoleDrafts();
  roles.forEach((role) => {
    next[role.id] = normalizePermissions(role.directPermissions);
  });
  return next;
};

const getDaysToExpire = (expiresAt: string): number | null => {
  const parsed = Date.parse(expiresAt);
  if (!Number.isFinite(parsed)) return null;
  return Math.ceil((parsed - Date.now()) / DAY_IN_MS);
};

const getSeatUsagePct = (provider: ApiProviderSummary) => {
  const maxUsers = provider.license.maxUsers;
  if (maxUsers <= 0) return 0;
  return Math.round((provider.license.seatsUsed / maxUsers) * 100);
};

const getProviderRiskData = (provider: ApiProviderSummary): ProviderRiskData => {
  let score = 0;
  const reasons: string[] = [];
  const daysToExpire = getDaysToExpire(provider.license.expiresAt);
  const seatUsagePct = getSeatUsagePct(provider);

  if (provider.status === 'suspended') {
    score += 4;
    reasons.push('Provedor suspenso pelo admin global.');
  }

  if (provider.license.state.isSuspended) {
    score += 4;
    reasons.push('Licenca suspensa.');
  } else if (provider.license.state.isExpired) {
    score += 4;
    reasons.push('Licenca expirada.');
  } else if (daysToExpire !== null && daysToExpire <= LICENSE_WARNING_DAYS) {
    score += 2;
    reasons.push(`Licenca vence em ${Math.max(0, daysToExpire)} dia(s).`);
  }

  if (seatUsagePct >= 100) {
    score += 3;
    reasons.push('Sem assentos disponiveis.');
  } else if (seatUsagePct >= 90) {
    score += 2;
    reasons.push('Uso de assentos acima de 90%.');
  } else if (seatUsagePct >= 75) {
    score += 1;
    reasons.push('Uso de assentos acima de 75%.');
  }

  const level: ProviderRiskData['level'] =
    score >= 5 ? 'critical' : score >= 2 ? 'warning' : 'healthy';

  return {
    level,
    score,
    reasons,
    daysToExpire,
    seatUsagePct,
  };
};

const getRiskBadgeClassName = (level: ProviderRiskData['level']) => {
  if (level === 'critical') return 'border-red-200 bg-red-50 text-red-700';
  if (level === 'warning') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-emerald-200 bg-emerald-50 text-emerald-700';
};

const getRiskLabel = (level: ProviderRiskData['level']) => {
  if (level === 'critical') return 'Critico';
  if (level === 'warning') return 'Atencao';
  return 'Saudavel';
};

const getProviderStatusLabel = (status: 'active' | 'suspended') =>
  status === 'active' ? 'Ativo' : 'Suspenso';

const getStatusBadgeClassName = (status: 'active' | 'suspended' | 'expired') => {
  if (status === 'active') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'suspended') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-red-200 bg-red-50 text-red-700';
};

const includeSearch = (search: string, ...values: string[]) => {
  const normalizedSearch = search.trim().toLowerCase();
  if (!normalizedSearch) return true;
  return values.some((value) => value.toLowerCase().includes(normalizedSearch));
};

const parseDateInputAsIso = (dateValue: string): string | null => {
  const parsed = Date.parse(`${dateValue}T23:59:59`);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
};

const addDaysToDateInput = (dateValue: string, days: number): string => {
  const base = Date.parse(`${dateValue}T00:00:00`);
  const safeBase = Number.isFinite(base) ? base : Date.now();
  return new Date(safeBase + days * DAY_IN_MS).toISOString().slice(0, 10);
};

const exportAuditLogs = (logs: ApiAuditLog[], prefix: string) => {
  if (logs.length === 0) {
    toast.error('Nenhum log disponivel para exportacao.');
    return;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `${prefix}-${timestamp}.json`;
  const blob = new Blob([JSON.stringify(logs, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
  toast.success('Arquivo de auditoria exportado.');
};

export function SystemDashboard() {
  const { admin, logout } = useSystemAuth();
  const [providers, setProviders] = useState<ApiProviderSummary[]>([]);
  const [auditLogs, setAuditLogs] = useState<ApiAuditLog[]>([]);
  const [providerAuditLogs, setProviderAuditLogs] = useState<ApiAuditLog[]>([]);
  const [providerRoles, setProviderRoles] = useState<ApiRole[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingProviderData, setLoadingProviderData] = useState(false);
  const [savingRoleId, setSavingRoleId] = useState<AuthRole | null>(null);

  const [providerSearch, setProviderSearch] = useState('');
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>('all');

  const [globalAuditSearch, setGlobalAuditSearch] = useState('');
  const [globalAuditActionFilter, setGlobalAuditActionFilter] = useState('all');
  const [globalAuditLimit, setGlobalAuditLimit] = useState<number>(200);

  const [providerAuditSearch, setProviderAuditSearch] = useState('');
  const [providerAuditActionFilter, setProviderAuditActionFilter] = useState('all');
  const [providerAuditLimit, setProviderAuditLimit] = useState<number>(200);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [managerUsername, setManagerUsername] = useState('manager');
  const [managerDisplayName, setManagerDisplayName] = useState('Gestor do Provedor');
  const [managerPassword, setManagerPassword] = useState('');
  const [managerRole, setManagerRole] = useState<AuthRole>('manager');
  const [maxUsers, setMaxUsers] = useState(20);
  const [plan, setPlan] = useState('enterprise');
  const [newProviderExpiresAt, setNewProviderExpiresAt] = useState(
    () => new Date(Date.now() + 365 * DAY_IN_MS).toISOString().slice(0, 10)
  );
  const [newProviderFeatures, setNewProviderFeatures] = useState<string[]>(
    () => [...LICENSE_FEATURE_IDS]
  );

  const [selectedProviderId, setSelectedProviderId] = useState<string>('');
  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === selectedProviderId) || null,
    [providers, selectedProviderId]
  );

  const [providerDraft, setProviderDraft] = useState<ProviderDraft | null>(null);
  const [licenseDraft, setLicenseDraft] = useState<LicenseDraft | null>(null);
  const [providerUsers, setProviderUsers] = useState<ProviderUserDraft[]>([]);
  const [providerProjects, setProviderProjects] = useState<ProviderProjectDraft[]>([]);
  const [roleDrafts, setRoleDrafts] = useState<Record<AuthRole, AuthPermission[]>>(
    () => createDefaultRoleDrafts()
  );

  const [providerUserSearch, setProviderUserSearch] = useState('');
  const [providerUserFilter, setProviderUserFilter] = useState<ProviderUserFilter>('all');
  const [providerProjectSearch, setProviderProjectSearch] = useState('');

  const [newUserUsername, setNewUserUsername] = useState('');
  const [newUserDisplayName, setNewUserDisplayName] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<AuthRole>('manager');
  const [newUserActive, setNewUserActive] = useState(true);

  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');

  const providerHealthRows = useMemo(
    () =>
      providers.map((provider) => ({
        provider,
        risk: getProviderRiskData(provider),
      })),
    [providers]
  );

  const overview = useMemo<DashboardOverview>(() => {
    let activeProviders = 0;
    let suspendedProviders = 0;
    let totalProjects = 0;
    let totalUsers = 0;
    let activeUsers = 0;
    let inactiveUsers = 0;
    let totalPrivilegedUsers = 0;
    let activePrivilegedUsers = 0;
    let totalSeats = 0;
    let expiringSoon = 0;
    let suspendedLicenses = 0;
    let expiredLicenses = 0;
    let providersWithAttention = 0;

    providerHealthRows.forEach(({ provider, risk }) => {
      if (provider.status === 'active') activeProviders += 1;
      if (provider.status === 'suspended') suspendedProviders += 1;
      totalProjects += provider.projectsCount;
      totalUsers += provider.usersCount;
      activeUsers += provider.activeUsersCount;
      inactiveUsers += provider.inactiveUsersCount;
      totalPrivilegedUsers += provider.privilegedUsersCount;
      activePrivilegedUsers += provider.activePrivilegedUsersCount;
      totalSeats += provider.license.maxUsers;
      if (provider.license.state.isSuspended) suspendedLicenses += 1;
      if (provider.license.state.isExpired) expiredLicenses += 1;
      if (
        provider.license.state.isActive &&
        risk.daysToExpire !== null &&
        risk.daysToExpire <= LICENSE_WARNING_DAYS
      ) {
        expiringSoon += 1;
      }
      if (risk.level !== 'healthy') providersWithAttention += 1;
    });

    return {
      totalProviders: providers.length,
      activeProviders,
      suspendedProviders,
      totalProjects,
      totalUsers,
      activeUsers,
      inactiveUsers,
      totalPrivilegedUsers,
      activePrivilegedUsers,
      totalSeats,
      seatUsagePct: totalSeats > 0 ? Math.round((activeUsers / totalSeats) * 100) : 0,
      expiringSoon,
      suspendedLicenses,
      expiredLicenses,
      providersWithAttention,
    };
  }, [providerHealthRows, providers.length]);

  const filteredProviders = useMemo(
    () =>
      providerHealthRows
        .filter(({ provider, risk }) => {
          if (
            !includeSearch(
              providerSearch,
              provider.name,
              provider.slug,
              provider.license.company
            )
          ) {
            return false;
          }

          if (providerFilter === 'active' && provider.status !== 'active') return false;
          if (providerFilter === 'suspended' && provider.status !== 'suspended') return false;
          if (providerFilter === 'attention' && risk.level === 'healthy') return false;
          return true;
        })
        .sort((left, right) => {
          if (right.risk.score !== left.risk.score) {
            return right.risk.score - left.risk.score;
          }
          return left.provider.name.localeCompare(right.provider.name, 'pt-BR');
        }),
    [providerFilter, providerHealthRows, providerSearch]
  );

  const topAlerts = useMemo(
    () =>
      providerHealthRows
        .filter((entry) => entry.risk.level !== 'healthy')
        .sort((left, right) => right.risk.score - left.risk.score)
        .slice(0, 6),
    [providerHealthRows]
  );

  const filteredProviderUsers = useMemo(
    () =>
      providerUsers.filter((user) => {
        if (!includeSearch(providerUserSearch, user.username, user.displayName, user.role)) {
          return false;
        }

        if (providerUserFilter === 'active' && !user.active) return false;
        if (providerUserFilter === 'inactive' && user.active) return false;
        if (
          providerUserFilter === 'privileged' &&
          user.role !== 'manager' &&
          user.role !== 'admin'
        ) {
          return false;
        }
        return true;
      }),
    [providerUserFilter, providerUserSearch, providerUsers]
  );

  const filteredProviderProjects = useMemo(
    () =>
      providerProjects.filter((project) =>
        includeSearch(providerProjectSearch, project.name, project.description)
      ),
    [providerProjectSearch, providerProjects]
  );

  const providerAuditActions = useMemo(
    () =>
      Array.from(new Set(providerAuditLogs.map((log) => log.action))).sort((left, right) =>
        left.localeCompare(right, 'pt-BR')
      ),
    [providerAuditLogs]
  );

  const globalAuditActions = useMemo(
    () =>
      Array.from(new Set(auditLogs.map((log) => log.action))).sort((left, right) =>
        left.localeCompare(right, 'pt-BR')
      ),
    [auditLogs]
  );

  const filteredProviderAuditLogs = useMemo(
    () =>
      providerAuditLogs.filter((log) => {
        if (providerAuditActionFilter !== 'all' && log.action !== providerAuditActionFilter) {
          return false;
        }
        return includeSearch(
          providerAuditSearch,
          log.action,
          log.details,
          log.targetType,
          log.targetId,
          log.actorUsername || '',
          log.actorId || ''
        );
      }),
    [providerAuditActionFilter, providerAuditLogs, providerAuditSearch]
  );

  const filteredGlobalAuditLogs = useMemo(
    () =>
      auditLogs.filter((log) => {
        if (globalAuditActionFilter !== 'all' && log.action !== globalAuditActionFilter) {
          return false;
        }
        return includeSearch(
          globalAuditSearch,
          log.action,
          log.details,
          log.targetType,
          log.targetId,
          log.actorUsername || '',
          log.actorId || ''
        );
      }),
    [auditLogs, globalAuditActionFilter, globalAuditSearch]
  );

  const selectedProviderRisk = useMemo(
    () => (selectedProvider ? getProviderRiskData(selectedProvider) : null),
    [selectedProvider]
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [nextProviders, nextLogs] = await Promise.all([
        systemApi.listProviders(),
        systemApi.listAuditLogs(globalAuditLimit),
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
  }, [globalAuditLimit]);

  const loadProviderData = useCallback(async (providerId: string) => {
    setLoadingProviderData(true);
    try {
      const [users, projects, roles, logs] = await Promise.all([
        systemApi.listProviderUsers(providerId),
        systemApi.listProviderProjects(providerId),
        systemApi.listProviderRoles(providerId),
        systemApi.listProviderAuditLogs(providerId, providerAuditLimit),
      ]);
      setProviderUsers(users.map(mapUserToDraft));
      setProviderProjects(projects.map(mapProjectToDraft));
      setProviderRoles(roles);
      setRoleDrafts(mapRolesToDrafts(roles));
      setProviderAuditLogs(logs);
    } catch (error) {
      setProviderUsers([]);
      setProviderProjects([]);
      setProviderRoles([]);
      setRoleDrafts(createDefaultRoleDrafts());
      setProviderAuditLogs([]);
      toast.error(toErrorMessage(error, 'Falha ao carregar dados do provedor.'));
    } finally {
      setLoadingProviderData(false);
    }
  }, [providerAuditLimit]);

  useEffect(() => {
    if (!selectedProvider) {
      setProviderDraft(null);
      setLicenseDraft(null);
      setProviderUsers([]);
      setProviderProjects([]);
      setProviderRoles([]);
      setRoleDrafts(createDefaultRoleDrafts());
      setProviderAuditLogs([]);
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
      features: [...selectedProvider.license.features],
    });
    setNewUserUsername('');
    setNewUserDisplayName('');
    setNewUserPassword('');
    setNewUserRole('manager');
    setNewUserActive(true);
    setNewProjectName('');
    setNewProjectDescription('');
    setProviderUserSearch('');
    setProviderUserFilter('all');
    setProviderProjectSearch('');
    setProviderAuditSearch('');
    setProviderAuditActionFilter('all');
  }, [selectedProvider]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!selectedProviderId) return;
    void loadProviderData(selectedProviderId);
  }, [loadProviderData, selectedProviderId]);

  useEffect(() => {
    if (globalAuditActionFilter !== 'all' && !globalAuditActions.includes(globalAuditActionFilter)) {
      setGlobalAuditActionFilter('all');
    }
  }, [globalAuditActionFilter, globalAuditActions]);

  useEffect(() => {
    if (
      providerAuditActionFilter !== 'all' &&
      !providerAuditActions.includes(providerAuditActionFilter)
    ) {
      setProviderAuditActionFilter('all');
    }
  }, [providerAuditActionFilter, providerAuditActions]);

  const refreshSelectedProviderData = async () => {
    if (!selectedProviderId) {
      await loadData();
      return;
    }
    await Promise.all([loadData(), loadProviderData(selectedProviderId)]);
  };

  const toggleFeature = (current: string[], featureId: string, enabled: boolean) => {
    const next = new Set(current);
    if (enabled) next.add(featureId);
    else next.delete(featureId);
    return Array.from(next);
  };

  const handleCreateProvider = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim() || !managerPassword.trim()) {
      toast.error('Preencha nome do provedor e senha do gestor.');
      return;
    }
    if (!USERNAME_REGEX.test(managerUsername.trim().toLowerCase())) {
      toast.error('Usuario do gestor invalido. Use 3 a 40 caracteres sem espacos.');
      return;
    }
    if (managerDisplayName.trim().length < DISPLAY_NAME_MIN_LENGTH) {
      toast.error('Informe o nome do gestor com ao menos 3 caracteres.');
      return;
    }
    if (managerPassword.trim().length < PASSWORD_MIN_LENGTH) {
      toast.error(`A senha inicial do gestor deve ter ao menos ${PASSWORD_MIN_LENGTH} caracteres.`);
      return;
    }
    if (!['manager', 'admin'].includes(managerRole)) {
      toast.error('O usuario inicial precisa ser Gestor ou Administrador.');
      return;
    }
    if (newProviderFeatures.length === 0) {
      toast.error('Selecione ao menos um recurso de licenca para o provedor.');
      return;
    }

    const expiresAt = parseDateInputAsIso(newProviderExpiresAt);
    if (!expiresAt) {
      toast.error('Informe uma data de expiracao valida para a licenca.');
      return;
    }

    try {
      const provider = await systemApi.createProvider({
        name: name.trim(),
        slug: slug.trim() || undefined,
        managerUsername: managerUsername.trim() || 'manager',
        managerDisplayName: managerDisplayName.trim() || 'Gestor do Provedor',
        managerPassword: managerPassword,
        managerRole,
        maxUsers,
        plan: plan.trim() || undefined,
        expiresAt,
        features: newProviderFeatures,
      });
      setName('');
      setSlug('');
      setManagerUsername('manager');
      setManagerDisplayName('Gestor do Provedor');
      setManagerPassword('');
      setManagerRole('manager');
      setMaxUsers(20);
      setPlan('enterprise');
      setNewProviderExpiresAt(
        new Date(Date.now() + 365 * DAY_IN_MS).toISOString().slice(0, 10)
      );
      setNewProviderFeatures([...LICENSE_FEATURE_IDS]);
      await loadData();
      setSelectedProviderId(provider.id);
      toast.success('Provedor criado com sucesso.');
    } catch (error) {
      toast.error(toErrorMessage(error, 'Falha ao criar provedor.'));
    }
  };

  const saveProviderMeta = async () => {
    if (!selectedProvider || !providerDraft) return;
    if (!providerDraft.name.trim() || !providerDraft.slug.trim()) {
      toast.error('Nome e slug do provedor sao obrigatorios.');
      return;
    }
    try {
      await systemApi.updateProvider(selectedProvider.id, {
        name: providerDraft.name.trim(),
        slug: providerDraft.slug.trim(),
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
    if (!licenseDraft.key.trim() || !licenseDraft.company.trim() || !licenseDraft.plan.trim()) {
      toast.error('Preencha chave, empresa e plano da licenca.');
      return;
    }
    if (licenseDraft.features.length === 0) {
      toast.error('Selecione ao menos um recurso habilitado na licenca.');
      return;
    }
    const expiresAt = parseDateInputAsIso(licenseDraft.expiresAt);
    if (!expiresAt) {
      toast.error('Data de expiracao invalida.');
      return;
    }
    try {
      await systemApi.updateProviderLicense(selectedProvider.id, {
        key: licenseDraft.key,
        company: licenseDraft.company,
        plan: licenseDraft.plan,
        status: licenseDraft.status,
        maxUsers: licenseDraft.maxUsers,
        expiresAt,
        features: licenseDraft.features,
      });
      await loadData();
      toast.success('Licenca do provedor atualizada.');
    } catch (error) {
      toast.error(toErrorMessage(error, 'Falha ao atualizar licenca.'));
    }
  };

  const authorizeProvider = async () => {
    if (!selectedProvider) return;
    if (!window.confirm(`Autorizar o provedor "${selectedProvider.name}" e liberar acesso?`)) return;
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
    if (!window.confirm(`Suspender o provedor "${selectedProvider.name}"? Os acessos serao bloqueados.`)) {
      return;
    }
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
    if (!window.confirm(`Excluir o provedor "${selectedProvider.name}"?`)) return;
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
      toast.error('Preencha usuario de acesso, nome e senha para criar o usuario.');
      return;
    }
    if (!USERNAME_REGEX.test(username)) {
      toast.error('Usuario de acesso invalido. Use 3 a 40 caracteres sem espacos.');
      return;
    }
    if (displayName.length < DISPLAY_NAME_MIN_LENGTH) {
      toast.error('Nome do usuario deve ter ao menos 3 caracteres.');
      return;
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      toast.error(`A senha do usuario deve ter ao menos ${PASSWORD_MIN_LENGTH} caracteres.`);
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
      toast.error('Usuario de acesso e nome sao obrigatorios.');
      return;
    }
    if (!USERNAME_REGEX.test(username)) {
      toast.error('Usuario de acesso invalido. Use 3 a 40 caracteres sem espacos.');
      return;
    }
    if (displayName.length < DISPLAY_NAME_MIN_LENGTH) {
      toast.error('Nome do usuario deve ter ao menos 3 caracteres.');
      return;
    }
    if (draft.password.trim() && draft.password.trim().length < PASSWORD_MIN_LENGTH) {
      toast.error(`Nova senha deve ter ao menos ${PASSWORD_MIN_LENGTH} caracteres.`);
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
    if (projectName.length < 3) {
      toast.error('Nome do projeto deve ter ao menos 3 caracteres.');
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

  const updateRoleDraftPermission = (
    roleId: AuthRole,
    permission: AuthPermission,
    enabled: boolean
  ) => {
    setRoleDrafts((current) => {
      const nextPermissions = normalizePermissions(
        enabled
          ? [...current[roleId], permission]
          : current[roleId].filter((item) => item !== permission)
      );
      return {
        ...current,
        [roleId]: nextPermissions,
      };
    });
  };

  const roleHasChanges = (roleId: AuthRole) => {
    const persisted = normalizePermissions(
      providerRoles.find((role) => role.id === roleId)?.directPermissions || []
    );
    const draft = normalizePermissions(roleDrafts[roleId]);
    if (persisted.length !== draft.length) return true;
    return persisted.some((permission) => !draft.includes(permission));
  };

  const saveProviderRole = async (roleId: AuthRole) => {
    if (!selectedProvider) return;
    setSavingRoleId(roleId);
    try {
      const roles = await systemApi.updateProviderRole(selectedProvider.id, roleId, {
        directPermissions: roleDrafts[roleId],
      });
      setProviderRoles(roles);
      setRoleDrafts(mapRolesToDrafts(roles));
      await loadData();
      toast.success(`Perfil ${ROLE_LABELS[roleId]} atualizado.`);
    } catch (error) {
      toast.error(toErrorMessage(error, 'Falha ao atualizar perfil do provedor.'));
    } finally {
      setSavingRoleId(null);
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
                Governanca completa de provedores, licencas, usuarios, gestores, perfis e auditoria.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-right">
                <p className="text-xs text-slate-500">{admin?.displayName || 'Administrador Global'}</p>
                <Badge variant="secondary" className="mt-1">
                  Acesso Global
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

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <Card className="border-slate-200 py-4">
            <CardHeader className="pb-0">
              <CardTitle className="flex items-center justify-between text-base">
                Provedores
                <Building2 className="h-4 w-4 text-blue-600" />
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              <p className="text-2xl font-semibold text-slate-900">
                {formatNumber(overview.totalProviders)}
              </p>
              <p className="text-xs text-slate-600">
                ativos: {formatNumber(overview.activeProviders)} | suspensos:{' '}
                {formatNumber(overview.suspendedProviders)}
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-200 py-4">
            <CardHeader className="pb-0">
              <CardTitle className="flex items-center justify-between text-base">
                Assentos
                <Users className="h-4 w-4 text-indigo-600" />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-2">
              <p className="text-2xl font-semibold text-slate-900">
                {formatNumber(overview.activeUsers)}/{formatNumber(overview.totalSeats)}
              </p>
              <Progress value={overview.seatUsagePct} />
              <p className="text-xs text-slate-600">uso medio global: {overview.seatUsagePct}%</p>
            </CardContent>
          </Card>

          <Card className="border-slate-200 py-4">
            <CardHeader className="pb-0">
              <CardTitle className="flex items-center justify-between text-base">
                Gestores e admins
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              <p className="text-2xl font-semibold text-slate-900">
                {formatNumber(overview.activePrivilegedUsers)}/{formatNumber(overview.totalPrivilegedUsers)}
              </p>
              <p className="text-xs text-slate-600">
                usuarios inativos: {formatNumber(overview.inactiveUsers)}
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-200 py-4">
            <CardHeader className="pb-0">
              <CardTitle className="flex items-center justify-between text-base">
                Licencas em risco
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              <p className="text-2xl font-semibold text-slate-900">
                {formatNumber(overview.expiredLicenses + overview.suspendedLicenses)}
              </p>
              <p className="text-xs text-slate-600">
                expiram em {LICENSE_WARNING_DAYS} dias: {formatNumber(overview.expiringSoon)}
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-200 py-4">
            <CardHeader className="pb-0">
              <CardTitle className="flex items-center justify-between text-base">
                Projetos
                <FolderKanban className="h-4 w-4 text-emerald-600" />
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              <p className="text-2xl font-semibold text-slate-900">
                {formatNumber(overview.totalProjects)}
              </p>
              <p className="text-xs text-slate-600">
                usuarios totais: {formatNumber(overview.totalUsers)}
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-200 py-4">
            <CardHeader className="pb-0">
              <CardTitle className="flex items-center justify-between text-base">
                Provedores com alerta
                <BarChart3 className="h-4 w-4 text-rose-600" />
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              <p className="text-2xl font-semibold text-slate-900">
                {formatNumber(overview.providersWithAttention)}
              </p>
              <p className="text-xs text-slate-600">monitoramento priorizado por risco</p>
            </CardContent>
          </Card>
        </div>

        {topAlerts.length > 0 && (
          <Card className="border-amber-200 bg-amber-50/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-amber-900">
                <AlertTriangle className="h-4 w-4" />
                Alertas prioritarios
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {topAlerts.map(({ provider, risk }) => (
                <div
                  key={provider.id}
                  className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-slate-700"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-slate-900">{provider.name}</p>
                    <Badge variant="outline" className={getRiskBadgeClassName(risk.level)}>
                      {getRiskLabel(risk.level)}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500">
                    {provider.slug} | pontuacao de risco: {risk.score}
                  </p>
                  {risk.reasons[0] && <p className="mt-1 text-xs">{risk.reasons[0]}</p>}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
          <div className="space-y-4">
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
                    <Input
                      placeholder="Ex.: Provedor Norte"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Slug (opcional)</Label>
                    <Input
                      value={slug}
                      onChange={(event) => setSlug(event.target.value)}
                      placeholder="ex: provedor-x"
                    />
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Usuario gestor</Label>
                      <Input
                        placeholder="Ex.: gestor.norte"
                        value={managerUsername}
                        onChange={(event) => setManagerUsername(event.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Perfil do gestor</Label>
                      <Select
                        value={managerRole}
                        onValueChange={(value) => setManagerRole(value as AuthRole)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o perfil inicial" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="viewer">Leitura</SelectItem>
                          <SelectItem value="editor">Editor</SelectItem>
                          <SelectItem value="manager">Gestor</SelectItem>
                          <SelectItem value="admin">Administrador</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Nome do gestor</Label>
                    <Input
                      placeholder="Ex.: Gestor Regional Norte"
                      value={managerDisplayName}
                      onChange={(event) => setManagerDisplayName(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Senha inicial do gestor</Label>
                    <Input
                      type="password"
                      placeholder={`Minimo ${PASSWORD_MIN_LENGTH} caracteres`}
                      value={managerPassword}
                      onChange={(event) => setManagerPassword(event.target.value)}
                    />
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Plano</Label>
                      <Input
                        placeholder="Ex.: enterprise"
                        value={plan}
                        onChange={(event) => setPlan(event.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Expira em</Label>
                      <Input
                        type="date"
                        placeholder="Selecione a data de expiracao"
                        value={newProviderExpiresAt}
                        onChange={(event) => setNewProviderExpiresAt(event.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Maximo de usuarios</Label>
                    <Input
                      type="number"
                      min={1}
                      placeholder="Ex.: 20"
                      value={maxUsers}
                      onChange={(event) => setMaxUsers(Math.max(1, Number(event.target.value || 1)))}
                    />
                  </div>

                  <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-slate-900">Recursos da licenca</p>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setNewProviderFeatures([...LICENSE_FEATURE_IDS])}
                        >
                          Marcar tudo
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setNewProviderFeatures([])}
                        >
                          Limpar
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {LICENSE_FEATURE_OPTIONS.map((feature) => (
                        <label
                          key={feature.id}
                          className="flex cursor-pointer items-start gap-2 rounded-md border border-slate-200 bg-white p-2"
                        >
                          <Checkbox
                            checked={newProviderFeatures.includes(feature.id)}
                            onCheckedChange={(checked) =>
                              setNewProviderFeatures((current) =>
                                toggleFeature(current, feature.id, checked === true)
                              )
                            }
                          />
                          <span className="text-xs text-slate-700">
                            <span className="block font-medium text-slate-900">
                              {feature.label}
                            </span>
                            {feature.description}
                          </span>
                        </label>
                      ))}
                    </div>
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
                  Diretorio de Provedores ({filteredProviders.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  placeholder="Buscar por nome, slug ou empresa..."
                  value={providerSearch}
                  onChange={(event) => setProviderSearch(event.target.value)}
                />
                <Select
                  value={providerFilter}
                  onValueChange={(value) => setProviderFilter(value as ProviderFilter)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="active">Somente ativos</SelectItem>
                    <SelectItem value="suspended">Somente suspensos</SelectItem>
                    <SelectItem value="attention">Com alerta</SelectItem>
                  </SelectContent>
                </Select>

                {loading ? (
                  <p className="text-sm text-slate-500">Carregando dados globais...</p>
                ) : (
                  <ScrollArea className="h-[38vh] pr-2">
                    <div className="space-y-2">
                      {filteredProviders.map(({ provider, risk }) => (
                        <button
                          type="button"
                          key={provider.id}
                          onClick={() => setSelectedProviderId(provider.id)}
                          className={`w-full rounded-lg border p-3 text-left transition-colors ${
                            provider.id === selectedProviderId
                              ? 'border-blue-300 bg-blue-50'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-semibold text-slate-900">{provider.name}</p>
                            <Badge variant="outline" className={getRiskBadgeClassName(risk.level)}>
                              {getRiskLabel(risk.level)}
                            </Badge>
                          </div>
                          <p className="text-xs text-slate-500">
                            {provider.slug} | usuarios ativos: {provider.activeUsersCount}/
                            {provider.license.maxUsers} | gestores/admins ativos:{' '}
                            {provider.activePrivilegedUsersCount}/{provider.privilegedUsersCount} | inativos:{' '}
                            {provider.inactiveUsersCount} | projetos: {provider.projectsCount}
                          </p>
                        </button>
                      ))}
                      {filteredProviders.length === 0 && (
                        <p className="text-sm text-slate-500">
                          Nenhum provedor encontrado para os filtros atuais.
                        </p>
                      )}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="h-4 w-4 text-slate-700" />
                Controle do Provedor Selecionado
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!selectedProvider ? (
                <p className="text-sm text-slate-500">Selecione um provedor para editar.</p>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-slate-900">{selectedProvider.name}</p>
                      <div className="flex gap-2">
                        <Badge
                          variant="outline"
                          className={getStatusBadgeClassName(selectedProvider.status)}
                        >
                          {getProviderStatusLabel(selectedProvider.status)}
                        </Badge>
                        {selectedProviderRisk && (
                          <Badge
                            variant="outline"
                            className={getRiskBadgeClassName(selectedProviderRisk.level)}
                          >
                            {getRiskLabel(selectedProviderRisk.level)}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <p>Slug: {selectedProvider.slug}</p>
                    <p>
                      Usuarios: {selectedProvider.activeUsersCount}/
                      {selectedProvider.license.maxUsers}
                    </p>
                    <p>
                      Gestores/admins ativos: {selectedProvider.activePrivilegedUsersCount}/
                      {selectedProvider.privilegedUsersCount}
                    </p>
                    <p>Usuarios inativos: {selectedProvider.inactiveUsersCount}</p>
                    <p>Projetos: {selectedProvider.projectsCount}</p>
                    <p>Expira: {formatDate(selectedProvider.license.expiresAt)}</p>
                    <div className="mt-2 space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span>Uso de assentos</span>
                        <span>{selectedProviderRisk?.seatUsagePct ?? 0}%</span>
                      </div>
                      <Progress value={selectedProviderRisk?.seatUsagePct ?? 0} />
                    </div>
                    {selectedProviderRisk && selectedProviderRisk.reasons.length > 0 && (
                      <p className="mt-2 text-xs text-slate-600">{selectedProviderRisk.reasons[0]}</p>
                    )}
                  </div>

                  {providerDraft && (
                    <div className="space-y-2 rounded-lg border border-slate-200 p-3">
                      <p className="text-sm font-medium text-slate-900">Dados do provedor</p>
                      <div className="grid gap-2 md:grid-cols-3">
                        <Input
                          placeholder="Nome do provedor"
                          value={providerDraft.name}
                          onChange={(event) =>
                            setProviderDraft({
                              ...providerDraft,
                              name: event.target.value,
                            })
                          }
                        />
                        <Input
                          placeholder="Slug do provedor"
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
                            <SelectValue placeholder="Status do provedor" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="active">Ativo</SelectItem>
                            <SelectItem value="suspended">Suspenso</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button variant="outline" onClick={saveProviderMeta}>
                        Salvar provedor
                      </Button>
                    </div>
                  )}

                  {licenseDraft && (
                    <div className="space-y-3 rounded-lg border border-slate-200 p-3">
                      <p className="text-sm font-medium text-slate-900">Licenca</p>
                      <div className="grid gap-2 md:grid-cols-2">
                        <Input
                          placeholder="Chave da licenca"
                          value={licenseDraft.key}
                          onChange={(event) =>
                            setLicenseDraft({ ...licenseDraft, key: event.target.value })
                          }
                        />
                        <Input
                          placeholder="Empresa da licenca"
                          value={licenseDraft.company}
                          onChange={(event) =>
                            setLicenseDraft({ ...licenseDraft, company: event.target.value })
                          }
                        />
                        <Input
                          placeholder="Plano da licenca"
                          value={licenseDraft.plan}
                          onChange={(event) =>
                            setLicenseDraft({ ...licenseDraft, plan: event.target.value })
                          }
                        />
                        <Select
                          value={licenseDraft.status}
                          onValueChange={(value) =>
                            setLicenseDraft({
                              ...licenseDraft,
                              status: value as LicenseDraft['status'],
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Status da licenca" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="active">Ativa</SelectItem>
                            <SelectItem value="suspended">Suspensa</SelectItem>
                            <SelectItem value="expired">Expirada</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          min={1}
                          placeholder="Maximo de usuarios"
                          value={licenseDraft.maxUsers}
                          onChange={(event) =>
                            setLicenseDraft({
                              ...licenseDraft,
                              maxUsers: Math.max(1, Number(event.target.value || 1)),
                            })
                          }
                        />
                        <Input
                          type="date"
                          placeholder="Data de expiracao"
                          value={licenseDraft.expiresAt}
                          onChange={(event) =>
                            setLicenseDraft({ ...licenseDraft, expiresAt: event.target.value })
                          }
                        />
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setLicenseDraft({
                              ...licenseDraft,
                              expiresAt: addDaysToDateInput(licenseDraft.expiresAt, 30),
                            })
                          }
                        >
                          +30 dias
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setLicenseDraft({
                              ...licenseDraft,
                              expiresAt: addDaysToDateInput(licenseDraft.expiresAt, 90),
                            })
                          }
                        >
                          +90 dias
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setLicenseDraft({
                              ...licenseDraft,
                              expiresAt: addDaysToDateInput(licenseDraft.expiresAt, 365),
                            })
                          }
                        >
                          +1 ano
                        </Button>
                      </div>

                      <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-slate-900">Recursos habilitados</p>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setLicenseDraft({
                                  ...licenseDraft,
                                  features: [...LICENSE_FEATURE_IDS],
                                })
                              }
                            >
                              Marcar tudo
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setLicenseDraft({
                                  ...licenseDraft,
                                  features: [],
                                })
                              }
                            >
                              Limpar
                            </Button>
                          </div>
                        </div>
                        <div className="grid gap-2 md:grid-cols-2">
                          {LICENSE_FEATURE_OPTIONS.map((feature) => (
                            <label
                              key={feature.id}
                              className="flex cursor-pointer items-start gap-2 rounded-md border border-slate-200 bg-white p-2"
                            >
                              <Checkbox
                                checked={licenseDraft.features.includes(feature.id)}
                                onCheckedChange={(checked) =>
                                  setLicenseDraft({
                                    ...licenseDraft,
                                    features: toggleFeature(
                                      licenseDraft.features,
                                      feature.id,
                                      checked === true
                                    ),
                                  })
                                }
                              />
                              <span className="text-xs text-slate-700">
                                <span className="block font-medium text-slate-900">
                                  {feature.label}
                                </span>
                                {feature.description}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <Button variant="outline" onClick={saveLicense}>
                        Salvar licenca
                      </Button>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={authorizeProvider}>
                      <ShieldCheck className="mr-1 h-4 w-4" />
                      Autorizar
                    </Button>
                    <Button variant="outline" onClick={revokeProvider}>
                      <ShieldOff className="mr-1 h-4 w-4" />
                      Revogar
                    </Button>
                    <Button variant="destructive" onClick={removeProvider}>
                      <Trash2 className="mr-1 h-4 w-4" />
                      Excluir provedor
                    </Button>
                  </div>
                </div>
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
                      placeholder="Usuario de acesso (ex.: gestor.norte)"
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
                      placeholder={`Senha inicial (minimo ${PASSWORD_MIN_LENGTH} caracteres)`}
                      value={newUserPassword}
                      onChange={(event) => setNewUserPassword(event.target.value)}
                    />
                    <Select
                      value={newUserRole}
                      onValueChange={(value) => setNewUserRole(value as AuthRole)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Perfil de acesso" />
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

                  <Input
                    placeholder="Filtrar usuarios..."
                    value={providerUserSearch}
                    onChange={(event) => setProviderUserSearch(event.target.value)}
                  />
                  <Select
                    value={providerUserFilter}
                    onValueChange={(value) => setProviderUserFilter(value as ProviderUserFilter)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Filtro de usuarios" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os usuarios</SelectItem>
                      <SelectItem value="active">Somente ativos</SelectItem>
                      <SelectItem value="inactive">Somente inativos</SelectItem>
                      <SelectItem value="privileged">Somente gestores/admins</SelectItem>
                    </SelectContent>
                  </Select>

                  {loadingProviderData ? (
                    <p className="text-sm text-slate-500">Carregando usuarios...</p>
                  ) : (
                    <ScrollArea className="h-[34vh] pr-2">
                      <div className="space-y-2">
                        {filteredProviderUsers.map((user) => (
                          <div key={user.id} className="space-y-2 rounded-lg border border-slate-200 p-3">
                            <div className="grid gap-2 md:grid-cols-2">
                              <Input
                                placeholder="Usuario de acesso"
                                value={user.username}
                                onChange={(event) =>
                                  updateProviderUserDraft(user.id, {
                                    username: event.target.value,
                                  })
                                }
                              />
                              <Input
                                placeholder="Nome completo do usuario"
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
                                  <SelectValue placeholder="Perfil" />
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
                                  <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="active">Ativo</SelectItem>
                                  <SelectItem value="inactive">Inativo</SelectItem>
                                </SelectContent>
                              </Select>
                              <Input
                                type="password"
                                placeholder={`Nova senha (opcional, minimo ${PASSWORD_MIN_LENGTH})`}
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
                        {filteredProviderUsers.length === 0 && (
                          <p className="text-sm text-slate-500">
                            Nenhum usuario encontrado para o filtro atual.
                          </p>
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

                  <Input
                    placeholder="Filtrar projetos por nome ou descricao..."
                    value={providerProjectSearch}
                    onChange={(event) => setProviderProjectSearch(event.target.value)}
                  />

                  {loadingProviderData ? (
                    <p className="text-sm text-slate-500">Carregando projetos...</p>
                  ) : (
                    <ScrollArea className="h-[34vh] pr-2">
                      <div className="space-y-2">
                        {filteredProviderProjects.map((project) => (
                          <div key={project.id} className="space-y-2 rounded-lg border border-slate-200 p-3">
                            <div className="grid gap-2">
                              <Input
                                placeholder="Nome do projeto"
                                value={project.name}
                                onChange={(event) =>
                                  updateProviderProjectDraft(project.id, {
                                    name: event.target.value,
                                  })
                                }
                              />
                              <Input
                                placeholder="Descricao do projeto (opcional)"
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
                        {filteredProviderProjects.length === 0 && (
                          <p className="text-sm text-slate-500">
                            Nenhum projeto encontrado para o filtro atual.
                          </p>
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
            <CardTitle className="text-base">Perfis e permissoes do provedor</CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedProvider ? (
              <p className="text-sm text-slate-500">
                Selecione um provedor para editar perfis e permissoes.
              </p>
            ) : loadingProviderData ? (
              <p className="text-sm text-slate-500">Carregando perfis...</p>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {ROLE_ORDER.map((roleId) => {
                  const role = providerRoles.find((item) => item.id === roleId);
                  const directPermissions = roleDrafts[roleId];
                  const roleIsSaving = savingRoleId === roleId;
                  return (
                    <div key={roleId} className="space-y-3 rounded-lg border border-slate-200 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold text-slate-900">{ROLE_LABELS[roleId]}</p>
                          <p className="text-xs text-slate-500">
                            perfil herdado: {role?.parentRole || 'nenhum'} | diretas: {directPermissions.length}
                            {role ? ` | efetivas: ${role.effectivePermissions.length}` : ''}
                          </p>
                        </div>
                        {roleHasChanges(roleId) && (
                          <Badge
                            variant="outline"
                            className="border-blue-200 bg-blue-50 text-blue-700"
                          >
                            Alteracoes pendentes
                          </Badge>
                        )}
                      </div>
                      <div className="grid gap-2 md:grid-cols-2">
                        {ALL_AUTH_PERMISSIONS.map((permission) => (
                          <label
                            key={`${roleId}:${permission}`}
                            className="flex cursor-pointer items-start gap-2 rounded-md border border-slate-200 bg-slate-50 p-2"
                          >
                            <Checkbox
                              checked={directPermissions.includes(permission)}
                              onCheckedChange={(checked) =>
                                updateRoleDraftPermission(roleId, permission, checked === true)
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
                      <Button
                        variant="outline"
                        onClick={() => void saveProviderRole(roleId)}
                        disabled={roleIsSaving || !roleHasChanges(roleId)}
                      >
                        {roleIsSaving ? 'Salvando...' : `Salvar perfil ${ROLE_LABELS[roleId]}`}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock3 className="h-4 w-4 text-slate-700" />
                Auditoria do Provedor
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {selectedProvider ? (
                <>
                  <div className="grid gap-2 md:grid-cols-2">
                    <Input
                      placeholder="Filtrar logs do provedor..."
                      value={providerAuditSearch}
                      onChange={(event) => setProviderAuditSearch(event.target.value)}
                    />
                    <Select
                      value={providerAuditActionFilter}
                      onValueChange={setProviderAuditActionFilter}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Filtrar por acao" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas as acoes</SelectItem>
                        {providerAuditActions.map((action) => (
                          <SelectItem key={action} value={action}>
                            {action}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value={String(providerAuditLimit)}
                      onValueChange={(value) => setProviderAuditLimit(Number(value))}
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue placeholder="Limite" />
                      </SelectTrigger>
                      <SelectContent>
                        {AUDIT_LIMIT_OPTIONS.map((limit) => (
                          <SelectItem key={limit} value={String(limit)}>
                            Limite {limit}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      onClick={() => void loadProviderData(selectedProvider.id)}
                    >
                      Recarregar
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        exportAuditLogs(
                          filteredProviderAuditLogs,
                          `auditoria-provedor-${selectedProvider.slug}`
                        )
                      }
                    >
                      Exportar JSON
                    </Button>
                  </div>
                  <ScrollArea className="h-[34vh] pr-2">
                    <div className="space-y-2">
                      {filteredProviderAuditLogs.map((log) => (
                        <div key={log.id} className="rounded-lg border border-slate-200 p-3 text-xs">
                          <p className="font-medium text-slate-900">{log.action}</p>
                          <p className="text-slate-500">
                            {formatDate(log.createdAt)} - {log.actorUsername || log.actorId || 'sistema'}
                          </p>
                          <p className="text-slate-600">
                            alvo: {log.targetType} ({log.targetId})
                          </p>
                          <p className="text-slate-600">{log.details}</p>
                        </div>
                      ))}
                      {filteredProviderAuditLogs.length === 0 && (
                        <p className="text-sm text-slate-500">
                          Nenhum log encontrado para os filtros selecionados.
                        </p>
                      )}
                    </div>
                  </ScrollArea>
                </>
              ) : (
                <p className="text-sm text-slate-500">
                  Selecione um provedor para carregar a auditoria.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="text-base">Auditoria Global</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 md:grid-cols-2">
                <Input
                  placeholder="Filtrar auditoria global..."
                  value={globalAuditSearch}
                  onChange={(event) => setGlobalAuditSearch(event.target.value)}
                />
                <Select value={globalAuditActionFilter} onValueChange={setGlobalAuditActionFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filtrar por acao" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as acoes</SelectItem>
                    {globalAuditActions.map((action) => (
                      <SelectItem key={action} value={action}>
                        {action}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={String(globalAuditLimit)}
                  onValueChange={(value) => setGlobalAuditLimit(Number(value))}
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Limite" />
                  </SelectTrigger>
                  <SelectContent>
                    {AUDIT_LIMIT_OPTIONS.map((limit) => (
                      <SelectItem key={limit} value={String(limit)}>
                        Limite {limit}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={() => void loadData()}>
                  Recarregar
                </Button>
                <Button
                  variant="outline"
                  onClick={() => exportAuditLogs(filteredGlobalAuditLogs, 'auditoria-global')}
                >
                  Exportar JSON
                </Button>
              </div>
              <ScrollArea className="h-[34vh] pr-2">
                <div className="space-y-2">
                  {filteredGlobalAuditLogs.map((log) => (
                    <div key={log.id} className="rounded-lg border border-slate-200 p-3 text-xs">
                      <p className="font-medium text-slate-900">{log.action}</p>
                      <p className="text-slate-500">
                        {formatDate(log.createdAt)} - {log.actorId || log.actorUsername || 'sistema'}
                      </p>
                      <p className="text-slate-600">
                        alvo: {log.targetType} ({log.targetId})
                      </p>
                      <p className="text-slate-600">{log.details}</p>
                    </div>
                  ))}
                  {filteredGlobalAuditLogs.length === 0 && (
                    <p className="text-sm text-slate-500">
                      Nenhum log global encontrado para os filtros selecionados.
                    </p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
