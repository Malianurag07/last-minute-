import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ZodError } from 'zod';

import { config, isProd, isTest } from './config.ts';
import { hmac } from './crypto.ts';
import { one, openDb, type DB } from './db.ts';
import { adminRoutes } from './routes/admin.ts';
import { authRoutes } from './routes/auth.ts';
import { catalogRoutes } from './routes/catalog.ts';
import { meRoutes } from './routes/me.ts';
import { orderRoutes } from './routes/orders.ts';
import { shopRoutes } from './routes/shop.ts';
import { isFamilyActive, touchFamily, verifyAccess, type AccessClaims } from './tokens.ts';

declare module 'fastify' {
  interface FastifyInstance {
    db: DB;
  }
  interface FastifyRequest {
    user?: AccessClaims;
    admin?: AccessClaims & { role: AdminRole };
    ipHash: string;
  }
}

export type AdminRole = 'super_admin' | 'ops' | 'support' | 'auditor';

/** Least-privilege permission map for admin roles. */
export const PERMISSIONS: Record<AdminRole, string[]> = {
  super_admin: ['*'],
  ops: ['dashboard', 'providers.view', 'providers.verify', 'providers.suspend', 'orders.view', 'orders.cancel', 'users.view', 'users.block', 'reviews.view', 'reviews.moderate', 'privacy.view', 'privacy.handle', 'incidents.view'],
  support: ['dashboard', 'providers.view', 'orders.view', 'users.view', 'reviews.view', 'privacy.view', 'privacy.handle'],
  auditor: ['dashboard', 'audit.view', 'incidents.view', 'privacy.view'],
};
export const can = (role: AdminRole, perm: string) => PERMISSIONS[role]?.includes('*') || PERMISSIONS[role]?.includes(perm);

export class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const bearer = (req: FastifyRequest) => {
  const h = req.headers.authorization;
  return h?.startsWith('Bearer ') ? h.slice(7) : null;
};

export async function requireUser(req: FastifyRequest) {
  const token = bearer(req);
  const claims = token ? await verifyAccess(token, 'user') : null;
  if (!claims) throw new HttpError(401, 'unauthenticated', 'Please log in again.');
  const db = req.server.db;
  const u = one<{ status: string; token_version: number }>(db, 'SELECT status, token_version FROM users WHERE id = ?', claims.sub);
  // token version + live session check makes logout/block take effect immediately
  if (!u || u.status !== 'active' || u.token_version !== claims.tv || !isFamilyActive(db, claims.sid)) {
    throw new HttpError(401, 'unauthenticated', 'Please log in again.');
  }
  req.user = claims;
}

export function requireAdmin(perm: string, opts: { allowPasswordChange?: boolean } = {}) {
  return async (req: FastifyRequest) => {
    if (config.adminIpAllowlist.length && !config.adminIpAllowlist.includes(req.ip)) {
      throw new HttpError(403, 'forbidden', 'Not allowed from this network.');
    }
    const token = bearer(req);
    const claims = token ? await verifyAccess(token, 'admin') : null;
    if (!claims) throw new HttpError(401, 'unauthenticated', 'Session expired.');
    const db = req.server.db;
    const a = one<{ role: AdminRole; disabled: number; token_version: number; must_change_password: number }>(
      db,
      'SELECT role, disabled, token_version, must_change_password FROM admins WHERE id = ?',
      claims.sub,
    );
    if (!a || a.disabled || a.token_version !== claims.tv || !isFamilyActive(db, claims.sid)) {
      throw new HttpError(401, 'unauthenticated', 'Session expired.');
    }
    if (a.must_change_password && !opts.allowPasswordChange) throw new HttpError(403, 'password_change_required', 'Change your password first.');
    if (!can(a.role, perm)) throw new HttpError(403, 'forbidden', 'Your role does not allow this.');
    touchFamily(db, claims.sid);
    req.admin = { ...claims, role: a.role };
  };
}

export function buildApp(opts: { db?: DB; logger?: boolean } = {}) {
  const app = Fastify({
    logger:
      opts.logger ?? !isTest
        ? {
            level: isProd ? 'info' : 'debug',
            // never write secrets or personal data to logs
            redact: {
              paths: ['req.headers.authorization', 'req.headers.cookie', 'req.body.pin', 'req.body.newPin', 'req.body.otp', 'req.body.password', 'req.body.current', 'req.body.next', 'req.body.phone', 'req.body.refreshToken'],
              remove: true,
            },
          }
        : false,
    trustProxy: config.trustProxy,
    bodyLimit: 32 * 1024,
    genReqId: () => crypto.randomUUID(),
  });

  app.decorate('db', opts.db ?? openDb());
  app.decorateRequest('ipHash', '');
  app.addHook('onRequest', async (req) => {
    req.ipHash = hmac(config.indexKey, `ip:${req.ip}`).slice(0, 16);
  });

  app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: isProd ? [] : null,
      },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'no-referrer' },
    strictTransportSecurity: isProd ? { maxAge: 63072000, includeSubDomains: true, preload: true } : false,
  });
  app.addHook('onSend', async (_req, reply) => {
    reply.header('Cache-Control', 'no-store');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  });

  app.register(cors, {
    origin: (origin, cb) => cb(null, !origin || config.corsOrigins.includes(origin)),
    credentials: false,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  });

  app.register(rateLimit, { global: true, max: 300, timeWindow: '1 minute', keyGenerator: (r) => r.ip });

  app.setErrorHandler((err, req, reply: FastifyReply) => {
    if (err instanceof ZodError) {
      return reply.status(400).send({ error: 'invalid_input', message: 'Some details are missing or not valid.', fields: err.issues.map((i) => i.path.join('.')) });
    }
    if (err instanceof HttpError) return reply.status(err.status).send({ error: err.code, message: err.message });
    const e = err as { statusCode?: number; message?: string };
    if (e.statusCode === 429) return reply.status(429).send({ error: 'rate_limited', message: 'Too many tries. Please wait a little and try again.' });
    if (e.statusCode && e.statusCode < 500) return reply.status(e.statusCode).send({ error: 'bad_request', message: 'Request not valid.' });
    req.log.error(err);
    return reply.status(500).send({ error: 'server_error', message: 'Something went wrong. Please try again.' }); // no stack traces to clients
  });

  app.get('/health', async () => ({ ok: true }));

  app.register(authRoutes, { prefix: '/v1/auth' });
  app.register(meRoutes, { prefix: '/v1' });
  app.register(catalogRoutes, { prefix: '/v1' });
  app.register(shopRoutes, { prefix: '/v1' });
  app.register(orderRoutes, { prefix: '/v1' });
  app.register(adminRoutes, { prefix: '/v1/admin' });

  // Super admin console (built static site)
  const consoleDir = join(import.meta.dirname, '..', '..', 'admin-web', 'dist');
  if (existsSync(consoleDir)) {
    app.register(fastifyStatic, { root: consoleDir, prefix: '/console/', index: 'index.html' });
    app.get('/console', (_req, reply) => reply.redirect('/console/'));
  }

  return app;
}
