import type { AuthPermission, AuthRole } from '@/auth/permissions';
import type { Network } from '@/types/ftth';

export interface ApiProviderSessionInfo {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended';
  createdAt: string;
  updatedAt: string;
}

export interface ApiSessionUser {
  id: string;
  username: string;
  displayName: string;
  role: AuthRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ApiRole {
  id: AuthRole;
  label: string;
  parentRole: AuthRole | null;
  directPermissions: AuthPermission[];
  effectivePermissions: AuthPermission[];
  createdAt: string;
  updatedAt: string;
}

export interface ApiLicenseState {
  isActive: boolean;
  isSuspended: boolean;
  isExpired: boolean;
  expiresInMs: number | null;
  reason: string | null;
}

export interface ApiLicense {
  id: string;
  key: string;
  company: string;
  plan: string;
  status: 'active' | 'suspended' | 'expired';
  maxUsers: number;
  seatsUsed: number;
  seatsAvailable: number;
  expiresAt: string;
  features: string[];
  createdAt: string;
  updatedAt: string;
  state: ApiLicenseState;
}

export interface ApiAuditLog {
  id: string;
  createdAt: string;
  actorUserId?: string;
  actorUsername?: string;
  actorType?: string;
  actorId?: string;
  action: string;
  targetType: string;
  targetId: string;
  details: string;
}

export interface ApiProjectSummary {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  cityCount: number;
  popCount: number;
  boxCount: number;
  cableCount: number;
  reserveCount: number;
}

export interface ApiProjectDetail {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  network: Network;
}

export interface AuthSessionPayload {
  provider: ApiProviderSessionInfo;
  user: ApiSessionUser;
  permissions: AuthPermission[];
  license: ApiLicense;
}

export interface LoginResponse extends AuthSessionPayload {
  token: string;
}

export interface SystemAdminIdentity {
  id: string;
  username: string;
  displayName: string;
}

export interface SystemAuthSessionPayload {
  admin: SystemAdminIdentity;
}

export interface SystemLoginResponse extends SystemAuthSessionPayload {
  token: string;
}

export interface ApiProviderSummary {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended';
  createdAt: string;
  updatedAt: string;
  usersCount: number;
  activeUsersCount: number;
  projectsCount: number;
  license: ApiLicense;
}
