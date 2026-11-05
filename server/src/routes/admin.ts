import type { FastifyInstance, FastifyReply } from 'fastify';
import { jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';

import { can, HttpError, PERMISSIONS, requireAdmin, type AdminRole } from '../app.ts';
import { audit, verifyAuditChain } from '../audit.ts';
import { config, isProd } from '../config.ts';
import { burnHash, decrypt, encrypt, hashSecret, newTotpSecret, verifySecret, verifyTotp } from '../crypto.ts';
import { all, one, run, tx } from '../db.ts';
import { ACTIVE_STATUSES, maskPhone, passwordProblem } from '../domain.ts';
import { newId } from '../ids.ts';
import { newRefresh, revokeAll, revokeFamily, rotateRefresh, signAccess } from '../tokens.ts';
import { addEvent, recomputeRating } from './orders.ts';

interface AdminRow {
  id: string; username: string; pass_hash: string; role: AdminRole; totp_secret_enc: string | null; totp_enabled: number;
  totp_last_counter: number; fail_count: number; locked_until: number | null; disabled: number; must_change_password: number; token_version: number;
}

const reason = z.string().trim().min(5).max(300);

/**
 * The console keeps the admin refresh token in an HttpOnly, SameSite=Strict
 * cookie scoped to /v1/admin, so page scripts can never read it.
 */
const RT_COOKIE = 'lm_admin_rt';
const cookieOpts = { httpOnly: true, secure: isProd, sameSite: 'strict' as const, path: '/v1/admin', maxAge: config.refreshTtlSec };
const LOGIN_LIMIT = { config: { rateLimit: { max: 5, timeWindow: '5 minutes' } } };

/** Short-lived token proving step 1 (password) passed; only usable for step 2 (TOTP). */
const signChallenge = (adminId: string) =>
  new SignJWT({ step: 'mfa' }).setProtectedHeader({ alg: 'HS256' }).setSubject(adminId).setAudience('admin-mfa').setIssuer('lastminute-api').setExpirationTime('5m').sign(config.jwtSecret);
async function readChallenge(token: string) {
  try {
    const { payload } = await jwtVerify(token, config.jwtSecret, { audience: 'admin-mfa', issuer: 'lastminute-api', algorithms: ['HS256'] });
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

export async function adminRoutes(app: FastifyInstance) {
  const db = app.db;
  const getAdmin = (id: string) => one<AdminRow>(db, 'SELECT * FROM admins WHERE id = ?', id);
  const log = (req: { admin?: { sub: string }; ipHash: string }, action: string, target?: string, detail?: Record<string, unknown>) =>
    audit(db, { actorType: 'admin', actorId: req.admin?.sub ?? 'unknown', action, target, detail, ipHash: req.ipHash });

  async function issue(a: AdminRow, reply: FastifyReply) {
    const { token: refreshToken, familyId } = newRefresh(db, 'admin', a.id);
    reply.setCookie(RT_COOKIE, refreshToken, cookieOpts);
    const accessToken = await signAccess({ sub: a.id, realm: 'admin', tv: a.token_version, role: a.role, sid: familyId });
    return { accessToken, refreshToken, expiresIn: config.adminAccessTtlSec, mustChangePassword: !!a.must_change_password, role: a.role, username: a.username };
  }

  function lockCheck(a: AdminRow) {
    if (a.disabled) throw new HttpError(403, 'disabled', 'This admin account is disabled.');
    if (a.locked_until && a.locked_until > Date.now()) throw new HttpError(423, 'locked', 'Account locked after failed attempts. Try later.');
  }
  function fail(a: AdminRow, ipHash: string, what: string) {
    const fails = a.fail_count + 1;
    const lock = fails >= config.adminMaxAttempts ? Date.now() + config.adminLockMinutes * 60_000 : null;
    run(db, 'UPDATE admins SET fail_count = ?, locked_until = ? WHERE id = ?', lock ? 0 : fails, lock, a.id);
    audit(db, { actorType: 'admin', actorId: a.id, action: `admin.${what}_failed`, detail: { locked: !!lock }, ipHash });
  }

  /* ---------------------------------------------------------- login (2 steps) */
  app.post('/login', LOGIN_LIMIT, async (req) => {
    const body = z.object({ username: z.string().trim().toLowerCase().max(40), password: z.string().max(128) }).strict().parse(req.body);
    const a = one<AdminRow>(db, 'SELECT * FROM admins WHERE username = ?', body.username);
    if (!a) {
      await burnHash(body.password);
      throw new HttpError(401, 'bad_credentials', 'Wrong username or password.');
    }
    lockCheck(a);
    if (!(await verifySecret(body.password, a.pass_hash))) {
      fail(a, req.ipHash, 'password');
      throw new HttpError(401, 'bad_credentials', 'Wrong username or password.');
    }
    const challenge = await signChallenge(a.id);
    if (!a.totp_enabled) {
      // first login: enrol an authenticator app before anything else
      const secret = newTotpSecret();
      run(db, 'UPDATE admins SET totp_secret_enc = ? WHERE id = ?', encrypt(secret, `admins.totp:${a.id}`), a.id);
      return { mfa: 'setup', challenge, secret, otpauthUrl: `otpauth://totp/LastMinute:${a.username}?secret=${secret}&issuer=LastMinute&digits=6&period=30` };
    }
    return { mfa: 'totp', challenge };
  });

  app.post('/login/totp', LOGIN_LIMIT, async (req, reply) => {
    const body = z.object({ challenge: z.string().max(1000), code: z.string().regex(/^\d{6}$/) }).strict().parse(req.body);
    const id = await readChallenge(body.challenge);
    const a = id ? getAdmin(id) : undefined;
    if (!a || !a.totp_secret_enc) throw new HttpError(401, 'bad_challenge', 'Please start again.');
    lockCheck(a);
    const counter = verifyTotp(decrypt(a.totp_secret_enc, `admins.totp:${a.id}`), body.code);
    // a code can be used once only (blocks replay of an observed code)
    if (counter === null || counter <= a.totp_last_counter) {
      fail(a, req.ipHash, 'totp');
      throw new HttpError(401, 'bad_code', 'Wrong or already-used code.');
    }
    run(db, 'UPDATE admins SET totp_enabled = 1, totp_last_counter = ?, fail_count = 0, locked_until = NULL, last_login_at = ? WHERE id = ?', counter, Date.now(), a.id);
    audit(db, { actorType: 'admin', actorId: a.id, action: a.totp_enabled ? 'admin.login' : 'admin.mfa_enrolled', ipHash: req.ipHash });
    return issue(getAdmin(a.id)!, reply);
  });

  app.post('/refresh', { config: { rateLimit: { max: 30, timeWindow: '5 minutes' } } }, async (req, reply) => {
    const body = z.object({ refreshToken: z.string().min(20).max(200).optional() }).strict().parse(req.body ?? {});
    const refreshToken = body.refreshToken ?? req.cookies[RT_COOKIE];
    if (!refreshToken) throw new HttpError(401, 'unauthenticated', 'Session expired.');
    const r = rotateRefresh(db, refreshToken, 'admin');
    if (typeof r === 'string') {
      reply.clearCookie(RT_COOKIE, { path: '/v1/admin' });
      throw new HttpError(401, 'unauthenticated', r === 'idle' ? 'Signed out after 30 minutes of inactivity.' : 'Session expired.');
    }
    reply.setCookie(RT_COOKIE, r.token, cookieOpts);
    const a = getAdmin(r.subjectId);
    if (!a || a.disabled) throw new HttpError(401, 'unauthenticated', 'Session expired.');
    const accessToken = await signAccess({ sub: a.id, realm: 'admin', tv: a.token_version, role: a.role, sid: r.familyId });
    return { accessToken, refreshToken: r.token, expiresIn: config.adminAccessTtlSec, mustChangePassword: !!a.must_change_password, role: a.role, username: a.username };
  });

  app.post('/logout', { preHandler: requireAdmin('dashboard', { allowPasswordChange: true }) }, async (req, reply) => {
    revokeFamily(db, req.admin!.sid);
    reply.clearCookie(RT_COOKIE, { path: '/v1/admin' });
    log(req, 'admin.logout');
    return { ok: true };
  });

  app.get('/me', { preHandler: requireAdmin('dashboard', { allowPasswordChange: true }) }, async (req) => {
    const a = getAdmin(req.admin!.sub)!;
    return { id: a.id, username: a.username, role: a.role, permissions: PERMISSIONS[a.role], mustChangePassword: !!a.must_change_password };
  });

  app.post('/password', { preHandler: requireAdmin('dashboard', { allowPasswordChange: true }), ...LOGIN_LIMIT }, async (req, reply) => {
    const body = z.object({ current: z.string().max(128), next: z.string().max(128) }).strict().parse(req.body);
    const a = getAdmin(req.admin!.sub)!;
    if (!(await verifySecret(body.current, a.pass_hash))) throw new HttpError(401, 'bad_credentials', 'Current password is wrong.');
    const problem = passwordProblem(body.next, a.username);
    if (problem) throw new HttpError(400, 'weak_password', problem);
    if (await verifySecret(body.next, a.pass_hash)) throw new HttpError(400, 'weak_password', 'Choose a different password from the current one.');
    const h = await hashSecret(body.next);
    tx(db, () => {
      run(db, 'UPDATE admins SET pass_hash = ?, must_change_password = 0 WHERE id = ?', h, a.id);
      revokeAll(db, 'admin', a.id); // sign out other sessions
      log(req, 'admin.password_changed');
    });
    return issue(getAdmin(a.id)!, reply);
  });

  /* ------------------------------------------------------------ dashboard */
  app.get('/overview', { preHandler: requireAdmin('dashboard') }, async () => {
    const n = (sql: string, ...p: (string | number)[]) => one<{ n: number }>(db, sql, ...p)!.n;
    const marks = ACTIVE_STATUSES.map(() => '?').join(',');
    const now = Date.now();
    const dayStart = new Date().setHours(0, 0, 0, 0);
    const completed = one<{ gmv: number | null; rev: number | null }>(db, "SELECT SUM(price + rush_fee) gmv, SUM(commission + platform_fee) rev FROM orders WHERE status = 'delivered'")!;
    return {
      users: n("SELECT COUNT(*) n FROM users WHERE status != 'erased'"),
      blockedUsers: n("SELECT COUNT(*) n FROM users WHERE status = 'blocked'"),
      providers: n('SELECT COUNT(*) n FROM providers'),
      providersToVerify: n('SELECT COUNT(*) n FROM providers WHERE verified = 0 AND suspended = 0'),
      suspendedProviders: n('SELECT COUNT(*) n FROM providers WHERE suspended = 1'),
      orders: n('SELECT COUNT(*) n FROM orders'),
      ordersToday: n('SELECT COUNT(*) n FROM orders WHERE created_at >= ?', dayStart),
      activeOrders: n(`SELECT COUNT(*) n FROM orders WHERE status IN (${marks})`, ...ACTIVE_STATUSES),
      lateOrders: n(`SELECT COUNT(*) n FROM orders WHERE status IN (${marks}) AND need_by < ?`, ...ACTIVE_STATUSES, now),
      waitingReply: n("SELECT COUNT(*) n FROM orders WHERE status = 'requested'"),
      completedGmv: completed.gmv ?? 0,
      platformRevenue: completed.rev ?? 0,
      openPrivacyRequests: n("SELECT COUNT(*) n FROM privacy_requests WHERE status IN ('open','in_progress')"),
      overduePrivacyRequests: n("SELECT COUNT(*) n FROM privacy_requests WHERE status IN ('open','in_progress') AND due_at < ?", now),
      openIncidents: n("SELECT COUNT(*) n FROM incidents WHERE status != 'closed'"),
      ordersByStatus: all(db, 'SELECT status, COUNT(*) n FROM orders GROUP BY status'),
      providersByCategory: all(db, 'SELECT category_id AS category, COUNT(*) n FROM providers GROUP BY category_id'),
    };
  });

  /* ------------------------------------------------------------ providers */
  app.get('/providers', { preHandler: requireAdmin('providers.view') }, async (req) => {
    const { filter } = z.object({ filter: z.enum(['all', 'pending', 'suspended']).default('all') }).parse(req.query);
    const where = filter === 'pending' ? 'WHERE verified = 0 AND suspended = 0' : filter === 'suspended' ? 'WHERE suspended = 1' : '';
    return all<{ id: string; phone_enc: string | null }>(db, `SELECT id, name, category_id AS categoryId, area, verified, suspended, available, rating, review_count AS reviewCount, jobs_done AS jobsDone, created_at AS createdAt, phone_enc FROM providers ${where} ORDER BY created_at DESC LIMIT 500`).map(
      ({ phone_enc, ...p }) => ({ ...p, phone: phone_enc ? maskPhone(decrypt(phone_enc, `providers.phone:${p.id}`)) : '' }),
    );
  });

  app.post('/providers/:id', { preHandler: requireAdmin('providers.view') }, async (req) => {
    const { id } = z.object({ id: z.string().max(64) }).parse(req.params);
    const body = z.object({ verified: z.boolean().optional(), suspended: z.boolean().optional(), reason }).strict().parse(req.body);
    const role = req.admin!.role;
    if (body.verified !== undefined && !can(role, 'providers.verify')) throw new HttpError(403, 'forbidden', 'Your role does not allow this.');
    if (body.suspended !== undefined && !can(role, 'providers.suspend')) throw new HttpError(403, 'forbidden', 'Your role does not allow this.');
    if (!one(db, 'SELECT 1 FROM providers WHERE id = ?', id)) throw new HttpError(404, 'not_found', 'Provider not found.');
    if (body.verified !== undefined) run(db, 'UPDATE providers SET verified = ? WHERE id = ?', body.verified ? 1 : 0, id);
    if (body.suspended !== undefined) run(db, `UPDATE providers SET suspended = ?${body.suspended ? ', available = 0' : ''} WHERE id = ?`, body.suspended ? 1 : 0, id);
    log(req, 'admin.provider_updated', id, { verified: body.verified, suspended: body.suspended, reason: body.reason });
    return { ok: true };
  });

  /* --------------------------------------------------------------- orders */
  app.get('/orders', { preHandler: requireAdmin('orders.view') }, async (req) => {
    const { filter } = z.object({ filter: z.enum(['active', 'late', 'closed', 'all']).default('active') }).parse(req.query);
    const marks = ACTIVE_STATUSES.map(() => '?').join(',');
    const where =
      filter === 'active' ? [`WHERE o.status IN (${marks})`, ACTIVE_STATUSES]
      : filter === 'late' ? [`WHERE o.status IN (${marks}) AND o.need_by < ?`, [...ACTIVE_STATUSES, Date.now()]]
      : filter === 'closed' ? [`WHERE o.status NOT IN (${marks})`, ACTIVE_STATUSES]
      : ['', []];
    return all(db, `SELECT o.id, o.service_name AS serviceName, o.status, o.price, o.rush_fee AS rushFee, o.delivery_fee AS deliveryFee, o.platform_fee AS platformFee, o.commission, o.need_by AS needBy, o.created_at AS createdAt, o.handover, p.name AS providerName FROM orders o JOIN providers p ON p.id = o.provider_id ${where[0]} ORDER BY o.created_at DESC LIMIT 500`, ...(where[1] as (string | number)[]));
  });

  app.post('/orders/:id/cancel', { preHandler: requireAdmin('orders.cancel') }, async (req) => {
    const { id } = z.object({ id: z.string().max(64) }).parse(req.params);
    const body = z.object({ reason }).strict().parse(req.body);
    const o = one<{ status: string }>(db, 'SELECT status FROM orders WHERE id = ?', id);
    if (!o) throw new HttpError(404, 'not_found', 'Order not found.');
    if (!ACTIVE_STATUSES.includes(o.status as never)) throw new HttpError(409, 'bad_transition', 'Only active orders can be cancelled.');
    tx(db, () => {
      run(db, "UPDATE orders SET status = 'cancelled', updated_at = ? WHERE id = ?", Date.now(), id);
      addEvent(db, id, 'cancelled', 'admin', req.admin!.sub);
      log(req, 'admin.order_cancelled', id, { reason: body.reason });
    });
    return { ok: true };
  });

  /* ---------------------------------------------------------------- users */
  app.get('/users', { preHandler: requireAdmin('users.view') }, async () =>
    all<{ id: string; phone_enc: string | null; name_enc: string | null; status: string; created_at: number; last_login_at: number | null }>(db, 'SELECT id, phone_enc, name_enc, status, created_at, last_login_at FROM users ORDER BY created_at DESC LIMIT 1000').map((u) => ({
      id: u.id,
      name: u.name_enc ? decrypt(u.name_enc, `users.name:${u.id}`) : '(erased)',
      phone: u.phone_enc ? maskPhone(decrypt(u.phone_enc, `users.phone:${u.id}`)) : '',
      status: u.status,
      createdAt: u.created_at,
      lastLoginAt: u.last_login_at,
      orders: one<{ n: number }>(db, 'SELECT COUNT(*) n FROM orders WHERE customer_id = ?', u.id)!.n,
      shop: one<{ name: string }>(db, 'SELECT name FROM providers WHERE owner_user_id = ?', u.id)?.name ?? null,
    })),
  );

  /** Full contact details: super admin only, reason required, always logged. */
  app.post('/users/:id/reveal', { preHandler: requireAdmin('pii.view') }, async (req) => {
    const { id } = z.object({ id: z.string().max(64) }).parse(req.params);
    const body = z.object({ reason }).strict().parse(req.body);
    const u = one<{ phone_enc: string | null; address_enc: string | null }>(db, 'SELECT phone_enc, address_enc FROM users WHERE id = ?', id);
    if (!u) throw new HttpError(404, 'not_found', 'User not found.');
    log(req, 'admin.pii_viewed', id, { reason: body.reason });
    return { phone: decrypt(u.phone_enc, `users.phone:${id}`), address: decrypt(u.address_enc, `users.address:${id}`) };
  });

  app.post('/users/:id/block', { preHandler: requireAdmin('users.block') }, async (req) => {
    const { id } = z.object({ id: z.string().max(64) }).parse(req.params);
    const body = z.object({ blocked: z.boolean(), reason }).strict().parse(req.body);
    const u = one<{ status: string }>(db, 'SELECT status FROM users WHERE id = ?', id);
    if (!u || u.status === 'erased') throw new HttpError(404, 'not_found', 'User not found.');
    tx(db, () => {
      run(db, 'UPDATE users SET status = ? WHERE id = ?', body.blocked ? 'blocked' : 'active', id);
      if (body.blocked) revokeAll(db, 'user', id); // signs them out everywhere at once
      log(req, body.blocked ? 'admin.user_blocked' : 'admin.user_unblocked', id, { reason: body.reason });
    });
    return { ok: true };
  });

  /* -------------------------------------------------------------- reviews */
  app.get('/reviews', { preHandler: requireAdmin('reviews.view') }, async () =>
    all(db, 'SELECT r.id, r.rating, r.text, r.author_display AS author, r.created_at AS createdAt, r.removed_at AS removedAt, r.removed_reason AS removedReason, p.name AS providerName, p.id AS providerId FROM reviews r JOIN providers p ON p.id = r.provider_id ORDER BY r.created_at DESC LIMIT 500'),
  );

  app.post('/reviews/:id/remove', { preHandler: requireAdmin('reviews.moderate') }, async (req) => {
    const { id } = z.object({ id: z.string().max(64) }).parse(req.params);
    const body = z.object({ reason }).strict().parse(req.body);
    const r = one<{ provider_id: string; removed_at: number | null }>(db, 'SELECT provider_id, removed_at FROM reviews WHERE id = ?', id);
    if (!r || r.removed_at) throw new HttpError(404, 'not_found', 'Review not found.');
    tx(db, () => {
      // soft delete: keeps evidence if the provider or customer disputes it
      run(db, 'UPDATE reviews SET removed_at = ?, removed_by = ?, removed_reason = ? WHERE id = ?', Date.now(), req.admin!.sub, body.reason, id);
      recomputeRating(db, r.provider_id);
      log(req, 'admin.review_removed', id, { reason: body.reason });
    });
    return { ok: true };
  });

  /* ------------------------------------------------------ privacy requests */
  app.get('/privacy-requests', { preHandler: requireAdmin('privacy.view') }, async () =>
    all<{ id: string; detail_enc: string | null }>(db, 'SELECT id, user_id AS userId, type, status, detail_enc, created_at AS createdAt, due_at AS dueAt, resolved_at AS resolvedAt, resolution FROM privacy_requests ORDER BY created_at DESC LIMIT 500').map(({ detail_enc, ...r }) => ({
      ...r,
      detail: detail_enc ? JSON.parse(decrypt(detail_enc, `privacy_requests.detail:${r.id}`)) : null,
    })),
  );

  app.post('/privacy-requests/:id', { preHandler: requireAdmin('privacy.handle') }, async (req) => {
    const { id } = z.object({ id: z.string().max(64) }).parse(req.params);
    const body = z.object({ status: z.enum(['in_progress', 'resolved', 'rejected']), resolution: z.string().trim().min(5).max(1000) }).strict().parse(req.body);
    if (!one(db, 'SELECT 1 FROM privacy_requests WHERE id = ?', id)) throw new HttpError(404, 'not_found', 'Request not found.');
    run(db, 'UPDATE privacy_requests SET status = ?, resolution = ?, handled_by = ?, resolved_at = ? WHERE id = ?', body.status, body.resolution, req.admin!.sub, body.status === 'in_progress' ? null : Date.now(), id);
    log(req, 'admin.privacy_request_updated', id, { status: body.status });
    return { ok: true };
  });

  /* ------------------------------------------------- incident (breach) log */
  app.get('/incidents', { preHandler: requireAdmin('incidents.view') }, async () => all(db, 'SELECT * FROM incidents ORDER BY detected_at DESC'));

  app.post('/incidents', { preHandler: requireAdmin('incidents.manage') }, async (req) => {
    const body = z.object({ title: z.string().trim().min(5).max(120), severity: z.enum(['low', 'medium', 'high', 'critical']), personalData: z.boolean(), description: z.string().trim().min(10).max(4000) }).strict().parse(req.body);
    const id = newId('inc');
    run(db, 'INSERT INTO incidents (id, title, severity, personal_data, description, detected_at, created_by) VALUES (?,?,?,?,?,?,?)', id, body.title, body.severity, body.personalData ? 1 : 0, body.description, Date.now(), req.admin!.sub);
    log(req, 'admin.incident_opened', id, { severity: body.severity, personalData: body.personalData });
    return { id, reminder: body.personalData ? 'Personal data breach: inform the Data Protection Board and affected users without delay (DPDP Rules), and CERT-In within 6 hours for reportable cyber incidents.' : undefined };
  });

  app.post('/incidents/:id', { preHandler: requireAdmin('incidents.manage') }, async (req) => {
    const { id } = z.object({ id: z.string().max(64) }).parse(req.params);
    const body = z.object({ status: z.enum(['open', 'contained', 'closed']).optional(), boardNotified: z.boolean().optional(), usersNotified: z.boolean().optional() }).strict().parse(req.body);
    if (!one(db, 'SELECT 1 FROM incidents WHERE id = ?', id)) throw new HttpError(404, 'not_found', 'Incident not found.');
    if (body.status) run(db, 'UPDATE incidents SET status = ? WHERE id = ?', body.status, id);
    if (body.boardNotified) run(db, 'UPDATE incidents SET board_notified_at = COALESCE(board_notified_at, ?) WHERE id = ?', Date.now(), id);
    if (body.usersNotified) run(db, 'UPDATE incidents SET users_notified_at = COALESCE(users_notified_at, ?) WHERE id = ?', Date.now(), id);
    log(req, 'admin.incident_updated', id, body);
    return { ok: true };
  });

  /* ------------------------------------------------------------ audit log */
  app.get('/audit', { preHandler: requireAdmin('audit.view') }, async (req) => {
    const { before, limit } = z.object({ before: z.coerce.number().int().optional(), limit: z.coerce.number().int().min(1).max(200).default(100) }).parse(req.query);
    return all(db, `SELECT seq, at, actor_type AS actorType, actor_id AS actorId, action, target, detail FROM audit_log ${before ? 'WHERE seq < ?' : ''} ORDER BY seq DESC LIMIT ?`, ...(before ? [before, limit] : [limit]));
  });

  app.get('/audit/verify', { preHandler: requireAdmin('audit.view') }, async (req) => {
    const r = verifyAuditChain(db);
    log(req, 'admin.audit_verified', undefined, { ok: r.ok });
    return r;
  });

  /* ----------------------------------------------------- admin accounts */
  app.get('/admins', { preHandler: requireAdmin('admins.manage') }, async () =>
    all(db, 'SELECT id, username, role, totp_enabled AS mfa, disabled, must_change_password AS mustChangePassword, created_at AS createdAt, last_login_at AS lastLoginAt FROM admins ORDER BY created_at'),
  );

  app.post('/admins', { preHandler: requireAdmin('admins.manage') }, async (req) => {
    const body = z.object({ username: z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9._-]{2,30}$/), role: z.enum(['super_admin', 'ops', 'support', 'auditor']), tempPassword: z.string().max(128) }).strict().parse(req.body);
    const problem = passwordProblem(body.tempPassword, body.username);
    if (problem) throw new HttpError(400, 'weak_password', problem);
    if (one(db, 'SELECT 1 FROM admins WHERE username = ?', body.username)) throw new HttpError(409, 'exists', 'Username taken.');
    const id = newId('adm');
    run(db, 'INSERT INTO admins (id, username, pass_hash, role, created_at) VALUES (?,?,?,?,?)', id, body.username, await hashSecret(body.tempPassword), body.role, Date.now());
    log(req, 'admin.admin_created', id, { role: body.role });
    return { id };
  });

  app.post('/admins/:id', { preHandler: requireAdmin('admins.manage') }, async (req) => {
    const { id } = z.object({ id: z.string().max(64) }).parse(req.params);
    const body = z.object({ role: z.enum(['super_admin', 'ops', 'support', 'auditor']).optional(), disabled: z.boolean().optional(), resetMfa: z.boolean().optional(), reason }).strict().parse(req.body);
    if (id === req.admin!.sub && (body.disabled || body.role)) throw new HttpError(400, 'self_change', 'You can’t change your own role or disable yourself.');
    const target = getAdmin(id);
    if (!target) throw new HttpError(404, 'not_found', 'Admin not found.');
    const supers = one<{ n: number }>(db, "SELECT COUNT(*) n FROM admins WHERE role = 'super_admin' AND disabled = 0")!.n;
    if (target.role === 'super_admin' && supers <= 1 && (body.disabled || (body.role && body.role !== 'super_admin'))) {
      throw new HttpError(400, 'last_super_admin', 'There must always be at least one active super admin.');
    }
    tx(db, () => {
      if (body.role) run(db, 'UPDATE admins SET role = ? WHERE id = ?', body.role, id);
      if (body.disabled !== undefined) run(db, 'UPDATE admins SET disabled = ? WHERE id = ?', body.disabled ? 1 : 0, id);
      if (body.resetMfa) run(db, 'UPDATE admins SET totp_enabled = 0, totp_secret_enc = NULL, totp_last_counter = 0 WHERE id = ?', id);
      revokeAll(db, 'admin', id);
      log(req, 'admin.admin_updated', id, { role: body.role, disabled: body.disabled, resetMfa: body.resetMfa, reason: body.reason });
    });
    return { ok: true };
  });
}
