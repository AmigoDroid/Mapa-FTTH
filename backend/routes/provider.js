import express from 'express';
import { randomUUID } from 'node:crypto';
import { ALL_PERMISSIONS, AUTH_ROLES, PERMISSIONS } from '../constants.js';
import { computeLicenseState, countActiveUsers, serializeLicense } from '../license.js';
import { hasPermission, listPermissionsForRole, roleExists } from '../rbac.js';
import { hashPassword, signAccessToken, verifyAccessToken, verifyPassword } from '../security.js';
import {
  appendProviderAuditLog,
  mutateDb,
  readDb,
} from '../storage.js';
import {
  buildProjectSummary,
  createEmptyNetwork,
  ensureAtLeastOnePrivilegedUser,
  findProviderById,
  findProviderBySlug,
  getBearerToken,
  nowIso,
  toPublicUser,
} from './shared.js';

const toRolePayload = (provider, role) => ({
  id: role.id,
  label: role.label,
  parentRole: role.parentRole,
  directPermissions: role.directPermissions,
  effectivePermissions: listPermissionsForRole(provider.roles, role.id),
  createdAt: role.createdAt,
  updatedAt: role.updatedAt,
});

const providerSessionPayload = (provider, user) => ({
  provider: {
    id: provider.id,
    name: provider.name,
    slug: provider.slug,
    status: provider.status,
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt,
  },
  user: toPublicUser(user),
  permissions: listPermissionsForRole(provider.roles, user.role),
  license: serializeLicense(provider.license, provider.users),
});

export const createProviderRouter = ({ jwtSecret, accessTokenTtl }) => {
  const router = express.Router();

  const requireProviderAuth = async (req, res, next) => {
    try {
      const token = getBearerToken(req.headers.authorization);
      if (!token) {
        res.status(401).json({ message: 'Token ausente.' });
        return;
      }

      const decoded = verifyAccessToken(token, jwtSecret);
      if (decoded.kind !== 'provider') {
        res.status(401).json({ message: 'Sessao invalida para portal de provedor.' });
        return;
      }

      const db = await readDb();
      const provider = findProviderById(db, decoded.providerId);
      if (!provider) {
        res.status(401).json({ message: 'Provedor nao encontrado.' });
        return;
      }

      if (provider.status !== 'active') {
        res.status(403).json({ message: 'Acesso do provedor revogado pelo admin global.' });
        return;
      }

      const licenseState = computeLicenseState(provider.license);
      if (!licenseState.isActive) {
        res.status(403).json({ message: licenseState.reason || 'Licenca inativa.' });
        return;
      }

      const user = (provider.users || []).find((item) => item.id === decoded.sub);
      if (!user || !user.active) {
        res.status(401).json({ message: 'Usuario inativo ou inexistente.' });
        return;
      }

      req.providerAuth = {
        db,
        provider,
        user,
        permissions: listPermissionsForRole(provider.roles, user.role),
      };
      next();
    } catch {
      res.status(401).json({ message: 'Token invalido ou expirado.' });
    }
  };

  const requireProviderPermission = (permission) => (req, res, next) => {
    if (!req.providerAuth) {
      res.status(401).json({ message: 'Nao autenticado.' });
      return;
    }

    if (!hasPermission(req.providerAuth.permissions, permission)) {
      res.status(403).json({ message: `Permissao insuficiente: ${permission}.` });
      return;
    }

    next();
  };

  const requireProviderLicenseFeature = (feature) => (req, res, next) => {
    if (!req.providerAuth) {
      res.status(401).json({ message: 'Nao autenticado.' });
      return;
    }

    if (req.providerAuth.provider.status !== 'active') {
      res.status(403).json({ message: 'Provedor suspenso pelo administrador global.' });
      return;
    }

    const licenseState = computeLicenseState(req.providerAuth.provider.license);
    if (!licenseState.isActive) {
      res.status(403).json({
        message: licenseState.reason || 'Licenca inativa.',
        license: serializeLicense(
          req.providerAuth.provider.license,
          req.providerAuth.provider.users
        ),
      });
      return;
    }

    if (!req.providerAuth.provider.license.features.includes(feature)) {
      res.status(403).json({
        message: `Recurso nao habilitado na licenca: ${feature}.`,
        license: serializeLicense(
          req.providerAuth.provider.license,
          req.providerAuth.provider.users
        ),
      });
      return;
    }

    next();
  };

  router.get('/health', async (_req, res) => {
    const db = await readDb();
    const providers = db.providers || [];
    res.json({
      status: 'ok',
      timestamp: nowIso(),
      version: db.version,
      providers: providers.length,
      users: providers.reduce((acc, item) => acc + (item.users || []).length, 0),
      projects: providers.reduce((acc, item) => acc + (item.projects || []).length, 0),
    });
  });

  router.post('/auth/login', async (req, res) => {
    const providerSlug = String(req.body?.providerSlug || '').trim().toLowerCase();
    const username = String(req.body?.username || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!providerSlug || !username || !password) {
      res
        .status(400)
        .json({ message: 'Informe providerSlug, usuario e senha.' });
      return;
    }

    const db = await readDb();
    const provider = findProviderBySlug(db, providerSlug);
    if (!provider) {
      res.status(404).json({ message: 'Provedor nao encontrado.' });
      return;
    }

    if (provider.status !== 'active') {
      res.status(403).json({ message: 'Provedor suspenso pelo administrador global.' });
      return;
    }

    const licenseState = computeLicenseState(provider.license);
    if (!licenseState.isActive) {
      res.status(403).json({ message: licenseState.reason || 'Licenca inativa.' });
      return;
    }

    const user = (provider.users || []).find(
      (item) => item.username.toLowerCase() === username
    );
    if (!user || !user.active || !verifyPassword(password, user.passwordHash)) {
      res.status(401).json({ message: 'Usuario ou senha invalidos.' });
      return;
    }

    const token = signAccessToken(
      {
        sub: user.id,
        providerId: provider.id,
        role: user.role,
        kind: 'provider',
      },
      jwtSecret,
      accessTokenTtl
    );

    await mutateDb((current) => {
      const targetProvider = findProviderById(current, provider.id);
      if (!targetProvider) return current;
      appendProviderAuditLog(targetProvider, {
        actorUserId: user.id,
        actorUsername: user.username,
        action: 'auth.login',
        targetType: 'session',
        targetId: user.id,
        details: 'Login do provedor realizado com sucesso.',
      });
      return current;
    });

    res.json({
      token,
      ...providerSessionPayload(provider, user),
    });
  });

  router.get('/auth/me', requireProviderAuth, (req, res) => {
    res.json(providerSessionPayload(req.providerAuth.provider, req.providerAuth.user));
  });

  router.get(
    '/users',
    requireProviderAuth,
    requireProviderPermission(PERMISSIONS.USERS_READ),
    requireProviderLicenseFeature('user_management'),
    (req, res) => {
      const users = [...(req.providerAuth.provider.users || [])]
        .map((user) => toPublicUser(user))
        .sort((a, b) => a.displayName.localeCompare(b.displayName, 'pt-BR'));
      res.json({ users });
    }
  );

  router.post(
    '/users',
    requireProviderAuth,
    requireProviderPermission(PERMISSIONS.USERS_CREATE),
    requireProviderLicenseFeature('user_management'),
    async (req, res) => {
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

      const provider = req.providerAuth.provider;
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
        const targetProvider = findProviderById(current, provider.id);
        if (!targetProvider) return current;
        targetProvider.users.push(user);
        targetProvider.updatedAt = nowIso();
        appendProviderAuditLog(targetProvider, {
          actorUserId: req.providerAuth.user.id,
          actorUsername: req.providerAuth.user.username,
          action: 'users.create',
          targetType: 'user',
          targetId: user.id,
          details: `Usuario ${username} criado com role ${role}.`,
        });
        return current;
      });

      res.status(201).json({ user: toPublicUser(user) });
    }
  );

  router.patch(
    '/users/:userId',
    requireProviderAuth,
    requireProviderPermission(PERMISSIONS.USERS_UPDATE),
    requireProviderLicenseFeature('user_management'),
    async (req, res) => {
      const provider = req.providerAuth.provider;
      const userId = req.params.userId;
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

      const nextUsers = (provider.users || []).map((item) =>
        item.id === userId ? nextUser : item
      );
      if (!ensureAtLeastOnePrivilegedUser(nextUsers)) {
        res.status(409).json({ message: 'Mantenha ao menos um gestor/admin ativo.' });
        return;
      }

      await mutateDb((current) => {
        const targetProvider = findProviderById(current, provider.id);
        if (!targetProvider) return current;
        targetProvider.users = targetProvider.users.map((item) =>
          item.id === userId ? nextUser : item
        );
        targetProvider.updatedAt = nowIso();
        appendProviderAuditLog(targetProvider, {
          actorUserId: req.providerAuth.user.id,
          actorUsername: req.providerAuth.user.username,
          action: 'users.update',
          targetType: 'user',
          targetId: nextUser.id,
          details: `Usuario ${nextUser.username} atualizado.`,
        });
        return current;
      });

      res.json({ user: toPublicUser(nextUser) });
    }
  );

  router.delete(
    '/users/:userId',
    requireProviderAuth,
    requireProviderPermission(PERMISSIONS.USERS_DELETE),
    requireProviderLicenseFeature('user_management'),
    async (req, res) => {
      const provider = req.providerAuth.provider;
      const userId = req.params.userId;
      if (req.providerAuth.user.id === userId) {
        res.status(400).json({ message: 'Voce nao pode excluir sua propria conta.' });
        return;
      }

      const user = (provider.users || []).find((item) => item.id === userId);
      if (!user) {
        res.status(404).json({ message: 'Usuario nao encontrado.' });
        return;
      }

      const nextUsers = (provider.users || []).filter((item) => item.id !== userId);
      if (!ensureAtLeastOnePrivilegedUser(nextUsers)) {
        res.status(409).json({ message: 'Mantenha ao menos um gestor/admin ativo.' });
        return;
      }

      await mutateDb((current) => {
        const targetProvider = findProviderById(current, provider.id);
        if (!targetProvider) return current;
        targetProvider.users = targetProvider.users.filter((item) => item.id !== userId);
        targetProvider.updatedAt = nowIso();
        appendProviderAuditLog(targetProvider, {
          actorUserId: req.providerAuth.user.id,
          actorUsername: req.providerAuth.user.username,
          action: 'users.delete',
          targetType: 'user',
          targetId: user.id,
          details: `Usuario ${user.username} removido.`,
        });
        return current;
      });

      res.status(204).send();
    }
  );

  router.get(
    '/roles',
    requireProviderAuth,
    requireProviderPermission(PERMISSIONS.ROLES_READ),
    (req, res) => {
      const roles = (req.providerAuth.provider.roles || []).map((role) =>
        toRolePayload(req.providerAuth.provider, role)
      );
      res.json({ roles });
    }
  );

  router.patch(
    '/roles/:roleId',
    requireProviderAuth,
    requireProviderPermission(PERMISSIONS.ROLES_UPDATE),
    requireProviderLicenseFeature('role_management'),
    async (req, res) => {
      const provider = req.providerAuth.provider;
      const roleId = req.params.roleId;
      const directPermissions = Array.isArray(req.body?.directPermissions)
        ? req.body.directPermissions.map((item) => String(item))
        : null;

      if (!AUTH_ROLES.includes(roleId)) {
        res.status(404).json({ message: 'Role nao encontrada.' });
        return;
      }

      if (!directPermissions) {
        res.status(400).json({ message: 'Envie directPermissions (array de permissoes).' });
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

      if (directPermissions.includes(PERMISSIONS.LICENSE_UPDATE)) {
        res.status(400).json({
          message:
            'Permissao license.update e exclusiva do administrador global.',
        });
        return;
      }

      const updatedAt = nowIso();
      await mutateDb((current) => {
        const targetProvider = findProviderById(current, provider.id);
        if (!targetProvider) return current;
        targetProvider.roles = targetProvider.roles.map((role) =>
          role.id === roleId
            ? {
                ...role,
                directPermissions: Array.from(new Set(directPermissions)),
                updatedAt,
              }
            : role
        );
        targetProvider.updatedAt = nowIso();
        appendProviderAuditLog(targetProvider, {
          actorUserId: req.providerAuth.user.id,
          actorUsername: req.providerAuth.user.username,
          action: 'roles.update',
          targetType: 'role',
          targetId: roleId,
          details: `Role ${roleId} atualizada.`,
        });
        return current;
      });

      const db = await readDb();
      const nextProvider = findProviderById(db, provider.id);
      res.json({
        roles: (nextProvider?.roles || []).map((role) =>
          toRolePayload(nextProvider, role)
        ),
      });
    }
  );

  router.get(
    '/license',
    requireProviderAuth,
    requireProviderPermission(PERMISSIONS.LICENSE_READ),
    (req, res) => {
      res.json({
        license: serializeLicense(
          req.providerAuth.provider.license,
          req.providerAuth.provider.users
        ),
      });
    }
  );

  router.patch('/license', requireProviderAuth, (_req, res) => {
    res.status(403).json({
      message:
        'Atualizacao de licenca permitida somente no painel de administrador global.',
    });
  });

  router.get(
    '/audit-logs',
    requireProviderAuth,
    requireProviderPermission(PERMISSIONS.AUDIT_READ),
    requireProviderLicenseFeature('audit_logs'),
    (req, res) => {
      const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 100));
      res.json({ logs: (req.providerAuth.provider.auditLogs || []).slice(0, limit) });
    }
  );

  router.get(
    '/projects',
    requireProviderAuth,
    requireProviderPermission(PERMISSIONS.NETWORK_READ),
    requireProviderLicenseFeature('project_management'),
    (req, res) => {
      const projects = [...(req.providerAuth.provider.projects || [])]
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
        .map((project) => buildProjectSummary(project));
      res.json({ projects });
    }
  );

  router.post(
    '/projects',
    requireProviderAuth,
    requireProviderPermission(PERMISSIONS.NETWORK_CREATE),
    requireProviderLicenseFeature('project_management'),
    async (req, res) => {
      const provider = req.providerAuth.provider;
      const name = String(req.body?.name || '').trim();
      const description = String(req.body?.description || '').trim();
      if (!name) {
        res.status(400).json({ message: 'Informe o nome do projeto.' });
        return;
      }

      const id = randomUUID();
      const createdAt = nowIso();
      const network = createEmptyNetwork(id, name, description || undefined);
      const project = {
        id,
        name,
        description: description || undefined,
        network,
        createdAt,
        updatedAt: createdAt,
        createdBy: req.providerAuth.user.id,
        updatedBy: req.providerAuth.user.id,
      };

      await mutateDb((current) => {
        const targetProvider = findProviderById(current, provider.id);
        if (!targetProvider) return current;
        targetProvider.projects.unshift(project);
        targetProvider.updatedAt = nowIso();
        appendProviderAuditLog(targetProvider, {
          actorUserId: req.providerAuth.user.id,
          actorUsername: req.providerAuth.user.username,
          action: 'projects.create',
          targetType: 'project',
          targetId: id,
          details: `Projeto ${name} criado.`,
        });
        return current;
      });

      res.status(201).json({ project: buildProjectSummary(project) });
    }
  );

  router.get(
    '/projects/:projectId',
    requireProviderAuth,
    requireProviderPermission(PERMISSIONS.NETWORK_READ),
    requireProviderLicenseFeature('project_management'),
    (req, res) => {
      const project = (req.providerAuth.provider.projects || []).find(
        (item) => item.id === req.params.projectId
      );
      if (!project) {
        res.status(404).json({ message: 'Projeto nao encontrado.' });
        return;
      }

      res.json({
        project: {
          id: project.id,
          name: project.name,
          description: project.description,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
          network: project.network,
        },
      });
    }
  );

  router.put(
    '/projects/:projectId',
    requireProviderAuth,
    requireProviderPermission(PERMISSIONS.NETWORK_UPDATE),
    requireProviderLicenseFeature('project_management'),
    async (req, res) => {
      const provider = req.providerAuth.provider;
      const projectId = req.params.projectId;
      const incomingNetwork = req.body?.network;
      const incomingName = req.body?.name ? String(req.body.name).trim() : undefined;
      const incomingDescription =
        req.body?.description !== undefined ? String(req.body.description).trim() : undefined;

      const currentProject = (provider.projects || []).find((item) => item.id === projectId);
      if (!currentProject) {
        res.status(404).json({ message: 'Projeto nao encontrado.' });
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
        updatedBy: req.providerAuth.user.id,
      };

      await mutateDb((current) => {
        const targetProvider = findProviderById(current, provider.id);
        if (!targetProvider) return current;
        targetProvider.projects = targetProvider.projects.map((item) =>
          item.id === projectId ? updatedProject : item
        );
        targetProvider.updatedAt = nowIso();
        appendProviderAuditLog(targetProvider, {
          actorUserId: req.providerAuth.user.id,
          actorUsername: req.providerAuth.user.username,
          action: 'projects.update',
          targetType: 'project',
          targetId: projectId,
          details: `Projeto ${updatedProject.name} atualizado.`,
        });
        return current;
      });

      res.json({ project: buildProjectSummary(updatedProject) });
    }
  );

  router.delete(
    '/projects/:projectId',
    requireProviderAuth,
    requireProviderPermission(PERMISSIONS.NETWORK_DELETE),
    requireProviderLicenseFeature('project_management'),
    async (req, res) => {
      const provider = req.providerAuth.provider;
      const projectId = req.params.projectId;
      const project = (provider.projects || []).find((item) => item.id === projectId);
      if (!project) {
        res.status(404).json({ message: 'Projeto nao encontrado.' });
        return;
      }

      await mutateDb((current) => {
        const targetProvider = findProviderById(current, provider.id);
        if (!targetProvider) return current;
        targetProvider.projects = targetProvider.projects.filter(
          (item) => item.id !== projectId
        );
        targetProvider.updatedAt = nowIso();
        appendProviderAuditLog(targetProvider, {
          actorUserId: req.providerAuth.user.id,
          actorUsername: req.providerAuth.user.username,
          action: 'projects.delete',
          targetType: 'project',
          targetId: projectId,
          details: `Projeto ${project.name} excluido.`,
        });
        return current;
      });

      res.status(204).send();
    }
  );

  return router;
};
