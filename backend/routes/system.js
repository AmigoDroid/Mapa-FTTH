import express from 'express';
import { randomUUID } from 'node:crypto';
import { SYSTEM_ADMIN_ACCOUNT } from '../config/system-admin.js';
import { AUTH_ROLES, LICENSE_FEATURES, PERMISSIONS } from '../constants.js';
import { LICENSE_STATUS, countActiveUsers, serializeLicense } from '../license.js';
import { roleExists } from '../rbac.js';
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

const systemSessionPayload = () => ({
  admin: {
    id: SYSTEM_ADMIN_ACCOUNT.id,
    username: SYSTEM_ADMIN_ACCOUNT.username,
    displayName: SYSTEM_ADMIN_ACCOUNT.displayName,
  },
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
    if (!username || !password) {
      res.status(400).json({ message: 'Informe usuario e senha.' });
      return;
    }

    if (
      username.toLowerCase() !== SYSTEM_ADMIN_ACCOUNT.username.toLowerCase()
    ) {
      res.status(401).json({ message: 'Credenciais invalidas para administrador global.' });
      return;
    }

    const passwordMatches = SYSTEM_ADMIN_ACCOUNT.passwordPlain
      ? password === SYSTEM_ADMIN_ACCOUNT.passwordPlain
      : verifyPassword(password, SYSTEM_ADMIN_ACCOUNT.passwordHash);
    if (!passwordMatches) {
      res.status(401).json({ message: 'Credenciais invalidas para administrador global.' });
      return;
    }

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

    if (!name || !slug || !managerPassword) {
      res.status(400).json({
        message:
          'Informe name, slug (ou name valido) e managerPassword para cadastrar o provedor.',
      });
      return;
    }

    if (managerPassword.length < 6) {
      res.status(400).json({ message: 'A senha do gestor deve ter ao menos 6 caracteres.' });
      return;
    }

    const db = await readDb();
    if ((db.providers || []).some((provider) => provider.slug === slug)) {
      res.status(409).json({ message: 'Slug de provedor ja utilizado.' });
      return;
    }

    const createdAt = nowIso();
    const providerId = randomUUID();
    const managerRole = roleExists(req.body?.managerRole) ? req.body.managerRole : 'manager';

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
        plan: String(req.body?.plan || 'enterprise'),
        status: 'active',
        maxUsers: Math.max(1, Number(req.body?.maxUsers || 20)),
        expiresAt:
          req.body?.expiresAt && !Number.isNaN(Date.parse(String(req.body.expiresAt)))
            ? new Date(req.body.expiresAt).toISOString()
            : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
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
          .json({ message: `Features invalidas: ${invalidFeatures.join(', ')}` });
        return;
      }
    }

    const nextMaxUsers =
      patch.maxUsers !== undefined ? Number(patch.maxUsers) : provider.license.maxUsers;
    if (!Number.isInteger(nextMaxUsers) || nextMaxUsers <= 0) {
      res.status(400).json({ message: 'maxUsers deve ser inteiro positivo.' });
      return;
    }
    if (nextMaxUsers < countActiveUsers(provider.users || [])) {
      res.status(409).json({
        message: 'maxUsers nao pode ser menor que usuarios ativos do provedor.',
      });
      return;
    }

    const nextExpiresAt =
      patch.expiresAt !== undefined
        ? new Date(patch.expiresAt).toISOString()
        : provider.license.expiresAt;
    if (Number.isNaN(Date.parse(nextExpiresAt))) {
      res.status(400).json({ message: 'expiresAt invalido.' });
      return;
    }

    const updatedLicense = {
      ...provider.license,
      key: patch.key !== undefined ? String(patch.key).trim() : provider.license.key,
      company:
        patch.company !== undefined
          ? String(patch.company).trim()
          : provider.license.company,
      plan: patch.plan !== undefined ? String(patch.plan).trim() : provider.license.plan,
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

    if (!username || !displayName || !password || !role) {
      res
        .status(400)
        .json({ message: 'Campos obrigatorios: username, displayName, password e role.' });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ message: 'A senha deve ter ao menos 6 caracteres.' });
      return;
    }

    if (!roleExists(role)) {
      res.status(400).json({ message: 'Role invalida.' });
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

    if (
      username &&
      (provider.users || []).some(
        (item) =>
          item.id !== userId && item.username.toLowerCase() === username
      )
    ) {
      res.status(409).json({ message: 'Username em uso por outro usuario do provedor.' });
      return;
    }

    if (password && password.length < 6) {
      res.status(400).json({ message: 'A senha deve ter ao menos 6 caracteres.' });
      return;
    }

    if (role && !roleExists(role)) {
      res.status(400).json({ message: 'Role invalida.' });
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

    await mutateDb((current) => {
      const targetProvider = findProviderById(current, providerId);
      if (!targetProvider) return current;

      targetProvider.users = targetProvider.users.map((item) =>
        item.id === userId ? nextUser : item
      );
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

    await mutateDb((current) => {
      const targetProvider = findProviderById(current, providerId);
      if (!targetProvider) return current;

      targetProvider.users = targetProvider.users.filter((item) => item.id !== userId);
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

  return router;
};
