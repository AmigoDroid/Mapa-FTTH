const rawUsername = String(process.env.SYSTEM_ADMIN_USERNAME || '').trim();
const rawDisplayName = String(process.env.SYSTEM_ADMIN_DISPLAY_NAME || '').trim();
const rawPasswordHash = String(process.env.SYSTEM_ADMIN_PASSWORD_HASH || '').trim();
const rawPassword = String(process.env.SYSTEM_ADMIN_PASSWORD || '').trim();
const hashLooksValid = rawPasswordHash.includes(':');

if (!rawUsername) {
  throw new Error('SYSTEM_ADMIN_USERNAME nao definido. Configure no arquivo .env.');
}

if (rawPasswordHash && !hashLooksValid) {
  throw new Error(
    'SYSTEM_ADMIN_PASSWORD_HASH invalido. Use o formato salt:hash ou deixe vazio no .env.'
  );
}

if (!rawPassword && !hashLooksValid) {
  throw new Error(
    'Defina SYSTEM_ADMIN_PASSWORD ou SYSTEM_ADMIN_PASSWORD_HASH no arquivo .env.'
  );
}

export const SYSTEM_ADMIN_ACCOUNT = {
  id: 'sys-root-admin',
  username: rawUsername,
  displayName: rawDisplayName || 'Administrador Global',
  passwordHash: hashLooksValid ? rawPasswordHash : '',
  passwordPlain: rawPassword,
};
