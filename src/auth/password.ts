import crypto from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(crypto.scrypt);

const SCRYPT_N = 16384;
const SCRYPT_KEYLEN = 64;

/** Same format as grid-core: scrypt$N$salt$hash (hex). */
export async function hashPassword(plain: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = (await scryptAsync(plain, salt, SCRYPT_KEYLEN)) as Buffer;
  return `scrypt$${SCRYPT_N}$${salt}$${derived.toString('hex')}`;
}
