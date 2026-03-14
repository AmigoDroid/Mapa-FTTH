import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { projectApi } from '@/api/adminApi';
import { LoginScreen } from '@/components/auth/LoginScreen';
import { ProjectDashboard } from '@/components/dashboard/ProjectDashboard';
import { Toaster } from '@/components/ui/sonner';
import { NetworkWorkspace } from '@/components/workspace/NetworkWorkspace';
import { downloadNetworkAsKml } from '@/lib/projectKmlExport';
import { useAuth } from '@/store/authStore';
import { getLastOpenedProjectId, setLastOpenedProjectId, type ProjectSummary } from '@/store/projectStorage';
import { useNetworkStore } from '@/store/networkStore';
import type { Network } from '@/types/ftth';

type AppScreen = 'dashboard' | 'workspace';

const toErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

function App() {
  const { provider, currentUser, isAuthenticated, isHydrating, can, logout, refreshSession } = useAuth();
  const { currentNetwork, setCurrentNetwork, resetNetwork } = useNetworkStore();
  const [screen, setScreen] = useState<AppScreen>('dashboard');
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const hydratedUserIdRef = useRef<string | null>(null);
  const autosaveErrorAtRef = useRef(0);
  const projectScope = provider?.id || 'default';
  const currentNetworkRef = useRef<Network | null>(null);
  const projectScopeRef = useRef(projectScope);
  const authStateRef = useRef({
    isAuthenticated,
    userId: currentUser?.id || null,
    screen,
  });
  const autosaveStateRef = useRef({
    timerId: null as number | null,
    pending: false,
    inFlight: false,
    firstDirtyAt: 0,
    lastSavedAt: 0,
    lastSavedUpdatedAt: '',
    backoffMs: 0,
  });
  const autosaveConfig = {
    debounceMs: 1200,
    minIntervalMs: 5000,
    maxWaitMs: 15000,
    baseBackoffMs: 2000,
    maxBackoffMs: 30000,
  };

  useEffect(() => {
    currentNetworkRef.current = currentNetwork;
  }, [currentNetwork]);

  useEffect(() => {
    projectScopeRef.current = projectScope;
  }, [projectScope]);

  useEffect(() => {
    authStateRef.current = {
      isAuthenticated,
      userId: currentUser?.id || null,
      screen,
    };
  }, [isAuthenticated, currentUser?.id, screen]);

  const refreshProjects = useCallback(async (silent = false) => {
    try {
      const response = await projectApi.listProjects();
      setProjects(response);
    } catch (error) {
      if (!silent) {
        toast.error(toErrorMessage(error, 'Falha ao carregar projetos da API.'));
      }
    }
  }, []);

  useEffect(() => {
    if (isHydrating) return;
    if (!isAuthenticated || !currentUser) {
      hydratedUserIdRef.current = null;
      setScreen('dashboard');
      setProjects([]);
      return;
    }

    let cancelled = false;
    const hydrate = async () => {
      await refreshProjects(true);
      if (cancelled) return;
      if (hydratedUserIdRef.current === currentUser.id) return;
      hydratedUserIdRef.current = currentUser.id;

      const lastOpenedId = getLastOpenedProjectId(projectScope);
      if (!lastOpenedId) {
        setScreen('dashboard');
        return;
      }

      try {
        const project = await projectApi.loadProject(lastOpenedId);
        if (cancelled) return;
        setCurrentNetwork(project.network);
        setScreen('workspace');
      } catch {
        setLastOpenedProjectId(null, projectScope);
        setScreen('dashboard');
      }
    };

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [currentUser, isAuthenticated, isHydrating, projectScope, refreshProjects, setCurrentNetwork]);

  const scheduleAutosaveRef = useRef<() => void>(() => {});

  const runAutosave = useCallback(() => {
    const state = autosaveStateRef.current;
    state.timerId = null;

    const authState = authStateRef.current;
    if (!authState.isAuthenticated || !authState.userId || authState.screen !== 'workspace') {
      state.pending = false;
      state.firstDirtyAt = 0;
      return;
    }

    if (state.inFlight || !state.pending) {
      return;
    }

    const network = currentNetworkRef.current;
    if (!network) {
      state.pending = false;
      state.firstDirtyAt = 0;
      return;
    }

    const updatedAt = network.updatedAt || '';
    if (!updatedAt || updatedAt === state.lastSavedUpdatedAt) {
      state.pending = false;
      state.firstDirtyAt = 0;
      return;
    }

    const now = Date.now();
    const timeSinceLastSave = now - state.lastSavedAt;
    if (timeSinceLastSave < autosaveConfig.minIntervalMs) {
      scheduleAutosaveRef.current();
      return;
    }

    state.inFlight = true;
    const saveScope = projectScopeRef.current;
    const saveUpdatedAt = updatedAt;

    void projectApi
      .saveProjectNetwork(network.id, network, network.name, network.description)
      .then(() => {
        state.lastSavedAt = Date.now();
        state.lastSavedUpdatedAt = saveUpdatedAt;
        state.backoffMs = 0;
        setLastOpenedProjectId(network.id, saveScope);

        if (currentNetworkRef.current?.updatedAt !== saveUpdatedAt) {
          state.pending = true;
          if (!state.firstDirtyAt) state.firstDirtyAt = Date.now();
        } else {
          state.pending = false;
          state.firstDirtyAt = 0;
        }
      })
      .catch((error) => {
        state.pending = true;
        state.backoffMs = state.backoffMs
          ? Math.min(state.backoffMs * 2, autosaveConfig.maxBackoffMs)
          : autosaveConfig.baseBackoffMs;
        const now = Date.now();
        if (now - autosaveErrorAtRef.current > 3000) {
          autosaveErrorAtRef.current = now;
          toast.error(toErrorMessage(error, 'Falha ao sincronizar projeto com a API.'));
        }
      })
      .finally(() => {
        state.inFlight = false;
        if (state.pending) {
          scheduleAutosaveRef.current();
        }
      });
  }, [autosaveConfig.baseBackoffMs, autosaveConfig.maxBackoffMs, autosaveConfig.minIntervalMs]);

  const scheduleAutosave = useCallback(() => {
    const state = autosaveStateRef.current;
    if (state.timerId) return;

    const now = Date.now();
    const timeSinceLastSave = now - state.lastSavedAt;
    const timeSinceDirty = state.firstDirtyAt ? now - state.firstDirtyAt : 0;

    let delay = autosaveConfig.debounceMs;

    if (timeSinceLastSave < autosaveConfig.minIntervalMs) {
      delay = Math.max(delay, autosaveConfig.minIntervalMs - timeSinceLastSave);
    }

    if (state.backoffMs > 0) {
      delay = Math.max(delay, state.backoffMs);
    }

    if (timeSinceDirty >= autosaveConfig.maxWaitMs) {
      delay = Math.max(0, autosaveConfig.minIntervalMs - timeSinceLastSave);
    }

    state.timerId = window.setTimeout(() => {
      runAutosave();
    }, delay);
  }, [autosaveConfig.debounceMs, autosaveConfig.minIntervalMs, autosaveConfig.maxWaitMs, runAutosave]);

  useEffect(() => {
    scheduleAutosaveRef.current = scheduleAutosave;
  }, [scheduleAutosave]);

  useEffect(() => {
    const state = autosaveStateRef.current;
    if (!currentNetwork?.id) {
      if (state.timerId) {
        window.clearTimeout(state.timerId);
        state.timerId = null;
      }
      state.pending = false;
      state.inFlight = false;
      state.firstDirtyAt = 0;
      state.backoffMs = 0;
      state.lastSavedUpdatedAt = '';
      return;
    }

    state.pending = false;
    state.inFlight = false;
    state.firstDirtyAt = 0;
    state.backoffMs = 0;
    state.lastSavedUpdatedAt = currentNetwork.updatedAt || '';
  }, [currentNetwork?.id]);

  useEffect(() => {
    if (!isAuthenticated || !currentUser || screen !== 'workspace' || !currentNetwork) return;

    const state = autosaveStateRef.current;
    const updatedAt = currentNetwork.updatedAt || '';
    if (!updatedAt || updatedAt === state.lastSavedUpdatedAt) return;

    state.pending = true;
    if (!state.firstDirtyAt) state.firstDirtyAt = Date.now();
    scheduleAutosaveRef.current();
  }, [currentNetwork?.updatedAt, currentNetwork?.id, currentUser, isAuthenticated, screen]);

  useEffect(() => {
    return () => {
      const state = autosaveStateRef.current;
      if (state.timerId) {
        window.clearTimeout(state.timerId);
        state.timerId = null;
      }
    };
  }, []);

  const handleLogout = useCallback(() => {
    resetNetwork();
    setScreen('dashboard');
    logout();
  }, [logout, resetNetwork]);

  const handleCreateProject = useCallback(
    async (name: string, description?: string): Promise<boolean> => {
      if (!name.trim()) {
        toast.error('Informe um nome para o projeto.');
        return false;
      }

      try {
        const created = await projectApi.createProject(name.trim(), description?.trim() || undefined);
        await refreshProjects(true);
        setLastOpenedProjectId(created.id, projectScope);
        toast.success('Projeto criado com sucesso.');
        return true;
      } catch (error) {
        toast.error(toErrorMessage(error, 'Nao foi possivel criar o projeto.'));
        return false;
      }
    },
    [projectScope, refreshProjects]
  );

  const handleOpenProject = useCallback(
    async (projectId: string) => {
      try {
        const project = await projectApi.loadProject(projectId);
        setCurrentNetwork(project.network);
        setLastOpenedProjectId(projectId, projectScope);
        setScreen('workspace');
      } catch (error) {
        await refreshProjects(true);
        toast.error(toErrorMessage(error, 'Projeto nao encontrado na API.'));
      }
    },
    [projectScope, refreshProjects, setCurrentNetwork]
  );

  const handleDeleteProject = useCallback(
    async (projectId: string) => {
      try {
        await projectApi.deleteProject(projectId);
        if (currentNetwork && currentNetwork.id === projectId) {
          resetNetwork();
          setScreen('dashboard');
        }
        await refreshProjects(true);
        toast.success('Projeto removido com sucesso.');
      } catch (error) {
        toast.error(toErrorMessage(error, 'Falha ao remover projeto.'));
      }
    },
    [currentNetwork, refreshProjects, resetNetwork]
  );

  const handleExportProject = useCallback(
    async (projectId: string) => {
      try {
        const network =
          currentNetwork?.id === projectId
            ? currentNetwork
            : (await projectApi.loadProject(projectId)).network;
        downloadNetworkAsKml(network);
        toast.success('Arquivo KML exportado para Google Maps.');
      } catch (error) {
        toast.error(toErrorMessage(error, 'Falha ao exportar projeto.'));
      }
    },
    [currentNetwork]
  );

  const handleOpenDashboard = useCallback(() => {
    setScreen('dashboard');
    void refreshProjects(true);
  }, [refreshProjects]);

  if (isHydrating) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-sm text-slate-600">
        Carregando sessao...
      </div>
    );
  }

  if (!isAuthenticated || !currentUser) {
    return (
      <>
        <LoginScreen />
        <Toaster />
      </>
    );
  }

  return (
    <>
      {screen === 'dashboard' ? (
        <ProjectDashboard
          currentProviderName={provider?.name || 'Provedor'}
          currentUserName={currentUser.displayName}
          currentUserRole={currentUser.role}
          canCreateProject={can('network.create')}
          canDeleteProject={can('network.delete')}
          canExportProject={can('network.export')}
          canReadUsers={can('users.read')}
          canManageUsers={can('users.create') || can('users.update') || can('users.delete')}
          canReadRoles={can('roles.read')}
          canManageRoles={can('roles.update')}
          canReadLicense={can('license.read')}
          canManageLicense={can('license.update')}
          canReadAudit={can('audit.read')}
          currentProjectId={currentNetwork?.id || null}
          projects={projects}
          onCreateProject={handleCreateProject}
          onOpenProject={handleOpenProject}
          onDeleteProject={handleDeleteProject}
          onExportProject={handleExportProject}
          onRefreshSession={refreshSession}
          onRefreshProjects={() => refreshProjects(false)}
          onLogout={handleLogout}
        />
      ) : (
        <NetworkWorkspace onOpenDashboard={handleOpenDashboard} onLogout={handleLogout} />
      )}
      <Toaster />
    </>
  );
}

export default App;
