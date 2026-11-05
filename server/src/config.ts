/**
 * Runtime configuration. In production every secret MUST come from the
 * environment (or a secret manager that injects env vars); the server refuses
 * to start with development defaults so a misconfigured deploy fails closed.
 */
import { randomBytes } from 'node:crypto';

const env = process.env;
export const NODE_ENV = env.NODE_ENV ?? 'development';
export const isProd = NODE_ENV === 'production';
export const isTest = NODE_ENV === 'test';

function secret(name: string, bytes = 32): Buffer {
  const v = env[name];
  if (v) {
    const b = Buffer.from(v, 'base64');
    if (b.length < bytes) throw new Error(`${name} must be at least ${bytes} bytes (base64)`);
    return b;
  }
  if (isProd) throw new Error(`Missing required secret ${name}. Run "npm run keys" to generate one.`);
  // dev/test: ephemeral random keys — data encrypted with them won't survive a restart unless DB is in-memory
  return randomBytes(bytes);
}

export const config = {
  port: Number(env.PORT ?? 8787),
  host: env.HOST ?? '0.0.0.0',
  dbPath: env.DB_PATH ?? (isTest ? ':memory:' : './data/lastminute.db'),

  /** HMAC key for access tokens (HS256) */
  jwtSecret: secret('JWT_SECRET'),
  /** AES-256-GCM key for personal data at rest. Rotate by adding DATA_KEY_PREV. */
  dataKey: secret('DATA_KEY'),
  dataKeyPrev: env.DATA_KEY_PREV ? Buffer.from(env.DATA_KEY_PREV, 'base64') : undefined,
  /** HMAC key for searchable "blind index" of phone numbers */
  indexKey: secret('INDEX_KEY'),
  /** Key for the tamper-evident audit chain */
  auditKey: secret('AUDIT_KEY'),

  accessTtlSec: 15 * 60,
  refreshTtlSec: 30 * 24 * 60 * 60,
  adminAccessTtlSec: 10 * 60,
  adminIdleTimeoutSec: 30 * 60,

  otpTtlSec: 5 * 60,
  otpMaxAttempts: 3,
  pinMaxAttempts: 5,
  pinLockMinutes: 15,
  adminMaxAttempts: 5,
  adminLockMinutes: 30,

  /** Allowed browser origins for the admin console / web app. */
  corsOrigins: (env.CORS_ORIGINS ?? (isProd ? '' : 'http://localhost:8081,http://localhost:8787')).split(',').filter(Boolean),
  /** Optional comma-separated IP allowlist for /admin APIs (e.g. office VPN). */
  adminIpAllowlist: (env.ADMIN_IP_ALLOWLIST ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  trustProxy: env.TRUST_PROXY === '1',

  /** SMS sender: "console" logs OTPs (dev only). Plug a DLT-registered provider for production. */
  smsProvider: env.SMS_PROVIDER ?? (isProd ? 'unset' : 'console'),

  /** Current privacy notice version the user must accept (bump when the notice changes). */
  noticeVersion: '2026-11-01',

  retention: {
    /** completed order records are kept (pseudonymised after erasure) for tax law */
    ordersYears: 8,
    auditYears: 3,
    inactiveAccountYears: 3,
  },

  grievanceOfficer: {
    name: env.GRIEVANCE_NAME ?? 'Grievance Officer, LastMinute',
    email: env.GRIEVANCE_EMAIL ?? 'grievance@lastminute.example',
    phone: env.GRIEVANCE_PHONE ?? '+91-1800-000-0000',
  },
};

if (isProd && config.smsProvider === 'console') {
  throw new Error('SMS_PROVIDER=console is not allowed in production');
}
if (isProd && config.corsOrigins.length === 0) {
  throw new Error('Set CORS_ORIGINS to the admin console origin in production');
}
