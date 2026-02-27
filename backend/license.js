export const LICENSE_STATUS = ['active', 'suspended', 'expired'];

export const computeLicenseState = (license) => {
  const now = Date.now();
  const expiresAtMs = Date.parse(license.expiresAt);
  const hasValidExpiration = Number.isFinite(expiresAtMs);
  const isExpiredByDate = hasValidExpiration ? expiresAtMs <= now : false;
  const isExpiredByStatus = license.status === 'expired';
  const isSuspended = license.status === 'suspended';

  const isActive = !isExpiredByDate && !isExpiredByStatus && !isSuspended && license.status === 'active';

  return {
    isActive,
    isSuspended,
    isExpired: isExpiredByDate || isExpiredByStatus,
    expiresInMs: hasValidExpiration ? Math.max(0, expiresAtMs - now) : null,
    reason: isSuspended
      ? 'Licenca suspensa.'
      : isExpiredByDate || isExpiredByStatus
        ? 'Licenca expirada.'
        : isActive
          ? null
          : 'Licenca inativa.',
  };
};

export const countActiveUsers = (users) => users.filter((user) => user.active).length;

export const serializeLicense = (license, users) => {
  const seatsUsed = countActiveUsers(users || []);
  const state = computeLicenseState(license);
  return {
    ...license,
    seatsUsed,
    seatsAvailable: Math.max(0, license.maxUsers - seatsUsed),
    state,
  };
};
