import { apiRequest } from '@/api/client';
import type { AuthSessionPayload, LoginResponse } from '@/api/types';

export const authApi = {
  login: (providerSlug: string, username: string, password: string) =>
    apiRequest<LoginResponse>('/auth/login', {
      method: 'POST',
      auth: false,
      body: { providerSlug, username, password },
    }),
  me: () => apiRequest<AuthSessionPayload>('/auth/me'),
};
