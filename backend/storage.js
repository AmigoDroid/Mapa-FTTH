import path from 'node:path';
import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { LICENSE_FEATURES } from './constants.js';
import { createDefaultRoles } from './rbac.js';
import { hashPassword } from './security.js';

const DATA_DIRECTORY = path.resolve(process.cwd(), 'backend', 'data');
const DATA_FILE = path.join(DATA_DIRECTORY, 'db.json');
let writeQueue = Promise.resolve();

const nowIso = () => new Date().toISOString();

const normalizeSlug = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const createSeedUser = (user, createdAt) => ({
  id: user.id || randomUUID(),
  username: user.username,
  displayName: user.displayName,
  passwordHash: hashPassword(user.password),
  role: user.role,
  active: user.active ?? true,
  createdAt,
  updatedAt: createdAt,
});

const createProviderLicense = (createdAt, overrides = {}) => ({
  id: overrides.id || `lic-${randomUUID().slice(0, 8)}`,
  key: overrides.key || `FTTH-${randomUUID().slice(0, 8).toUpperCase()}`,
  company: overrides.company || 'PROVEDOR DEMO',
  plan: overrides.plan || 'enterprise',
  status: overrides.status || 'active',
  maxUsers: Number.isFinite(overrides.maxUsers) ? Number(overrides.maxUsers) : 25,
  expiresAt:
    overrides.expiresAt ||
    new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
  features: Array.isArray(overrides.features) && overrides.features.length > 0
    ? Array.from(new Set(overrides.features))
    : [...LICENSE_FEATURES],
  createdAt: overrides.createdAt || createdAt,
  updatedAt: overrides.updatedAt || createdAt,
});

const createProvider = ({
  id,
  name,
  slug,
  createdAt,
  status = 'active',
  license,
  roles,
  users,
  projects,
  auditLogs,
}) => ({
  id: id || randomUUID(),
  name: name || 'Provedor Demo',
  slug: normalizeSlug(slug || name || 'provedor-demo') || 'provedor-demo',
  status,
  createdAt,
  updatedAt: createdAt,
  license: createProviderLicense(createdAt, license),
  roles: Array.isArray(roles) && roles.length > 0 ? roles : createDefaultRoles(createdAt),
  users:
    Array.isArray(users) && users.length > 0
      ? users
      : [
          createSeedUser(
            {
              id: 'usr-manager',
              username: 'manager',
              displayName: 'Gestor do Provedor',
              password: 'manager123',
              role: 'manager',
            },
            createdAt
          ),
          createSeedUser(
            {
              id: 'usr-admin',
              username: 'admin',
              displayName: 'Administrador do Provedor',
              password: 'admin123',
              role: 'admin',
            },
            createdAt
          ),
          createSeedUser(
            {
              id: 'usr-editor',
              username: 'editor',
              displayName: 'Editor de Rede',
              password: 'editor123',
              role: 'editor',
            },
            createdAt
          ),
          createSeedUser(
            {
              id: 'usr-viewer',
              username: 'viewer',
              displayName: 'Visualizador',
              password: 'viewer123',
              role: 'viewer',
            },
            createdAt
          ),
        ],
  projects: Array.isArray(projects) ? projects : [],
  auditLogs: Array.isArray(auditLogs) ? auditLogs : [],
});

const createInitialDbV2 = () => {
  const createdAt = nowIso();
  return {
    version: 2,
    createdAt,
    providers: [],
    systemAuditLogs: [],
  };
};

const migrateV1ToV2 = (legacy) => {
  const createdAt = legacy?.createdAt || nowIso();
  const companyName = legacy?.license?.company || 'Provedor Migrado';
  const provider = createProvider({
    id: legacy?.license?.id ? `prov-${legacy.license.id}` : randomUUID(),
    name: companyName,
    slug: normalizeSlug(companyName) || 'provedor-migrado',
    createdAt,
    status: 'active',
    license: legacy?.license || {},
    roles: Array.isArray(legacy?.roles) ? legacy.roles : createDefaultRoles(createdAt),
    users: Array.isArray(legacy?.users) ? legacy.users : [],
    projects: Array.isArray(legacy?.projects) ? legacy.projects : [],
    auditLogs: Array.isArray(legacy?.auditLogs) ? legacy.auditLogs : [],
  });

  return {
    version: 2,
    createdAt,
    providers: [provider],
    systemAuditLogs: [
      {
        id: randomUUID(),
        createdAt: nowIso(),
        actorType: 'system',
        actorId: 'migration',
        action: 'db.migrate.v1_to_v2',
        targetType: 'provider',
        targetId: provider.id,
        details: `Migracao concluida para o provedor ${provider.name}.`,
      },
    ],
  };
};

const ensureProviderShape = (provider, index) => {
  const createdAt = provider.createdAt || nowIso();
  const normalized = createProvider({
    ...provider,
    id: provider.id || `prov-${index + 1}`,
    name: provider.name || `Provedor ${index + 1}`,
    slug: provider.slug || provider.name || `provedor-${index + 1}`,
    createdAt,
    status: provider.status || 'active',
    license: provider.license || {},
    roles: Array.isArray(provider.roles) ? provider.roles : createDefaultRoles(createdAt),
    users: Array.isArray(provider.users) ? provider.users : [],
    projects: Array.isArray(provider.projects) ? provider.projects : [],
    auditLogs: Array.isArray(provider.auditLogs) ? provider.auditLogs : [],
  });

  normalized.updatedAt = provider.updatedAt || createdAt;
  normalized.license = {
    ...normalized.license,
    company: normalized.license.company || normalized.name,
  };
  return normalized;
};

const migrateDb = (raw) => {
  if (!raw || typeof raw !== 'object') {
    return { changed: true, db: createInitialDbV2() };
  }

  if (raw.version === 2) {
    const providers = Array.isArray(raw.providers) ? raw.providers : [];
    const normalizedProviders = providers.map((provider, index) =>
      ensureProviderShape(provider, index)
    );
    const deduplicatedProviders = [];
    const slugSet = new Set();
    normalizedProviders.forEach((provider) => {
      let nextProvider = provider;
      if (slugSet.has(nextProvider.slug)) {
        nextProvider = {
          ...nextProvider,
          slug: `${nextProvider.slug}-${nextProvider.id.slice(0, 6)}`,
        };
      }
      slugSet.add(nextProvider.slug);
      deduplicatedProviders.push(nextProvider);
    });

    const nextDb = {
      version: 2,
      createdAt: raw.createdAt || nowIso(),
      providers: deduplicatedProviders,
      systemAuditLogs: Array.isArray(raw.systemAuditLogs) ? raw.systemAuditLogs : [],
    };

    const changed = JSON.stringify(raw) !== JSON.stringify(nextDb);
    return { changed, db: nextDb };
  }

  if (raw.version === 1 || raw.license || raw.users || raw.roles || raw.projects) {
    return { changed: true, db: migrateV1ToV2(raw) };
  }

  return { changed: true, db: createInitialDbV2() };
};

const writeDbFile = async (db) => {
  await fs.writeFile(DATA_FILE, JSON.stringify(db, null, 2), 'utf8');
};

export const ensureDb = async () => {
  await fs.mkdir(DATA_DIRECTORY, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    const seed = createInitialDbV2();
    await writeDbFile(seed);
    return;
  }

  const raw = await fs.readFile(DATA_FILE, 'utf8');
  const parsed = JSON.parse(raw);
  const migration = migrateDb(parsed);
  if (migration.changed) {
    await writeDbFile(migration.db);
  }
};

export const readDb = async () => {
  await ensureDb();
  const raw = await fs.readFile(DATA_FILE, 'utf8');
  const parsed = JSON.parse(raw);
  return migrateDb(parsed).db;
};

export const mutateDb = async (mutator) => {
  writeQueue = writeQueue.then(async () => {
    const current = await readDb();
    const draft = JSON.parse(JSON.stringify(current));
    const maybeNext = await mutator(draft);
    const next = maybeNext ?? draft;
    await writeDbFile(next);
    return next;
  });
  return writeQueue;
};

export const appendProviderAuditLog = (provider, entry) => {
  const createdAt = nowIso();
  const log = {
    id: randomUUID(),
    createdAt,
    ...entry,
  };
  provider.auditLogs = [log, ...(provider.auditLogs || [])].slice(0, 2000);
  return log;
};

export const appendSystemAuditLog = (db, entry) => {
  const createdAt = nowIso();
  const log = {
    id: randomUUID(),
    createdAt,
    ...entry,
  };
  db.systemAuditLogs = [log, ...(db.systemAuditLogs || [])].slice(0, 4000);
  return log;
};

export const getDataFilePath = () => DATA_FILE;
export const createProviderSlug = normalizeSlug;
