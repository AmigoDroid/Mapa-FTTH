import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { authApi } from '@/api/authApi';
import { ApiError, setApiAccessToken } from '@/api/client';
import type { ApiLicense, ApiProviderSessionInfo } from '@/api/types';
import type { AuthPermission, AuthRole } from '@/auth/permissions';

interface PersistedAuthSession {
  token: string;
}

export interface AuthSessionUser {
  id: string;
  username: string;
  displayName: string;
  role: AuthRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

interface LoginResult {
  success: boolean;
  message?: string;
}

interface AuthContextValue {
  token: string | null;
  provider: ApiProviderSessionInfo | null;
  currentUser: AuthSessionUser | null;
  isAuthenticated: boolean;
  isHydrating: boolean;
  isAuthenticating: boolean;
  permissions: AuthPermission[];
  license: ApiLicense | null;
  can: (permission: AuthPermission) => boolean;
  hasAnyPermission: (permissions: AuthPermission[]) => boolean;
  login: (providerSlug: string, username: string, password: string) => Promise<LoginResult>;
  refreshSession: () => Promise<void>;
  logout: () => void;
}

const AUTH_STORAGE_KEY = 'ftth:auth:session:v2';
const AuthContext = createContext<AuthContextValue | null>(null);

const readPersistedToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedAuthSession>;
    return typeof parsed.token === 'string' && parsed.token.trim() ? parsed.token : null;
  } catch {
    return null;
  }
};

const persistToken = (token: string | null) => {
  if (typeof window === 'undefined') return;
  if (!token) {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return;
  }
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token }));
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => readPersistedToken());
  const [provider, setProvider] = useState<ApiProviderSessionInfo | null>(null);
  const [currentUser, setCurrentUser] = useState<AuthSessionUser | null>(null);
  const [permissions, setPermissions] = useState<AuthPermission[]>([]);
  const [license, setLicense] = useState<ApiLicense | null>(null);
  const [isHydrating, setIsHydrating] = useState(() => Boolean(readPersistedToken()));
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const clearSession = useCallback(() => {
    setToken(null);
    setProvider(null);
    setCurrentUser(null);
    setPermissions([]);
    setLicense(null);
    setApiAccessToken(null);
    persistToken(null);
  }, []);

  const applySession = useCallback(
    (
      nextToken: string | null,
      nextProvider: ApiProviderSessionInfo,
      nextUser: AuthSessionUser,
      nextPermissions: AuthPermission[],
      nextLicense: ApiLicense
    ) => {
      if (nextToken) {
        setToken(nextToken);
        setApiAccessToken(nextToken);
        persistToken(nextToken);
      }
      setProvider(nextProvider);
      setCurrentUser(nextUser);
      setPermissions(nextPermissions);
      setLicense(nextLicense);
    },
    []
  );

  const refreshSession = useCallback(async () => {
    if (!token) {
      clearSession();
      setIsHydrating(false);
      return;
    }

    try {
      setApiAccessToken(token);
      const payload = await authApi.me();
      applySession(token, payload.provider, payload.user, payload.permissions, payload.license);
    } catch (error) {
      // Keep persisted token on transient errors (network/5xx). Clear only invalid/forbidden sessions.
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        clearSession();
      }
    } finally {
      setIsHydrating(false);
    }
  }, [applySession, clearSession, token]);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const login = useCallback(
    async (providerSlug: string, username: string, password: string): Promise<LoginResult> => {
      const normalizedProviderSlug = providerSlug.trim().toLowerCase();
      const normalizedUsername = username.trim();
      if (!normalizedProviderSlug || !normalizedUsername || !password) {
        return { success: false, message: 'Informe provedor, usuario e senha.' };
      }

      setIsAuthenticating(true);
      try {
        const result = await authApi.login(normalizedProviderSlug, normalizedUsername, password);
        applySession(result.token, result.provider, result.user, result.permissions, result.license);
        return { success: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Falha ao autenticar.';
        return { success: false, message };
      } finally {
        setIsAuthenticating(false);
      }
    },
    [applySession]
  );

  const logout = useCallback(() => {
    clearSession();
  }, [clearSession]);

  const permissionSet = useMemo(() => new Set<AuthPermission>(permissions), [permissions]);

  const can = useCallback(
    (permission: AuthPermission) => permissionSet.has(permission),
    [permissionSet]
  );

  const hasAnyPermission = useCallback(
    (requiredPermissions: AuthPermission[]) =>
      requiredPermissions.some((permission) => permissionSet.has(permission)),
    [permissionSet]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      provider,
      currentUser,
      isAuthenticated: Boolean(currentUser && token),
      isHydrating,
      isAuthenticating,
      permissions,
      license,
      can,
      hasAnyPermission,
      login,
      refreshSession,
      logout,
    }),
    [
      token,
      provider,
      currentUser,
      isHydrating,
      isAuthenticating,
      permissions,
      license,
      can,
      hasAnyPermission,
      login,
      refreshSession,
      logout,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
