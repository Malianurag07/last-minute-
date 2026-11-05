import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { HttpError, requireUser } from '../app.ts';
import { audit } from '../audit.ts';
import { config } from '../config.ts';
import { burnHash, encrypt, hashSecret, phoneIndex, randomOtp, safeEqual, sha256, verifySecret } from '../crypto.ts';
import { one, run, tx, type DB } from '../db.ts';
import { isValidPhone, isWeakPin, normalizePhone } from '../domain.ts';
import { newId } from '../ids.ts';
import { sendSms } from '../sms.ts';
import { newRefresh, revokeAll, revokeFamily, rotateRefresh, signAccess } from '../tokens.ts';

const phone = z.string().max(20).refine(isValidPhone, 'invalid phone').transform(normalizePhone);
const pin = z.string().regex(/^\d{4,6}$/);
const otp = z.string().regex(/^\d{6}$/);
const deviceId = z.string().min(16).max(128);

const AUTH_LIMIT = { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } };

interface UserRow {
  id: string;
  pin_hash: string | null;
  status: string;
  token_version: number;
  pin_fail_count: number;
  pin_locked_until: number | null;
}

export async function issueUserSession(db: DB, userId: string, tv: number) {
  const { token: refreshToken, familyId } = newRefresh(db, 'user', userId);
  const accessToken = await signAccess({ sub: userId, realm: 'user', tv, sid: familyId });
  return { accessToken, refreshToken, expiresIn: config.accessTtlSec };
}

/** Checks an OTP; every wrong guess counts and the code dies after 3 tries or 5 minutes. */
function consumeOtp(db: DB, idx: string, purpose: string, code: string) {
  const row = one<{ id: string; code_hash: string; attempts: number; expires_at: number }>(
    db,
    'SELECT id, code_hash, attempts, expires_at FROM otps WHERE phone_idx = ? AND purpose = ? AND consumed = 0 ORDER BY created_at DESC LIMIT 1',
    idx,
    purpose,
  );
  if (!row || row.expires_at < Date.now() || row.attempts >= config.otpMaxAttempts) return false;
  run(db, 'UPDATE otps SET attempts = attempts + 1 WHERE id = ?', row.id);
  if (!safeEqual(row.code_hash, sha256(`${idx}:${code}`))) return false;
  run(db, 'UPDATE otps SET consumed = 1 WHERE id = ?', row.id);
  return true;
}

const deviceHash = (d: string) => sha256(`device:${d}`);
const trustDevice = (db: DB, userId: string, d: string) =>
  run(db, 'INSERT INTO trusted_devices (user_id, device_hash, created_at, last_seen_at) VALUES (?,?,?,?) ON CONFLICT DO UPDATE SET last_seen_at = excluded.last_seen_at', userId, deviceHash(d), Date.now(), Date.now());
const isTrusted = (db: DB, userId: string, d: string) => !!one(db, 'SELECT 1 FROM trusted_devices WHERE user_id = ? AND device_hash = ?', userId, deviceHash(d));

export async function authRoutes(app: FastifyInstance) {
  const db = app.db;
  const ip = (req: FastifyRequest) => req.ipHash;

  /** Step 1 of sign-up, new-device login or PIN reset. Same answer whether or not the number exists. */
  app.post('/otp', { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } }, async (req) => {
    const body = z.object({ phone, purpose: z.enum(['signup', 'login', 'reset']) }).strict().parse(req.body);
    const idx = phoneIndex(body.phone);
    const recent = one<{ n: number }>(db, 'SELECT COUNT(*) n FROM otps WHERE phone_idx = ? AND created_at > ?', idx, Date.now() - 15 * 60_000)!.n;
    if (recent >= 3) throw new HttpError(429, 'rate_limited', 'Too many codes sent. Please wait 15 minutes.');
    const code = randomOtp();
    run(db, 'INSERT INTO otps (id, phone_idx, purpose, code_hash, expires_at, created_at) VALUES (?,?,?,?,?,?)', newId('otp'), idx, body.purpose, sha256(`${idx}:${code}`), Date.now() + config.otpTtlSec * 1000, Date.now());
    await sendSms(body.phone, `${code} is your LastMinute code. It expires in 5 minutes. Never share it with anyone, not even our staff.`);
    return { ok: true, expiresIn: config.otpTtlSec, ...(config.smsProvider === 'console' ? { devCode: code } : {}) };
  });

  /** Create an account. Needs the OTP (proves the phone is yours), an 18+ declaration and consent. */
  app.post('/signup', AUTH_LIMIT, async (req) => {
    const body = z
      .object({
        phone,
        otp,
        name: z.string().trim().min(2).max(60),
        pin,
        deviceId,
        isAdult: z.literal(true),
        noticeVersion: z.string(),
        consents: z.object({ account: z.literal(true), orderSharing: z.literal(true), marketing: z.boolean() }).strict(),
      })
      .strict()
      .parse(req.body);
    if (body.noticeVersion !== config.noticeVersion) throw new HttpError(409, 'notice_outdated', 'Please read the updated privacy notice.');
    if (isWeakPin(body.pin)) throw new HttpError(400, 'weak_pin', 'That PIN is too easy to guess.');
    const idx = phoneIndex(body.phone);
    if (!consumeOtp(db, idx, 'signup', body.otp)) throw new HttpError(400, 'bad_otp', 'The code is wrong or has expired.');
    if (one(db, 'SELECT 1 FROM users WHERE phone_idx = ?', idx)) throw new HttpError(409, 'exists', 'This number already has an account. Please log in.');

    const id = newId('u');
    const pinHash = await hashSecret(body.pin);
    const now = Date.now();
    tx(db, () => {
      run(db, 'INSERT INTO users (id, phone_idx, phone_enc, name_enc, pin_hash, is_adult, created_at, last_login_at) VALUES (?,?,?,?,?,1,?,?)', id, idx, encrypt(body.phone, `users.phone:${id}`), encrypt(body.name, `users.name:${id}`), pinHash, now, now);
      for (const [purpose, granted] of [['account', true], ['order_sharing', true], ['marketing', body.consents.marketing]] as const) {
        run(db, 'INSERT INTO consents (id, user_id, purpose, notice_version, granted, at) VALUES (?,?,?,?,?,?)', newId('cs'), id, purpose, body.noticeVersion, granted ? 1 : 0, now);
      }
      trustDevice(db, id, body.deviceId);
      audit(db, { actorType: 'user', actorId: id, action: 'user.signup', ipHash: ip(req) });
    });
    return { userId: id, ...(await issueUserSession(db, id, 0)) };
  });

  /**
   * Log in with mobile + PIN. On a device we haven't seen before an OTP is
   * also required (like banking apps), so a guessed PIN alone is not enough.
   */
  app.post('/login', AUTH_LIMIT, async (req) => {
    const body = z.object({ phone, pin, deviceId, otp: otp.optional() }).strict().parse(req.body);
    const generic = new HttpError(401, 'bad_credentials', 'Wrong mobile number or PIN.');
    const u = one<UserRow>(db, 'SELECT id, pin_hash, status, token_version, pin_fail_count, pin_locked_until FROM users WHERE phone_idx = ?', phoneIndex(body.phone));
    if (!u || !u.pin_hash || u.status === 'erased') {
      await burnHash(body.pin); // same timing as a real check: no account enumeration
      throw generic;
    }
    if (u.status === 'blocked') throw new HttpError(403, 'blocked', 'This account is blocked. Please call the helpline.');
    if (u.pin_locked_until && u.pin_locked_until > Date.now()) {
      throw new HttpError(423, 'locked', `Too many wrong tries. Try again after ${Math.ceil((u.pin_locked_until - Date.now()) / 60000)} minutes or reset your PIN with an SMS code.`);
    }
    if (!(await verifySecret(body.pin, u.pin_hash))) {
      const fails = u.pin_fail_count + 1;
      const lock = fails % config.pinMaxAttempts === 0 ? Date.now() + config.pinLockMinutes * 60_000 * Math.min(8, fails / config.pinMaxAttempts) : null;
      run(db, 'UPDATE users SET pin_fail_count = ?, pin_locked_until = COALESCE(?, pin_locked_until) WHERE id = ?', fails, lock, u.id);
      audit(db, { actorType: 'user', actorId: u.id, action: 'auth.pin_failed', detail: { fails }, ipHash: ip(req) });
      throw generic;
    }
    if (!isTrusted(db, u.id, body.deviceId)) {
      if (!body.otp) throw new HttpError(401, 'otp_required', 'New phone: we sent you an SMS code to confirm it is you.');
      if (!consumeOtp(db, phoneIndex(body.phone), 'login', body.otp)) throw new HttpError(400, 'bad_otp', 'The code is wrong or has expired.');
      trustDevice(db, u.id, body.deviceId);
      audit(db, { actorType: 'user', actorId: u.id, action: 'auth.new_device', ipHash: ip(req) });
    }
    run(db, 'UPDATE users SET pin_fail_count = 0, pin_locked_until = NULL, last_login_at = ? WHERE id = ?', Date.now(), u.id);
    audit(db, { actorType: 'user', actorId: u.id, action: 'auth.login', ipHash: ip(req) });
    return { userId: u.id, ...(await issueUserSession(db, u.id, u.token_version)) };
  });

  /** Forgot PIN: prove phone ownership with an OTP, set a new PIN, sign out everywhere else. */
  app.post('/pin/reset', AUTH_LIMIT, async (req) => {
    const body = z.object({ phone, otp, newPin: pin, deviceId }).strict().parse(req.body);
    if (isWeakPin(body.newPin)) throw new HttpError(400, 'weak_pin', 'That PIN is too easy to guess.');
    const idx = phoneIndex(body.phone);
    if (!consumeOtp(db, idx, 'reset', body.otp)) throw new HttpError(400, 'bad_otp', 'The code is wrong or has expired.');
    const u = one<UserRow>(db, 'SELECT id, status, token_version FROM users WHERE phone_idx = ?', idx);
    if (!u || u.status !== 'active') throw new HttpError(400, 'bad_otp', 'The code is wrong or has expired.');
    const h = await hashSecret(body.newPin);
    tx(db, () => {
      run(db, 'UPDATE users SET pin_hash = ?, pin_fail_count = 0, pin_locked_until = NULL WHERE id = ?', h, u.id);
      revokeAll(db, 'user', u.id);
      trustDevice(db, u.id, body.deviceId);
      audit(db, { actorType: 'user', actorId: u.id, action: 'auth.pin_reset', ipHash: ip(req) });
    });
    return { userId: u.id, ...(await issueUserSession(db, u.id, u.token_version + 1)) };
  });

  app.post('/refresh', AUTH_LIMIT, async (req) => {
    const { refreshToken } = z.object({ refreshToken: z.string().min(20).max(200) }).strict().parse(req.body);
    const r = rotateRefresh(db, refreshToken, 'user');
    if (typeof r === 'string') throw new HttpError(401, 'unauthenticated', 'Please log in again.');
    const u = one<{ status: string; token_version: number }>(db, 'SELECT status, token_version FROM users WHERE id = ?', r.subjectId);
    if (!u || u.status !== 'active') throw new HttpError(401, 'unauthenticated', 'Please log in again.');
    const accessToken = await signAccess({ sub: r.subjectId, realm: 'user', tv: u.token_version, sid: r.familyId });
    return { accessToken, refreshToken: r.token, expiresIn: config.accessTtlSec };
  });

  app.post('/logout', { preHandler: requireUser }, async (req) => {
    revokeFamily(db, req.user!.sid);
    return { ok: true };
  });

  app.post('/logout-all', { preHandler: requireUser }, async (req) => {
    revokeAll(db, 'user', req.user!.sub);
    run(db, 'DELETE FROM trusted_devices WHERE user_id = ?', req.user!.sub);
    audit(db, { actorType: 'user', actorId: req.user!.sub, action: 'auth.logout_all', ipHash: req.ipHash });
    return { ok: true };
  });
}
