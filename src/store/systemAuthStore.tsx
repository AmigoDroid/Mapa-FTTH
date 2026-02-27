import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { setApiAccessToken } from '@/api/client';
import { systemApi } from '@/api/systemApi';
import type { SystemAdminIdentity } from '@/api/types';

interface PersistedSystemSession {
  token: string;
}

interface LoginResult {
  success: boolean;
  message?: string;
}

interface SystemAuthContextValue {
  token: string | null;
  admin: SystemAdminIdentity | null;
  isAuthenticated: boolean;
  isHydrating: boolean;
  isAuthenticating: boolean;
  login: (username: string, password: string) => Promise<LoginResult>;
  refreshSession: () => Promise<void>;
  logout: () => void;
}

const STORAGE_KEY = 'ftth:system:auth:session:v1';
const SystemAuthContext = createContext<SystemAuthContextValue | null>(null);

const readPersistedToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedSystemSession>;
    return typeof parsed.token === 'string' && parsed.token.trim() ? parsed.token : null;
  } catch {
    return null;
  }
};

const persistToken = (token: string | null) => {
  if (typeof window === 'undefined') return;
  if (!token) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ token }));
};

export function SystemAuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => readPersistedToken());
  const [admin, setAdmin] = useState<SystemAdminIdentity | null>(null);
  const [isHydrating, setIsHydrating] = useState(() => Boolean(readPersistedToken()));
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const clearSession = useCallback(() => {
    setToken(null);
    setAdmin(null);
    setApiAccessToken(null);
    persistToken(null);
  }, []);

  const applySession = useCallback((nextToken: string | null, nextAdmin: SystemAdminIdentity) => {
    if (nextToken) {
      setToken(nextToken);
      setApiAccessToken(nextToken);
      persistToken(nextToken);
    }
    setAdmin(nextAdmin);
  }, []);

  const refreshSession = useCallback(async () => {
    if (!token) {
      clearSession();
      setIsHydrating(false);
      return;
    }

    try {
      setApiAccessToken(token);
      const payload = await systemApi.me();
      applySession(token, payload.admin);
    } catch {
      clearSession();
    } finally {
      setIsHydrating(false);
    }
  }, [applySession, clearSession, token]);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const login = useCallback(
    async (username: string, password: string): Promise<LoginResult> => {
      const normalizedUsername = username.trim();
      if (!normalizedUsername || !password) {
        return { success: false, message: 'Informe usuario e senha.' };
      }

      setIsAuthenticating(true);
      try {
        const result = await systemApi.login(normalizedUsername, password);
        applySession(result.token, result.admin);
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

  const value = useMemo<SystemAuthContextValue>(
    () => ({
      token,
      admin,
      isAuthenticated: Boolean(admin && token),
      isHydrating,
      isAuthenticating,
      login,
      refreshSession,
      logout,
    }),
    [token, admin, isHydrating, isAuthenticating, login, refreshSession, logout]
  );

  return <SystemAuthContext.Provider value={value}>{children}</SystemAuthContext.Provider>;
}

export function useSystemAuth() {
  const context = useContext(SystemAuthContext);
  if (!context) {
    throw new Error('useSystemAuth must be used within a SystemAuthProvider');
  }
  return context;
}
