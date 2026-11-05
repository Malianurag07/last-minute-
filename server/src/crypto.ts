import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  scrypt as scryptCb,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';

import { config } from './config.ts';

const scrypt = promisify(scryptCb) as (pw: string | Buffer, salt: Buffer, len: number, opts: object) => Promise<Buffer>;

/* ---------------------------------------------------------------- hashing */

// N=2^15, r=8, p=1 ≈ 32 MiB memory per hash — OWASP-recommended scrypt floor.
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/** Memory-hard password/PIN hash. Format: scrypt$N$r$p$salt$hash */
export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16);
  const h = await scrypt(secret.normalize('NFKC'), salt, 32, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), h.toString('base64')].join('$');
}

export async function verifySecret(secret: string, stored: string): Promise<boolean> {
  const [alg, N, r, p, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const got = await scrypt(secret.normalize('NFKC'), Buffer.from(salt, 'base64'), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    maxmem: 64 * 1024 * 1024,
  });
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/** A hash that is safe to burn on unknown users so login timing doesn't reveal which numbers exist. */
let dummyHash: string | null = null;
export async function burnHash(secret: string) {
  dummyHash ??= await hashSecret('dummy-secret-for-timing');
  await verifySecret(secret, dummyHash);
}

export const sha256 = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
export const hmac = (key: Buffer, s: string) => createHmac('sha256', key).update(s).digest('hex');

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const randomOtp = () => String(randomInt(0, 1_000_000)).padStart(6, '0');

export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/* ------------------------------------------------- personal data at rest */

/**
 * AES-256-GCM with a random 96-bit IV. Output: v1:<iv>:<tag>:<ciphertext> (base64).
 * `aad` binds the ciphertext to its row/column so values can't be swapped between users.
 */
export function encrypt(plain: string | null | undefined, aad: string): string | null {
  if (plain == null || plain === '') return null;
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', config.dataKey, iv);
  c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return `v1:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${ct.toString('base64')}`;
}

export function decrypt(blob: string | null | undefined, aad: string): string {
  if (!blob) return '';
  const [v, iv, tag, ct] = blob.split(':');
  if (v !== 'v1') throw new Error('Unknown ciphertext version');
  for (const key of [config.dataKey, config.dataKeyPrev].filter(Boolean) as Buffer[]) {
    try {
      const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
      d.setAAD(Buffer.from(aad));
      d.setAuthTag(Buffer.from(tag, 'base64'));
      return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8');
    } catch {
      // try previous key (rotation window)
    }
  }
  throw new Error('Decryption failed (tampered data or wrong key)');
}

/** Deterministic keyed index so we can look users up by phone without storing it in clear. */
export const phoneIndex = (phone10: string) => hmac(config.indexKey, `phone:${phone10}`);

/* ------------------------------------------------------------------ TOTP */

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string) {
  const clean = s.replace(/=+$/, '').toUpperCase().replace(/\s/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error('Invalid base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const newTotpSecret = () => base32Encode(randomBytes(20));

/** RFC 6238 TOTP (SHA-1, 30 s, 6 digits) — compatible with Google Authenticator, Authy, Microsoft Authenticator. */
export function totp(secretB32: string, at = Date.now(), step = 30) {
  const counter = Math.floor(at / 1000 / step);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', base32Decode(secretB32)).update(msg).digest();
  const off = h[h.length - 1] & 0xf;
  const code = ((h.readUInt32BE(off) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
  return { code, counter };
}

/** Accepts ±1 step of clock drift. Returns the matched counter so callers can block replay. */
export function verifyTotp(secretB32: string, code: string, at = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  for (const drift of [-1, 0, 1]) {
    const t = totp(secretB32, at + drift * 30_000);
    if (safeEqual(t.code, code)) return t.counter;
  }
  return null;
}
