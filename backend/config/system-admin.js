const DEFAULT_PASSWORD_HASH =
  '18406cb92257a7d42c558d0aed6c3d67:0f2f0f4b37e00fe5ab52a8c4b4bf85be43166f045ea988ec257edac4b6bc6fe982da3bd264ae2fe1ff7ac5ac07fa1bc670516e5b048e4d19774b6163d9170b3e';

const rawPasswordHash = String(process.env.SYSTEM_ADMIN_PASSWORD_HASH || '').trim();
const rawPassword = String(process.env.SYSTEM_ADMIN_PASSWORD || '').trim();
const hashLooksValid = rawPasswordHash.includes(':');

export const SYSTEM_ADMIN_ACCOUNT = {
  id: 'sys-root-admin',
  username: process.env.SYSTEM_ADMIN_USERNAME || 'masteradmin',
  displayName: process.env.SYSTEM_ADMIN_DISPLAY_NAME || 'Administrador Global',
  passwordHash: hashLooksValid ? rawPasswordHash : DEFAULT_PASSWORD_HASH,
  passwordPlain: rawPassword || (rawPasswordHash && !hashLooksValid ? rawPasswordHash : ''),
};
