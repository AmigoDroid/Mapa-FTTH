import { apiRequest } from '@/api/client';
import type {
  ApiAuditLog,
  ApiLicense,
  ApiProjectDetail,
  ApiProjectSummary,
  ApiRole,
  ApiSessionUser,
} from '@/api/types';
import type { AuthPermission, AuthRole } from '@/auth/permissions';
import type { Network } from '@/types/ftth';

interface CreateUserPayload {
  username: string;
  displayName: string;
  password: string;
  role: AuthRole;
  active?: boolean;
}

interface UpdateUserPayload {
  username?: string;
  displayName?: string;
  password?: string;
  role?: AuthRole;
  active?: boolean;
}

interface UpdateLicensePayload {
  key?: string;
  company?: string;
  plan?: string;
  status?: 'active' | 'suspended' | 'expired';
  maxUsers?: number;
  expiresAt?: string;
  features?: string[];
}

export const adminApi = {
  listUsers: async () => {
    const response = await apiRequest<{ users: ApiSessionUser[] }>('/users');
    return response.users;
  },
  createUser: async (payload: CreateUserPayload) => {
    const response = await apiRequest<{ user: ApiSessionUser }>('/users', {
      method: 'POST',
      body: payload,
    });
    return response.user;
  },
  updateUser: async (userId: string, payload: UpdateUserPayload) => {
    const response = await apiRequest<{ user: ApiSessionUser }>(`/users/${userId}`, {
      method: 'PATCH',
      body: payload,
    });
    return response.user;
  },
  deleteUser: async (userId: string) =>
    apiRequest<void>(`/users/${userId}`, {
      method: 'DELETE',
    }),
  listRoles: async () => {
    const response = await apiRequest<{ roles: ApiRole[] }>('/roles');
    return response.roles;
  },
  updateRole: async (roleId: AuthRole, directPermissions: AuthPermission[] | string[]) => {
    const response = await apiRequest<{ roles: ApiRole[] }>(`/roles/${roleId}`, {
      method: 'PATCH',
      body: { directPermissions },
    });
    return response.roles;
  },
  getLicense: async () => {
    const response = await apiRequest<{ license: ApiLicense }>('/license');
    return response.license;
  },
  updateLicense: async (payload: UpdateLicensePayload) => {
    const response = await apiRequest<{ license: ApiLicense }>('/license', {
      method: 'PATCH',
      body: payload,
    });
    return response.license;
  },
  listAuditLogs: async (limit = 100) => {
    const response = await apiRequest<{ logs: ApiAuditLog[] }>(`/audit-logs?limit=${limit}`);
    return response.logs;
  },
};

export const projectApi = {
  listProjects: async () => {
    const response = await apiRequest<{ projects: ApiProjectSummary[] }>('/projects');
    return response.projects;
  },
  createProject: async (name: string, description?: string) => {
    const response = await apiRequest<{ project: ApiProjectSummary }>('/projects', {
      method: 'POST',
      body: { name, description },
    });
    return response.project;
  },
  loadProject: async (projectId: string) => {
    const response = await apiRequest<{ project: ApiProjectDetail }>(`/projects/${projectId}`);
    return response.project;
  },
  saveProjectNetwork: async (projectId: string, network: Network, name?: string, description?: string) => {
    const response = await apiRequest<{ project: ApiProjectSummary }>(`/projects/${projectId}`, {
      method: 'PUT',
      body: { network, name, description },
    });
    return response.project;
  },
  deleteProject: async (projectId: string) =>
    apiRequest<void>(`/projects/${projectId}`, {
      method: 'DELETE',
    }),
};
