import type { Network } from '@/types/ftth';

export interface ProjectSummary {
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

const PROJECT_INDEX_KEY = 'ftth:projects:index:v1';
const PROJECT_DATA_PREFIX = 'ftth:projects:data:v1:';
const LAST_OPENED_PROJECT_KEY_PREFIX = 'ftth:projects:last-opened:v2:';

const parseDateValue = (value: string): number => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const buildProjectSummary = (network: Network): ProjectSummary => ({
  id: network.id,
  name: network.name,
  description: network.description,
  createdAt: network.createdAt,
  updatedAt: network.updatedAt,
  cityCount: network.cities.length,
  popCount: (network.pops || []).length,
  boxCount: network.boxes.length,
  cableCount: network.cables.length,
  reserveCount: (network.reserves || []).length,
});

const sortByLastUpdate = (projects: ProjectSummary[]): ProjectSummary[] =>
  [...projects].sort((a, b) => parseDateValue(b.updatedAt) - parseDateValue(a.updatedAt));

const sanitizeProjectSummary = (raw: unknown): ProjectSummary | null => {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<ProjectSummary>;
  if (!candidate.id || !candidate.name || !candidate.createdAt || !candidate.updatedAt) return null;
  return {
    id: candidate.id,
    name: candidate.name,
    description: candidate.description,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
    cityCount: Math.max(0, candidate.cityCount || 0),
    popCount: Math.max(0, candidate.popCount || 0),
    boxCount: Math.max(0, candidate.boxCount || 0),
    cableCount: Math.max(0, candidate.cableCount || 0),
    reserveCount: Math.max(0, candidate.reserveCount || 0),
  };
};

const readProjectIndex = (): ProjectSummary[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(PROJECT_INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const sanitized = parsed
      .map((entry) => sanitizeProjectSummary(entry))
      .filter((entry): entry is ProjectSummary => Boolean(entry));
    return sortByLastUpdate(sanitized);
  } catch {
    return [];
  }
};

const writeProjectIndex = (projects: ProjectSummary[]) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PROJECT_INDEX_KEY, JSON.stringify(sortByLastUpdate(projects)));
};

const getProjectDataKey = (projectId: string) => `${PROJECT_DATA_PREFIX}${projectId}`;

export const listProjects = (): ProjectSummary[] => readProjectIndex();

export const saveProjectNetwork = (network: Network): ProjectSummary | null => {
  if (typeof window === 'undefined') return null;

  const summary = buildProjectSummary(network);
  const projectIndex = readProjectIndex().filter((project) => project.id !== summary.id);

  writeProjectIndex([summary, ...projectIndex]);
  localStorage.setItem(getProjectDataKey(summary.id), JSON.stringify(network));
  return summary;
};

export const loadProjectNetwork = (projectId: string): Network | null => {
  if (!projectId || typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(getProjectDataKey(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Network;
    if (!parsed?.id || !parsed?.name) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const deleteProject = (projectId: string): void => {
  if (!projectId || typeof window === 'undefined') return;
  const nextIndex = readProjectIndex().filter((project) => project.id !== projectId);
  writeProjectIndex(nextIndex);
  localStorage.removeItem(getProjectDataKey(projectId));
  if (getLastOpenedProjectId() === projectId) {
    setLastOpenedProjectId(null);
  }
};

const getLastOpenedProjectKey = (scope: string = 'default') =>
  `${LAST_OPENED_PROJECT_KEY_PREFIX}${scope}`;

export const getLastOpenedProjectId = (scope?: string): string | null => {
  if (typeof window === 'undefined') return null;
  const value = localStorage.getItem(getLastOpenedProjectKey(scope));
  return value && value.trim().length > 0 ? value : null;
};

export const setLastOpenedProjectId = (projectId: string | null, scope?: string): void => {
  if (typeof window === 'undefined') return;
  if (!projectId) {
    localStorage.removeItem(getLastOpenedProjectKey(scope));
    return;
  }
  localStorage.setItem(getLastOpenedProjectKey(scope), projectId);
};
