import { countActiveUsers, serializeLicense } from '../license.js';

export const nowIso = () => new Date().toISOString();

export const getBearerToken = (authorizationHeader) => {
  if (!authorizationHeader) return null;
  const [prefix, token] = authorizationHeader.split(' ');
  if (prefix?.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim();
};

export const toPublicUser = (user) => ({
  id: user.id,
  username: user.username,
  displayName: user.displayName,
  role: user.role,
  active: user.active,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

export const findProviderById = (db, providerId) =>
  (db.providers || []).find((provider) => provider.id === providerId);

export const findProviderBySlug = (db, slug) =>
  (db.providers || []).find(
    (provider) => provider.slug.toLowerCase() === String(slug || '').trim().toLowerCase()
  );

export const ensureAtLeastOnePrivilegedUser = (users) =>
  users.some((user) => user.active && (user.role === 'manager' || user.role === 'admin'));

const countPrivilegedUsers = (users) =>
  users.filter((user) => user.role === 'manager' || user.role === 'admin').length;

const countActivePrivilegedUsers = (users) =>
  users.filter(
    (user) => user.active && (user.role === 'manager' || user.role === 'admin')
  ).length;

const countInactiveUsers = (users) => users.filter((user) => !user.active).length;

export const createEmptyNetwork = (projectId, name, description) => {
  const timestamp = nowIso();
  return {
    id: projectId,
    name,
    description: description || undefined,
    cities: [],
    pops: [],
    boxes: [],
    reserves: [],
    cables: [],
    fusions: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};

export const buildProjectSummary = (project) => {
  const network = project.network || {};
  return {
    id: project.id,
    name: network.name || project.name || 'Projeto sem nome',
    description: network.description || project.description,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    cityCount: Array.isArray(network.cities) ? network.cities.length : 0,
    popCount: Array.isArray(network.pops) ? network.pops.length : 0,
    boxCount: Array.isArray(network.boxes) ? network.boxes.length : 0,
    cableCount: Array.isArray(network.cables) ? network.cables.length : 0,
    reserveCount: Array.isArray(network.reserves) ? network.reserves.length : 0,
  };
};

export const buildProviderSummary = (provider) => ({
  id: provider.id,
  name: provider.name,
  slug: provider.slug,
  status: provider.status,
  createdAt: provider.createdAt,
  updatedAt: provider.updatedAt,
  usersCount: (provider.users || []).length,
  activeUsersCount: countActiveUsers(provider.users || []),
  inactiveUsersCount: countInactiveUsers(provider.users || []),
  privilegedUsersCount: countPrivilegedUsers(provider.users || []),
  activePrivilegedUsersCount: countActivePrivilegedUsers(provider.users || []),
  projectsCount: (provider.projects || []).length,
  license: serializeLicense(provider.license, provider.users || []),
});
