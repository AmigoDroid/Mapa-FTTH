import express from 'express';
import { randomUUID } from 'node:crypto';
import { SYSTEM_ADMIN_ACCOUNT } from '../config/system-admin.js';
import {
  ALL_PERMISSIONS,
  AUTH_ROLES,
  LICENSE_FEATURES,
  PERMISSIONS,
} from '../constants.js';
import { LICENSE_STATUS, countActiveUsers, serializeLicense } from '../license.js';
import { listPermissionsForRole, roleExists } from '../rbac.js';
import { hashPassword, signAccessToken, verifyAccessToken, verifyPassword } from '../security.js';
import {
  appendProviderAuditLog,
  appendSystemAuditLog,
  createProviderSlug,
  mutateDb,
  readDb,
} from '../storage.js';
import {
  buildProjectSummary,
  buildProviderSummary,
  createEmptyNetwork,
  ensureAtLeastOnePrivilegedUser,
  findProviderById,
  getBearerToken,
  nowIso,
  toPublicUser,
} from './shared.js';

const DEFAULT_ROLE_PERMISSIONS = {
  viewer: [PERMISSIONS.DASHBOARD_READ, PERMISSIONS.NETWORK_READ, PERMISSIONS.ANALYSIS_RUN],
  editor: [PERMISSIONS.NETWORK_CREATE, PERMISSIONS.NETWORK_UPDATE, PERMISSIONS.NETWORK_EDIT_MODE],
  manager: [
    PERMISSIONS.NETWORK_IMPORT,
    PERMISSIONS.NETWORK_EXPORT,
    PERMISSIONS.USERS_READ,
    PERMISSIONS.USERS_CREATE,
    PERMISSIONS.USERS_UPDATE,
    PERMISSIONS.USERS_DELETE,
    PERMISSIONS.ROLES_READ,
    PERMISSIONS.ROLES_UPDATE,
    PERMISSIONS.LICENSE_READ,
    PERMISSIONS.AUDIT_READ,
  ],
  admin: [PERMISSIONS.NETWORK_DELETE, PERMISSIONS.NETWORK_RESET],
};

const ROLE_PARENT = {
  viewer: null,
  editor: 'viewer',
  manager: 'editor',
  admin: 'manager',
};

const ROLE_LABEL = {
  viewer: 'Leitura',
  editor: 'Editor',
  manager: 'Gestor',
  admin: 'Administrador',
};

const PASSWORD_MIN_LENGTH = 8;
const USERNAME_REGEX = /^[a-z0-9._-]{3,40}$/;
const SLUG_REGEX = /^[a-z0-9-]{3,80}$/;
const PLAN_REGEX = /^[a-z0-9._/-]{2,60}$/i;
const KEY_REGEX = /^[a-zA-Z0-9._/-]{4,80}$/;
const SYSTEM_LOGIN_WINDOW_MS = 15 * 60 * 1000;
const SYSTEM_LOGIN_BLOCK_MS = 15 * 60 * 1000;
const SYSTEM_LOGIN_MAX_ATTEMPTS = 5;
const systemLoginAttempts = new Map();

const isPrivilegedRole = (roleId) => roleId === 'manager' || roleId === 'admin';

const isValidDisplayName = (value) => value.length >= 3 && value.length <= 80;
const isValidProviderName = (value) => value.length >= 3 && value.length <= 120;
const isValidPlan = (value) => PLAN_REGEX.test(value);
const isValidLicenseKey = (value) => KEY_REGEX.test(value);
const parsePermissionsInput = (raw) => {
  if (raw === undefined) return { provided: false };
  if (raw === null) return { provided: true, permissions: null };
  if (!Array.isArray(raw)) {
    return {
      error: 'Envie permissoes como array ou null para usar o perfil.',
    };
  }
  const normalized = raw.map((item) => String(item).trim());
  const invalidPermissions = normalized.filter(
    (permission) => !ALL_PERMISSIONS.includes(permission)
  );
  if (invalidPermissions.length > 0) {
    return {
      error: `Permissoes invalidas: ${invalidPermissions.join(', ')}`,
    };
  }
  if (normalized.includes(PERMISSIONS.LICENSE_UPDATE)) {
    return {
      error: 'Permissao license.update e exclusiva do administrador global.',
    };
  }
  return { provided: true, permissions: Array.from(new Set(normalized)) };
};

const parsePositiveInteger = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
};

const parseIsoDate = (value) => {
  const parsed = Date.parse(String(value || ''));
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
};

const getRequestIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || 'desconhecido';
};

const getSystemLoginRateLimitState = (ip) => {
  const now = Date.now();
  const state = systemLoginAttempts.get(ip);
  if (!state) {
    return {
      blocked: false,
      attemptsRemaining: SYSTEM_LOGIN_MAX_ATTEMPTS,
    };
  }

  if (state.blockedUntil && state.blockedUntil > now) {
    return {
      blocked: true,
      retryAfterMs: state.blockedUntil - now,
      attemptsRemaining: 0,
    };
  }

  if (state.windowStart + SYSTEM_LOGIN_WINDOW_MS <= now) {
    systemLoginAttempts.delete(ip);
    return {
      blocked: false,
      attemptsRemaining: SYSTEM_LOGIN_MAX_ATTEMPTS,
    };
  }

  return {
    blocked: false,
    attemptsRemaining: Math.max(0, SYSTEM_LOGIN_MAX_ATTEMPTS - state.failures),
  };
};

const registerFailedSystemLoginAttempt = (ip) => {
  const now = Date.now();
  const current = systemLoginAttempts.get(ip);
  if (!current || current.windowStart + SYSTEM_LOGIN_WINDOW_MS <= now) {
    systemLoginAttempts.set(ip, {
      failures: 1,
      windowStart: now,
      blockedUntil: null,
    });
    return false;
  }

  const nextFailures = current.failures + 1;
  const reachedLimit = nextFailures >= SYSTEM_LOGIN_MAX_ATTEMPTS;
  systemLoginAttempts.set(ip, {
    failures: nextFailures,
    windowStart: current.windowStart,
    blockedUntil: reachedLimit ? now + SYSTEM_LOGIN_BLOCK_MS : null,
  });
  return reachedLimit;
};

const clearSystemLoginAttempts = (ip) => {
  systemLoginAttempts.delete(ip);
};

const systemSessionPayload = () => ({
  admin: {
    id: SYSTEM_ADMIN_ACCOUNT.id,
    username: SYSTEM_ADMIN_ACCOUNT.username,
    displayName: SYSTEM_ADMIN_ACCOUNT.displayName,
  },
});

const toRolePayload = (provider, role) => ({
  id: role.id,
  label: role.label,
  parentRole: role.parentRole,
  directPermissions: role.directPermissions,
  effectivePermissions: listPermissionsForRole(provider.roles || [], role.id),
  createdAt: role.createdAt,
  updatedAt: role.updatedAt,
});

const findProviderOrRespond = (db, providerId, res) => {
  const provider = findProviderById(db, providerId);
  if (!provider) {
    res.status(404).json({ message: 'Provedor nao encontrado.' });
    return null;
  }
  return provider;
};

export const createSystemRouter = ({ jwtSecret, accessTokenTtl }) => {
  const router = express.Router();

  const requireSystemAuth = async (req, res, next) => {
    try {
      const token = getBearerToken(req.headers.authorization);
      if (!token) {
        res.status(401).json({ message: 'Token ausente.' });
        return;
      }

      const decoded = verifyAccessToken(token, jwtSecret);
      if (decoded.kind !== 'system' || decoded.sub !== SYSTEM_ADMIN_ACCOUNT.id) {
        res.status(401).json({ message: 'Sessao invalida para administrador global.' });
        return;
      }

      const db = await readDb();
      req.systemAuth = {
        db,
        admin: {
          id: SYSTEM_ADMIN_ACCOUNT.id,
          username: SYSTEM_ADMIN_ACCOUNT.username,
          displayName: SYSTEM_ADMIN_ACCOUNT.displayName,
        },
      };
      next();
    } catch {
      res.status(401).json({ message: 'Token invalido ou expirado.' });
    }
  };

  router.post('/auth/login', async (req, res) => {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    const requestIp = getRequestIp(req);
    const rateLimit = getSystemLoginRateLimitState(requestIp);
    if (rateLimit.blocked) {
      res.setHeader(
        'Retry-After',
        String(Math.max(1, Math.ceil((rateLimit.retryAfterMs || 0) / 1000)))
      );
      res.status(429).json({
        message: 'Muitas tentativas de login. Tente novamente em alguns minutos.',
      });
      return;
    }

    if (!username || !password) {
      res.status(400).json({ message: 'Informe usuario e senha.' });
      return;
    }

    if (username.toLowerCase() !== SYSTEM_ADMIN_ACCOUNT.username.toLowerCase()) {
      registerFailedSystemLoginAttempt(requestIp);
      res.status(401).json({ message: 'Credenciais invalidas para administrador global.' });
      return;
    }

    const passwordMatches = SYSTEM_ADMIN_ACCOUNT.passwordPlain
      ? password === SYSTEM_ADMIN_ACCOUNT.passwordPlain
      : verifyPassword(password, SYSTEM_ADMIN_ACCOUNT.passwordHash);
    if (!passwordMatches) {
      const blocked = registerFailedSystemLoginAttempt(requestIp);
      if (blocked) {
        await mutateDb((current) => {
          appendSystemAuditLog(current, {
            actorType: 'system',
            actorId: `ip:${requestIp}`,
            action: 'system.auth.login.blocked',
            targetType: 'session',
            targetId: SYSTEM_ADMIN_ACCOUNT.id,
            details:
              'Tentativas excessivas de login global. Bloqueio temporario aplicado.',
          });
          return current;
        });
      }
      res.status(401).json({ message: 'Credenciais invalidas para administrador global.' });
      return;
    }

    clearSystemLoginAttempts(requestIp);

    const token = signAccessToken(
      {
        sub: SYSTEM_ADMIN_ACCOUNT.id,
        kind: 'system',
      },
      jwtSecret,
      accessTokenTtl
    );

    await mutateDb((current) => {
      appendSystemAuditLog(current, {
        actorType: 'system',
        actorId: SYSTEM_ADMIN_ACCOUNT.id,
        action: 'system.auth.login',
        targetType: 'session',
        targetId: SYSTEM_ADMIN_ACCOUNT.id,
        details: 'Login global realizado.',
      });
      return current;
    });

    res.json({
      token,
      ...systemSessionPayload(),
    });
  });

  router.get('/auth/me', requireSystemAuth, (_req, res) => {
    res.json(systemSessionPayload());
  });

  router.get('/providers', requireSystemAuth, (req, res) => {
    const providers = (req.systemAuth.db.providers || []).map(buildProviderSummary);
    res.json({ providers });
  });

  router.post('/providers', requireSystemAuth, async (req, res) => {
    const name = String(req.body?.name || '').trim();
    const requestedSlug = String(req.body?.slug || '').trim();
    const slug = createProviderSlug(requestedSlug || name);
    const managerUsername = String(req.body?.managerUsername || 'manager')
      .trim()
      .toLowerCase();
    const managerDisplayName = String(req.body?.managerDisplayName || 'Gestor do Provedor').trim();
    const managerPassword = String(req.body?.managerPassword || '').trim();
    const managerRole = roleExists(req.body?.managerRole) ? req.body.managerRole : 'manager';
    const nextMaxUsers = parsePositiveInteger(req.body?.maxUsers, 20);
    const plan = String(req.body?.plan || 'enterprise').trim();
    const parsedExpiresAt = req.body?.expiresAt
      ? parseIsoDate(req.body.expiresAt)
      : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

    if (!name || !slug || !managerPassword) {
      res.status(400).json({
        message:
          'Informe name, slug (ou name valido) e managerPassword para cadastrar o provedor.',
      });
      return;
    }

    if (!isValidProviderName(name)) {
      res.status(400).json({ message: 'Nome do provedor deve ter entre 3 e 120 caracteres.' });
      return;
    }

    if (!SLUG_REGEX.test(slug)) {
      res.status(400).json({
        message:
          'Slug invalido. Use apenas letras minusculas, numeros e hifen (3 a 80 caracteres).',
      });
      return;
    }

    if (!USERNAME_REGEX.test(managerUsername)) {
      res.status(400).json({
        message:
          'Usuario do gestor invalido. Use letras minusculas, numeros, ponto, underscore ou hifen (3 a 40 caracteres).',
      });
      return;
    }

    if (!isValidDisplayName(managerDisplayName)) {
      res.status(400).json({ message: 'Nome do gestor deve ter entre 3 e 80 caracteres.' });
      return;
    }

    if (managerPassword.length < PASSWORD_MIN_LENGTH) {
      res.status(400).json({
        message: `A senha do gestor deve ter ao menos ${PASSWORD_MIN_LENGTH} caracteres.`,
      });
      return;
    }

    if (!isPrivilegedRole(managerRole)) {
      res.status(400).json({
        message: 'O usuario inicial do provedor deve ser Gestor ou Administrador.',
      });
      return;
    }

    if (!nextMaxUsers || nextMaxUsers > 10000) {
      res.status(400).json({ message: 'maxUsers deve ser inteiro entre 1 e 10000.' });
      return;
    }

    if (!isValidPlan(plan)) {
      res.status(400).json({
        message:
          'Plano invalido. Use entre 2 e 60 caracteres (letras, numeros, ponto, barra, underscore ou hifen).',
      });
      return;
    }

    if (!parsedExpiresAt) {
      res.status(400).json({ message: 'Data de expiracao da licenca invalida.' });
      return;
    }

    const db = await readDb();
    if ((db.providers || []).some((provider) => provider.slug === slug)) {
      res.status(409).json({ message: 'Slug de provedor ja utilizado.' });
      return;
    }

    if ((db.providers || []).some((provider) =>
      (provider.users || []).some(
        (user) => user.username.toLowerCase() === managerUsername
      )
    )) {
      res.status(409).json({
        message: 'Usuario do gestor ja utilizado em outro provedor.',
      });
      return;
    }

    const createdAt = nowIso();
    const providerId = randomUUID();

    const provider = {
      id: providerId,
      name,
      slug,
      status: 'active',
      createdAt,
      updatedAt: createdAt,
      license: {
        id: `lic-${providerId.slice(0, 8)}`,
        key: `FTTH-${providerId.slice(0, 8).toUpperCase()}`,
        company: name,
        plan,
        status: 'active',
        maxUsers: nextMaxUsers,
        expiresAt: parsedExpiresAt,
        features:
          Array.isArray(req.body?.features) && req.body.features.length > 0
            ? req.body.features
                .map((item) => String(item))
                .filter((feature) => LICENSE_FEATURES.includes(feature))
            : [...LICENSE_FEATURES],
        createdAt,
        updatedAt: createdAt,
      },
      roles: AUTH_ROLES.map((roleId) => ({
        id: roleId,
        label: ROLE_LABEL[roleId],
        parentRole: ROLE_PARENT[roleId],
        directPermissions: [...DEFAULT_ROLE_PERMISSIONS[roleId]],
        createdAt,
        updatedAt: createdAt,
      })),
      users: [
        {
          id: randomUUID(),
          username: managerUsername,
          displayName: managerDisplayName,
          passwordHash: hashPassword(managerPassword),
          role: managerRole,
          active: true,
          createdAt,
          updatedAt: createdAt,
        },
      ],
      projects: [],
      auditLogs: [],
    };

    await mutateDb((current) => {
      current.providers.push(provider);
      appendSystemAuditLog(current, {
        actorType: 'system',
        actorId: SYSTEM_ADMIN_ACCOUNT.id,
        action: 'providers.create',
        targetType: 'provider',
        targetId: provider.id,
        details: `Provedor ${provider.name} cadastrado.`,
      });
      return current;
    });

    res.status(201).json({ provider: buildProviderSummary(provider) });
  });

  router.patch('/providers/:providerId', requireSystemAuth, async (req, res) => {
    const providerId = req.params.providerId;
    const patch = req.body || {};
    const db = await readDb();
    const provider = findProviderById(db, providerId);
    if (!provider) {
      res.status(404).json({ message: 'Provedor nao encontrado.' });
      return;
    }

    const nextSlug =
      patch.slug !== undefined
        ? createProviderSlug(String(patch.slug))
        : provider.slug;
    if (!nextSlug) {
      res.status(400).json({ message: 'Slug invalido.' });
      return;
    }
    if (
      (db.providers || []).some(
        (item) => item.id !== providerId && item.slug === nextSlug
      )
    ) {
      res.status(409).json({ message: 'Slug em uso por outro provedor.' });
      return;
    }

    const nextStatus =
      patch.status !== undefined ? String(patch.status) : provider.status;
    if (!['active', 'suspended'].includes(nextStatus)) {
      res.status(400).json({ message: 'Status de provedor invalido.' });
      return;
    }

    const updatedProvider = {
      ...provider,
      name: patch.name !== undefined ? String(patch.name).trim() || provider.name : provider.name,
      slug: nextSlug,
      status: nextStatus,
      updatedAt: nowIso(),
    };

    if (!isValidProviderName(updatedProvider.name)) {
      res.status(400).json({ message: 'Nome do provedor deve ter entre 3 e 120 caracteres.' });
      return;
    }

    if (!SLUG_REGEX.test(updatedProvider.slug)) {
      res.status(400).json({
        message:
          'Slug invalido. Use apenas letras minusculas, numeros e hifen (3 a 80 caracteres).',
      });
      return;
    }

    await mutateDb((current) => {
      current.providers = current.providers.map((item) =>
        item.id === providerId ? updatedProvider : item
      );
      appendSystemAuditLog(current, {
        actorType: 'system',
        actorId: SYSTEM_ADMIN_ACCOUNT.id,
        action: 'providers.update',
        targetType: 'provider',
        targetId: providerId,
        details: `Provedor ${updatedProvider.name} atualizado.`,
      });
      return current;
    });

    res.json({ provider: buildProviderSummary(updatedProvider) });
  });

  router.patch('/providers/:providerId/license', requireSystemAuth, async (req, res) => {
    const providerId = req.params.providerId;
    const patch = req.body || {};
    const db = await readDb();
    const provider = findProviderById(db, providerId);
    if (!provider) {
      res.status(404).json({ message: 'Provedor nao encontrado.' });
      return;
    }

    const nextStatus =
      patch.status !== undefined ? String(patch.status) : provider.license.status;
    if (!LICENSE_STATUS.includes(nextStatus)) {
      res.status(400).json({ message: 'Status de licenca invalido.' });
      return;
    }

    const nextFeatures = Array.isArray(patch.features)
      ? patch.features.map((item) => String(item))
      : undefined;
    if (nextFeatures) {
      const invalidFeatures = nextFeatures.filter(
        (feature) => !LICENSE_FEATURES.includes(feature)
      );
      if (invalidFeatures.length > 0) {
        res
          .status(400)
          .json({ message: `Recursos de licenca invalidos: ${invalidFeatures.join(', ')}` });
        return;
      }
    }

    const nextMaxUsers =
      patch.maxUsers !== undefined ? Number(patch.maxUsers) : provider.license.maxUsers;
    if (!Number.isInteger(nextMaxUsers) || nextMaxUsers <= 0 || nextMaxUsers > 10000) {
      res.status(400).json({ message: 'maxUsers deve ser inteiro entre 1 e 10000.' });
      return;
    }
    if (nextMaxUsers < countActiveUsers(provider.users || [])) {
      res.status(409).json({
        message: 'maxUsers nao pode ser menor que usuarios ativos do provedor.',
      });
      return;
    }

    const nextExpiresAt =
      patch.expiresAt !== undefined ? parseIsoDate(patch.expiresAt) : provider.license.expiresAt;
    if (!nextExpiresAt) {
      res.status(400).json({ message: 'expiresAt invalido.' });
      return;
    }

    const nextPlan =
      patch.plan !== undefined ? String(patch.plan).trim() : provider.license.plan;
    if (!isValidPlan(nextPlan)) {
      res.status(400).json({ message: 'Plano da licenca invalido.' });
      return;
    }

    const nextKey =
      patch.key !== undefined ? String(patch.key).trim() : provider.license.key;
    if (!isValidLicenseKey(nextKey)) {
      res.status(400).json({
        message:
          'Chave de licenca invalida. Use entre 4 e 80 caracteres alfanumericos.',
      });
      return;
    }

    const nextCompany =
      patch.company !== undefined
        ? String(patch.company).trim()
        : provider.license.company;
    if (!isValidProviderName(nextCompany)) {
      res.status(400).json({ message: 'Empresa da licenca deve ter entre 3 e 120 caracteres.' });
      return;
    }

    const updatedLicense = {
      ...provider.license,
      key: nextKey,
      company: nextCompany,
      plan: nextPlan,
      status: nextStatus,
      maxUsers: nextMaxUsers,
      expiresAt: nextExpiresAt,
      features: nextFeatures
        ? Array.from(new Set(nextFeatures))
        : provider.license.features,
      updatedAt: nowIso(),
    };

    await mutateDb((current) => {
      const targetProvider = findProviderById(current, providerId);
      if (!targetProvider) return current;
      targetProvider.license = updatedLicense;
      targetProvider.updatedAt = nowIso();
      appendSystemAuditLog(current, {
        actorType: 'system',
        actorId: SYSTEM_ADMIN_ACCOUNT.id,
        action: 'providers.license.update',
        targetType: 'provider',
        targetId: providerId,
        details: `Licenca do provedor ${targetProvider.name} atualizada.`,
      });
      return current;
    });

    res.json({
      license: serializeLicense(updatedLicense, provider.users || []),
    });
  });

  router.post('/providers/:providerId/authorize', requireSystemAuth, async (req, res) => {
    const providerId = req.params.providerId;
    const db = await readDb();
    const provider = findProviderById(db, providerId);
    if (!provider) {
      res.status(404).json({ message: 'Provedor nao encontrado.' });
      return;
    }

    await mutateDb((current) => {
      const targetProvider = findProviderById(current, providerId);
      if (!targetProvider) return current;
      targetProvider.status = 'active';
      targetProvider.license.status = 'active';
      targetProvider.updatedAt = nowIso();
      targetProvider.license.updatedAt = nowIso();
      appendSystemAuditLog(current, {
        actorType: 'system',
        actorId: SYSTEM_ADMIN_ACCOUNT.id,
        action: 'providers.authorize',
        targetType: 'provider',
        targetId: providerId,
        details: `Provedor ${targetProvider.name} autorizado.`,
      });
      return current;
    });

    const refreshed = await readDb();
    const updated = findProviderById(refreshed, providerId);
    res.json({ provider: buildProviderSummary(updated) });
  });

  router.post('/providers/:providerId/revoke', requireSystemAuth, async (req, res) => {
    const providerId = req.params.providerId;
    const db = await readDb();
    const provider = findProviderById(db, providerId);
    if (!provider) {
      res.status(404).json({ message: 'Provedor nao encontrado.' });
      return;
    }

    await mutateDb((current) => {
      const targetProvider = findProviderById(current, providerId);
      if (!targetProvider) return current;
      targetProvider.status = 'suspended';
      targetProvider.updatedAt = nowIso();
      appendSystemAuditLog(current, {
        actorType: 'system',
        actorId: SYSTEM_ADMIN_ACCOUNT.id,
        action: 'providers.revoke',
        targetType: 'provider',
        targetId: providerId,
        details: `Provedor ${targetProvider.name} revogado/suspenso.`,
      });
      return current;
    });

    const refreshed = await readDb();
    const updated = findProviderById(refreshed, providerId);
    res.json({ provider: buildProviderSummary(updated) });
  });

  router.delete('/providers/:providerId', requireSystemAuth, async (req, res) => {
    const providerId = req.params.providerId;
    const db = await readDb();
    const provider = findProviderById(db, providerId);
    if (!provider) {
      res.status(404).json({ message: 'Provedor nao encontrado.' });
      return;
    }

    await mutateDb((current) => {
      current.providers = current.providers.filter((item) => item.id !== providerId);
      appendSystemAuditLog(current, {
        actorType: 'system',
        actorId: SYSTEM_ADMIN_ACCOUNT.id,
        action: 'providers.delete',
        targetType: 'provider',
        targetId: providerId,
        details: `Provedor ${provider.name} removido.`,
      });
      return current;
    });

    res.status(204).send();
  });

  router.get('/providers/:providerId/users', requireSystemAuth, (req, res) => {
    const provider = findProviderOrRespond(req.systemAuth.db, req.params.providerId, res);
    if (!provider) return;

    const users = [...(provider.users || [])]
      .map((user) => toPublicUser(user))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'pt-BR'));

    res.json({ users });
  });

  router.post('/providers/:providerId/users', requireSystemAuth, async (req, res) => {
    const providerId = req.params.providerId;
    const db = await readDb();
    const provider = findProviderOrRespond(db, providerId, res);
    if (!provider) return;

    const username = String(req.body?.username || '').trim().toLowerCase();
    const displayName = String(req.body?.displayName || '').trim();
    const password = String(req.body?.password || '').trim();
    const role = String(req.body?.role || '').trim();
    const active = Boolean(req.body?.active ?? true);
    const parsedPermissions = parsePermissionsInput(req.body?.permissions);

    if (!username || !displayName || !password || !role) {
      res
        .status(400)
        .json({
          message:
            'Campos obrigatorios: usuario de acesso, nome de exibicao, senha e perfil.',
        });
      return;
    }

    if (!USERNAME_REGEX.test(username)) {
      res.status(400).json({
        message:
          'Usuario de acesso invalido. Use letras minusculas, numeros, ponto, underscore ou hifen (3 a 40 caracteres).',
      });
      return;
    }

    if (!isValidDisplayName(displayName)) {
      res.status(400).json({ message: 'Nome do usuario deve ter entre 3 e 80 caracteres.' });
      return;
    }

    if (password.length < PASSWORD_MIN_LENGTH) {
      res.status(400).json({
        message: `A senha deve ter ao menos ${PASSWORD_MIN_LENGTH} caracteres.`,
      });
      return;
    }

    if (!roleExists(role)) {
      res.status(400).json({ message: 'Perfil invalido.' });
      return;
    }

    if (parsedPermissions?.error) {
      res.status(400).json({ message: parsedPermissions.error });
      return;
    }

    if (
      (provider.users || []).some(
        (item) => item.username.toLowerCase() === username
      )
    ) {
      res.status(409).json({ message: 'Usuario ja existente neste provedor.' });
      return;
    }

    if (active && countActiveUsers(provider.users || []) >= provider.license.maxUsers) {
      res.status(409).json({ message: 'Limite de usuarios ativos atingido para a licenca atual.' });
      return;
    }

    const createdAt = nowIso();
    const user = {
      id: randomUUID(),
      username,
      displayName,
      role,
      passwordHash: hashPassword(password),
      active,
      createdAt,
      updatedAt: createdAt,
    };
    if (parsedPermissions?.provided && Array.isArray(parsedPermissions.permissions)) {
      user.permissions = parsedPermissions.permissions;
    }

    await mutateDb((current) => {
      const targetProvider = findProviderById(current, providerId);
      if (!targetProvider) return current;

      targetProvider.users.push(user);
      targetProvider.updatedAt = nowIso();
      appendProviderAuditLog(targetProvider, {
        actorUsername: SYSTEM_ADMIN_ACCOUNT.username,
        action: 'users.create.system',
        targetType: 'user',
        targetId: user.id,
        details: `Usuario ${username} criado pelo administrador global.`,
      });
      appendSystemAuditLog(current, {
        actorType: 'system',
        actorId: SYSTEM_ADMIN_ACCOUNT.id,
        action: 'providers.users.create',
        targetType: 'user',
        targetId: user.id,
        details: `Usuario ${username} criado no provedor ${targetProvider.name}.`,
      });
      return current;
    });

    res.status(201).json({ user: toPublicUser(user) });
  });

  router.patch('/providers/:providerId/users/:userId', requireSystemAuth, async (req, res) => {
    const providerId = req.params.providerId;
    const userId = req.params.userId;
    const db = await readDb();
    const provider = findProviderOrRespond(db, providerId, res);
    if (!provider) return;

    const currentUser = (provider.users || []).find((item) => item.id === userId);
    if (!currentUser) {
      res.status(404).json({ message: 'Usuario nao encontrado.' });
      return;
    }

    const username = req.body?.username
      ? String(req.body.username).trim().toLowerCase()
      : undefined;
    const displayName = req.body?.displayName
      ? String(req.body.displayName).trim()
      : undefined;
    const password = req.body?.password ? String(req.body.password).trim() : undefined;
    const role = req.body?.role ? String(req.body.role).trim() : undefined;
    const active = typeof req.body?.active === 'boolean' ? req.body.active : undefined;
    const parsedPermissions = parsePermissionsInput(req.body?.permissions);

    if (
      username &&
      (provider.users || []).some(
        (item) =>
          item.id !== userId && item.username.toLowerCase() === username
      )
    ) {
      res.status(409).json({ message: 'Usuario de acesso em uso por outro usuario do provedor.' });
      return;
    }

    if (username && !USERNAME_REGEX.test(username)) {
      res.status(400).json({
        message:
          'Usuario de acesso invalido. Use letras minusculas, numeros, ponto, underscore ou hifen (3 a 40 caracteres).',
      });
      return;
    }

    if (displayName !== undefined && !isValidDisplayName(displayName)) {
      res.status(400).json({ message: 'Nome do usuario deve ter entre 3 e 80 caracteres.' });
      return;
    }

    if (password && password.length < PASSWORD_MIN_LENGTH) {
      res.status(400).json({
        message: `A senha deve ter ao menos ${PASSWORD_MIN_LENGTH} caracteres.`,
      });
      return;
    }

    if (role && !roleExists(role)) {
      res.status(400).json({ message: 'Perfil invalido.' });
      return;
    }

    if (parsedPermissions?.error) {
      res.status(400).json({ message: parsedPermissions.error });
      return;
    }

    if (
      active === true &&
      !currentUser.active &&
      countActiveUsers(provider.users || []) >= provider.license.maxUsers
    ) {
      res.status(409).json({ message: 'Sem assentos disponiveis na licenca.' });
      return;
    }

    const nextUser = {
      ...currentUser,
      username: username ?? currentUser.username,
      displayName: displayName ?? currentUser.displayName,
      role: role ?? currentUser.role,
      active: active ?? currentUser.active,
      passwordHash: password ? hashPassword(password) : currentUser.passwordHash,
      updatedAt: nowIso(),
    };
    if (parsedPermissions?.provided) {
      if (parsedPermissions.permissions === null) {
        delete nextUser.permissions;
      } else {
        nextUser.permissions = parsedPermissions.permissions;
      }
    }

    const nextUsers = (provider.users || []).map((item) =>
      item.id === userId ? nextUser : item
    );
    if (!ensureAtLeastOnePrivilegedUser(nextUsers)) {
      res.status(409).json({
        message: 'Mantenha ao menos um gestor/admin ativo no provedor.',
      });
      return;
    }

    await mutateDb((current) => {
      const targetProvider = findProviderById(current, providerId);
      if (!targetProvider) return current;

      targetProvider.users = nextUsers;
      targetProvider.updatedAt = nowIso();
      appendProviderAuditLog(targetProvider, {
        actorUsername: SYSTEM_ADMIN_ACCOUNT.username,
        action: 'users.update.system',
        targetType: 'user',
        targetId: userId,
        details: `Usuario ${nextUser.username} atualizado pelo administrador global.`,
      });
      appendSystemAuditLog(current, {
        actorType: 'system',
        actorId: SYSTEM_ADMIN_ACCOUNT.id,
        action: 'providers.users.update',
        targetType: 'user',
        targetId: userId,
        details: `Usuario ${nextUser.username} atualizado no provedor ${targetProvider.name}.`,
      });
      return current;
    });

    res.json({ user: toPublicUser(nextUser) });
  });

  router.delete('/providers/:providerId/users/:userId', requireSystemAuth, async (req, res) => {
    const providerId = req.params.providerId;
    const userId = req.params.userId;
    const db = await readDb();
    const provider = findProviderOrRespond(db, providerId, res);
    if (!provider) return;

    const user = (provider.users || []).find((item) => item.id === userId);
    if (!user) {
      res.status(404).json({ message: 'Usuario nao encontrado.' });
      return;
    }

    const nextUsers = (provider.users || []).filter((item) => item.id !== userId);
    if (!ensureAtLeastOnePrivilegedUser(nextUsers)) {
      res.status(409).json({
        message: 'Mantenha ao menos um gestor/admin ativo no provedor.',
      });
      return;
    }

    await mutateDb((current) => {
      const targetProvider = findProviderById(current, providerId);
      if (!targetProvider) return current;

      targetProvider.users = nextUsers;
      targetProvider.updatedAt = nowIso();
      appendProviderAuditLog(targetProvider, {
        actorUsername: SYSTEM_ADMIN_ACCOUNT.username,
        action: 'users.delete.system',
        targetType: 'user',
        targetId: userId,
        details: `Usuario ${user.username} removido pelo administrador global.`,
      });
      appendSystemAuditLog(current, {
        actorType: 'system',
        actorId: SYSTEM_ADMIN_ACCOUNT.id,
        action: 'providers.users.delete',
        targetType: 'user',
        targetId: userId,
        details: `Usuario ${user.username} removido do provedor ${targetProvider.name}.`,
      });
      return current;
    });

    res.status(204).send();
  });

  router.get('/providers/:providerId/roles', requireSystemAuth, (req, res) => {
    const provider = findProviderOrRespond(req.systemAuth.db, req.params.providerId, res);
    if (!provider) return;

    const roles = (provider.roles || []).map((role) => toRolePayload(provider, role));
    res.json({ roles });
  });

  router.patch('/providers/:providerId/roles/:roleId', requireSystemAuth, async (req, res) => {
    const providerId = req.params.providerId;
    const roleId = req.params.roleId;
    const directPermissions = Array.isArray(req.body?.directPermissions)
      ? req.body.directPermissions.map((item) => String(item))
      : null;

    if (!roleExists(roleId)) {
      res.status(404).json({ message: 'Perfil nao encontrado.' });
      return;
    }

    if (!directPermissions) {
      res
        .status(400)
        .json({ message: 'Envie o array directPermissions (permissoes diretas).' });
      return;
    }

    const invalidPermissions = directPermissions.filter(
      (permission) => !ALL_PERMISSIONS.includes(permission)
    );
    if (invalidPermissions.length > 0) {
      res.status(400).json({
        message: `Permissoes invalidas: ${invalidPermissions.join(', ')}`,
      });
      return;
    }

    const db = await readDb();
    const provider = findProviderOrRespond(db, providerId, res);
    if (!provider) return;

    if (!(provider.roles || []).some((role) => role.id === roleId)) {
      res.status(404).json({ message: 'Perfil nao encontrado no provedor.' });
      return;
    }

    const updatedAt = nowIso();
    const nextDirectPermissions = Array.from(new Set(directPermissions));

    await mutateDb((current) => {
      const targetProvider = findProviderById(current, providerId);
      if (!targetProvider) return current;

      targetProvider.roles = (targetProvider.roles || []).map((role) =>
        role.id === roleId
          ? {
              ...role,
              directPermissions: nextDirectPermissions,
              updatedAt,
            }
          : role
      );
      targetProvider.updatedAt = nowIso();
      appendProviderAuditLog(targetProvider, {
        actorUsername: SYSTEM_ADMIN_ACCOUNT.username,
        action: 'roles.update.system',
        targetType: 'role',
        targetId: roleId,
        details: `Perfil ${roleId} atualizado pelo administrador global.`,
      });
      appendSystemAuditLog(current, {
        actorType: 'system',
        actorId: SYSTEM_ADMIN_ACCOUNT.id,
        action: 'providers.roles.update',
        targetType: 'role',
        targetId: roleId,
        details: `Perfil ${roleId} atualizado no provedor ${targetProvider.name}.`,
      });
      return current;
    });

    const refreshedDb = await readDb();
    const refreshedProvider = findProviderOrRespond(refreshedDb, providerId, res);
    if (!refreshedProvider) return;
    const roles = (refreshedProvider.roles || []).map((role) =>
      toRolePayload(refreshedProvider, role)
    );
    res.json({ roles });
  });

  router.get('/providers/:providerId/projects', requireSystemAuth, (req, res) => {
    const provider = findProviderOrRespond(req.systemAuth.db, req.params.providerId, res);
    if (!provider) return;

    const projects = [...(provider.projects || [])]
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      .map((project) => buildProjectSummary(project));

    res.json({ projects });
  });

  router.post('/providers/:providerId/projects', requireSystemAuth, async (req, res) => {
    const providerId = req.params.providerId;
    const db = await readDb();
    const provider = findProviderOrRespond(db, providerId, res);
    if (!provider) return;

    const name = String(req.body?.name || '').trim();
    const description = String(req.body?.description || '').trim();
    if (!name) {
      res.status(400).json({ message: 'Informe o nome do projeto.' });
      return;
    }
    if (name.length < 3 || name.length > 120) {
      res.status(400).json({ message: 'Nome do projeto deve ter entre 3 e 120 caracteres.' });
      return;
    }
    if (description.length > 500) {
      res.status(400).json({ message: 'Descricao do projeto deve ter no maximo 500 caracteres.' });
      return;
    }

    const id = randomUUID();
    const createdAt = nowIso();
    const project = {
      id,
      name,
      description: description || undefined,
      network: createEmptyNetwork(id, name, description || undefined),
      createdAt,
      updatedAt: createdAt,
      createdBy: SYSTEM_ADMIN_ACCOUNT.id,
      updatedBy: SYSTEM_ADMIN_ACCOUNT.id,
    };

    await mutateDb((current) => {
      const targetProvider = findProviderById(current, providerId);
      if (!targetProvider) return current;

      targetProvider.projects.unshift(project);
      targetProvider.updatedAt = nowIso();
      appendProviderAuditLog(targetProvider, {
        actorUsername: SYSTEM_ADMIN_ACCOUNT.username,
        action: 'projects.create.system',
        targetType: 'project',
        targetId: id,
        details: `Projeto ${name} criado pelo administrador global.`,
      });
      appendSystemAuditLog(current, {
        actorType: 'system',
        actorId: SYSTEM_ADMIN_ACCOUNT.id,
        action: 'providers.projects.create',
        targetType: 'project',
        targetId: id,
        details: `Projeto ${name} criado no provedor ${targetProvider.name}.`,
      });
      return current;
    });

    res.status(201).json({ project: buildProjectSummary(project) });
  });

  router.put('/providers/:providerId/projects/:projectId', requireSystemAuth, async (req, res) => {
    const providerId = req.params.providerId;
    const projectId = req.params.projectId;
    const db = await readDb();
    const provider = findProviderOrRespond(db, providerId, res);
    if (!provider) return;

    const currentProject = (provider.projects || []).find((item) => item.id === projectId);
    if (!currentProject) {
      res.status(404).json({ message: 'Projeto nao encontrado.' });
      return;
    }

    const incomingNetwork = req.body?.network;
    const incomingName = req.body?.name ? String(req.body.name).trim() : undefined;
    const incomingDescription =
      req.body?.description !== undefined ? String(req.body.description).trim() : undefined;

    if (incomingName !== undefined && (incomingName.length < 3 || incomingName.length > 120)) {
      res.status(400).json({ message: 'Nome do projeto deve ter entre 3 e 120 caracteres.' });
      return;
    }
    if (incomingDescription !== undefined && incomingDescription.length > 500) {
      res.status(400).json({ message: 'Descricao do projeto deve ter no maximo 500 caracteres.' });
      return;
    }

    let network = currentProject.network;
    if (incomingNetwork && typeof incomingNetwork === 'object') {
      network = {
        ...incomingNetwork,
        id: projectId,
        name: incomingName || incomingNetwork.name || currentProject.name,
        description:
          incomingDescription !== undefined
            ? incomingDescription || undefined
            : incomingNetwork.description || currentProject.description,
        createdAt: incomingNetwork.createdAt || currentProject.createdAt,
        updatedAt: nowIso(),
      };
    } else {
      network = {
        ...currentProject.network,
        name: incomingName || currentProject.name,
        description:
          incomingDescription !== undefined
            ? incomingDescription || undefined
            : currentProject.description,
        updatedAt: nowIso(),
      };
    }

    const updatedProject = {
      ...currentProject,
      name: network.name || incomingName || currentProject.name,
      description:
        incomingDescription !== undefined
          ? incomingDescription || undefined
          : network.description || currentProject.description,
      network,
      updatedAt: nowIso(),
      updatedBy: SYSTEM_ADMIN_ACCOUNT.id,
    };

    await mutateDb((current) => {
      const targetProvider = findProviderById(current, providerId);
      if (!targetProvider) return current;

      targetProvider.projects = targetProvider.projects.map((item) =>
        item.id === projectId ? updatedProject : item
      );
      targetProvider.updatedAt = nowIso();
      appendProviderAuditLog(targetProvider, {
        actorUsername: SYSTEM_ADMIN_ACCOUNT.username,
        action: 'projects.update.system',
        targetType: 'project',
        targetId: projectId,
        details: `Projeto ${updatedProject.name} atualizado pelo administrador global.`,
      });
      appendSystemAuditLog(current, {
        actorType: 'system',
        actorId: SYSTEM_ADMIN_ACCOUNT.id,
        action: 'providers.projects.update',
        targetType: 'project',
        targetId: projectId,
        details: `Projeto ${updatedProject.name} atualizado no provedor ${targetProvider.name}.`,
      });
      return current;
    });

    res.json({ project: buildProjectSummary(updatedProject) });
  });

  router.delete('/providers/:providerId/projects/:projectId', requireSystemAuth, async (req, res) => {
    const providerId = req.params.providerId;
    const projectId = req.params.projectId;
    const db = await readDb();
    const provider = findProviderOrRespond(db, providerId, res);
    if (!provider) return;

    const project = (provider.projects || []).find((item) => item.id === projectId);
    if (!project) {
      res.status(404).json({ message: 'Projeto nao encontrado.' });
      return;
    }

    await mutateDb((current) => {
      const targetProvider = findProviderById(current, providerId);
      if (!targetProvider) return current;

      targetProvider.projects = targetProvider.projects.filter((item) => item.id !== projectId);
      targetProvider.updatedAt = nowIso();
      appendProviderAuditLog(targetProvider, {
        actorUsername: SYSTEM_ADMIN_ACCOUNT.username,
        action: 'projects.delete.system',
        targetType: 'project',
        targetId: projectId,
        details: `Projeto ${project.name} removido pelo administrador global.`,
      });
      appendSystemAuditLog(current, {
        actorType: 'system',
        actorId: SYSTEM_ADMIN_ACCOUNT.id,
        action: 'providers.projects.delete',
        targetType: 'project',
        targetId: projectId,
        details: `Projeto ${project.name} removido do provedor ${targetProvider.name}.`,
      });
      return current;
    });

    res.status(204).send();
  });

  router.get('/audit-logs', requireSystemAuth, (req, res) => {
    const limit = Math.max(1, Math.min(1000, Number(req.query.limit) || 200));
    res.json({ logs: (req.systemAuth.db.systemAuditLogs || []).slice(0, limit) });
  });

  router.get('/providers/:providerId/audit-logs', requireSystemAuth, (req, res) => {
    const provider = findProviderOrRespond(req.systemAuth.db, req.params.providerId, res);
    if (!provider) return;

    const limit = Math.max(1, Math.min(1000, Number(req.query.limit) || 200));
    res.json({ logs: (provider.auditLogs || []).slice(0, limit) });
  });

  return router;
};
