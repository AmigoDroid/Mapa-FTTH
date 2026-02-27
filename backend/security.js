import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';

const SCRYPT_KEYLEN = 64;

export const hashPassword = (password) => {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `${salt}:${hash}`;
};

export const verifyPassword = (password, storedHash) => {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, currentHash] = storedHash.split(':');
  if (!salt || !currentHash) return false;

  const computed = scryptSync(password, salt, SCRYPT_KEYLEN);
  const stored = Buffer.from(currentHash, 'hex');
  if (stored.length !== computed.length) return false;
  return timingSafeEqual(stored, computed);
};

export const signAccessToken = (payload, secret, expiresIn = '8h') =>
  jwt.sign(payload, secret, { expiresIn });

export const verifyAccessToken = (token, secret) => jwt.verify(token, secret);
