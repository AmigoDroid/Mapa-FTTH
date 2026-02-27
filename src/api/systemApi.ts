import { apiRequest } from '@/api/client';
import type {
  ApiAuditLog,
  ApiLicense,
  ApiProjectSummary,
  ApiProviderSummary,
  ApiSessionUser,
  SystemAuthSessionPayload,
  SystemLoginResponse,
} from '@/api/types';
import type { AuthRole } from '@/auth/permissions';
import type { Network } from '@/types/ftth';

interface CreateProviderPayload {
  name: string;
  slug?: string;
  managerUsername: string;
  managerDisplayName: string;
  managerPassword: string;
  managerRole?: 'viewer' | 'editor' | 'manager' | 'admin';
  plan?: string;
  maxUsers?: number;
  expiresAt?: string;
  features?: string[];
}

interface UpdateProviderPayload {
  name?: string;
  slug?: string;
  status?: 'active' | 'suspended';
}

interface UpdateProviderLicensePayload {
  key?: string;
  company?: string;
  plan?: string;
  status?: 'active' | 'suspended' | 'expired';
  maxUsers?: number;
  expiresAt?: string;
  features?: string[];
}

interface CreateProviderUserPayload {
  username: string;
  displayName: string;
  password: string;
  role: AuthRole;
  active?: boolean;
}

interface UpdateProviderUserPayload {
  username?: string;
  displayName?: string;
  password?: string;
  role?: AuthRole;
  active?: boolean;
}

interface CreateProviderProjectPayload {
  name: string;
  description?: string;
}

interface UpdateProviderProjectPayload {
  name?: string;
  description?: string;
  network?: Network;
}

export const systemApi = {
  login: (username: string, password: string) =>
    apiRequest<SystemLoginResponse>('/system/auth/login', {
      method: 'POST',
      auth: false,
      body: { username, password },
    }),
  me: () => apiRequest<SystemAuthSessionPayload>('/system/auth/me'),
  listProviders: async () => {
    const response = await apiRequest<{ providers: ApiProviderSummary[] }>('/system/providers');
    return response.providers;
  },
  createProvider: async (payload: CreateProviderPayload) => {
    const response = await apiRequest<{ provider: ApiProviderSummary }>('/system/providers', {
      method: 'POST',
      body: payload,
    });
    return response.provider;
  },
  updateProvider: async (providerId: string, payload: UpdateProviderPayload) => {
    const response = await apiRequest<{ provider: ApiProviderSummary }>(`/system/providers/${providerId}`, {
      method: 'PATCH',
      body: payload,
    });
    return response.provider;
  },
  updateProviderLicense: async (providerId: string, payload: UpdateProviderLicensePayload) => {
    const response = await apiRequest<{ license: ApiLicense }>(`/system/providers/${providerId}/license`, {
      method: 'PATCH',
      body: payload,
    });
    return response.license;
  },
  authorizeProvider: async (providerId: string) => {
    const response = await apiRequest<{ provider: ApiProviderSummary }>(`/system/providers/${providerId}/authorize`, {
      method: 'POST',
    });
    return response.provider;
  },
  revokeProvider: async (providerId: string) => {
    const response = await apiRequest<{ provider: ApiProviderSummary }>(`/system/providers/${providerId}/revoke`, {
      method: 'POST',
    });
    return response.provider;
  },
  deleteProvider: async (providerId: string) =>
    apiRequest<void>(`/system/providers/${providerId}`, {
      method: 'DELETE',
    }),
  listProviderUsers: async (providerId: string) => {
    const response = await apiRequest<{ users: ApiSessionUser[] }>(`/system/providers/${providerId}/users`);
    return response.users;
  },
  createProviderUser: async (providerId: string, payload: CreateProviderUserPayload) => {
    const response = await apiRequest<{ user: ApiSessionUser }>(`/system/providers/${providerId}/users`, {
      method: 'POST',
      body: payload,
    });
    return response.user;
  },
  updateProviderUser: async (providerId: string, userId: string, payload: UpdateProviderUserPayload) => {
    const response = await apiRequest<{ user: ApiSessionUser }>(`/system/providers/${providerId}/users/${userId}`, {
      method: 'PATCH',
      body: payload,
    });
    return response.user;
  },
  deleteProviderUser: async (providerId: string, userId: string) =>
    apiRequest<void>(`/system/providers/${providerId}/users/${userId}`, {
      method: 'DELETE',
    }),
  listProviderProjects: async (providerId: string) => {
    const response = await apiRequest<{ projects: ApiProjectSummary[] }>(`/system/providers/${providerId}/projects`);
    return response.projects;
  },
  createProviderProject: async (providerId: string, payload: CreateProviderProjectPayload) => {
    const response = await apiRequest<{ project: ApiProjectSummary }>(`/system/providers/${providerId}/projects`, {
      method: 'POST',
      body: payload,
    });
    return response.project;
  },
  updateProviderProject: async (providerId: string, projectId: string, payload: UpdateProviderProjectPayload) => {
    const response = await apiRequest<{ project: ApiProjectSummary }>(`/system/providers/${providerId}/projects/${projectId}`, {
      method: 'PUT',
      body: payload,
    });
    return response.project;
  },
  deleteProviderProject: async (providerId: string, projectId: string) =>
    apiRequest<void>(`/system/providers/${providerId}/projects/${projectId}`, {
      method: 'DELETE',
    }),
  listAuditLogs: async (limit = 200) => {
    const response = await apiRequest<{ logs: ApiAuditLog[] }>(`/system/audit-logs?limit=${limit}`);
    return response.logs;
  },
};
