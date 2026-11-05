import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { buildApp } from '../src/app.ts';
import { verifyAuditChain } from '../src/audit.ts';
import { decrypt, totp } from '../src/crypto.ts';
import { all, one, openDb } from '../src/db.ts';
import { DEMO, seedDemo } from '../src/tools/seed.ts';

const db = openDb(':memory:');
const app = buildApp({ db, logger: false });

type Res = { status: number; body: any; headers: Record<string, unknown> };
let ipCounter = 0;
/** Each call comes from a different IP so the rate limiter doesn't interfere; the rate-limit test pins one IP. */
async function call(method: string, url: string, body?: unknown, token?: string, ip?: string): Promise<Res> {
  const remoteAddress = ip ?? `10.1.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`;
  const r = await app.inject({ method: method as 'GET', url, payload: body as object, remoteAddress, headers: token ? { authorization: `Bearer ${token}` } : {} });
  return { status: r.statusCode, body: r.body ? JSON.parse(r.body) : null, headers: r.headers };
}

const DEVICE = 'device-aaaaaaaaaaaaaaaa';
async function signup(phone: string, name: string, pin = '4826') {
  const o = await call('POST', '/v1/auth/otp', { phone, purpose: 'signup' });
  assert.equal(o.status, 200, JSON.stringify(o.body));
  const r = await call('POST', '/v1/auth/signup', {
    phone, otp: o.body.devCode, name, pin, deviceId: DEVICE, isAdult: true, noticeVersion: '2026-11-01',
    consents: { account: true, orderSharing: true, marketing: false },
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body as { userId: string; accessToken: string; refreshToken: string };
}

let customer: { accessToken: string; refreshToken: string; userId: string };
let other: { accessToken: string; refreshToken: string; userId: string };
let provider: { accessToken: string };
let providerId = '';
let serviceId = '';

before(async () => {
  await app.ready();
  await seedDemo(db);
  customer = await signup('9876500001', 'Asha Rao');
  other = await signup('9876500002', 'Ravi Kumar');
  await call('PATCH', '/v1/me', { address: '12 MG Road' }, customer.accessToken);
  const p = await call('POST', '/v1/auth/login', { phone: DEMO.providerPhone, pin: DEMO.pin, deviceId: DEVICE, otp: undefined });
  // seeded provider logs in from a new device → needs OTP
  assert.equal(p.status, 401);
  assert.equal(p.body.error, 'otp_required');
  const o = await call('POST', '/v1/auth/otp', { phone: DEMO.providerPhone, purpose: 'login' });
  const p2 = await call('POST', '/v1/auth/login', { phone: DEMO.providerPhone, pin: DEMO.pin, deviceId: DEVICE, otp: o.body.devCode });
  assert.equal(p2.status, 200, JSON.stringify(p2.body));
  provider = p2.body;
  const shop = await call('GET', '/v1/shop', undefined, provider.accessToken);
  providerId = shop.body.id;
  serviceId = shop.body.services[0].id;
});

describe('sign-up & login', () => {
  it('rejects a wrong OTP and kills the code after 3 tries', async () => {
    await call('POST', '/v1/auth/otp', { phone: '9876500009', purpose: 'signup' });
    const base = { phone: '9876500009', name: 'X Y', pin: '4826', deviceId: DEVICE, isAdult: true, noticeVersion: '2026-11-01', consents: { account: true, orderSharing: true, marketing: false } };
    for (let i = 0; i < 3; i++) assert.equal((await call('POST', '/v1/auth/signup', { ...base, otp: '000000' })).body.error, 'bad_otp');
    const row = one<{ attempts: number }>(db, 'SELECT attempts FROM otps ORDER BY created_at DESC LIMIT 1')!;
    assert.equal(row.attempts, 3);
  });

  it('requires an 18+ declaration and the required consents', async () => {
    const o = await call('POST', '/v1/auth/otp', { phone: '9876500010', purpose: 'signup' });
    const r = await call('POST', '/v1/auth/signup', { phone: '9876500010', otp: o.body.devCode, name: 'Kid', pin: '4826', deviceId: DEVICE, isAdult: false, noticeVersion: '2026-11-01', consents: { account: true, orderSharing: true, marketing: false } });
    assert.equal(r.status, 400);
  });

  it('refuses easy PINs', async () => {
    const o = await call('POST', '/v1/auth/otp', { phone: '9876500011', purpose: 'signup' });
    const r = await call('POST', '/v1/auth/signup', { phone: '9876500011', otp: o.body.devCode, name: 'A B', pin: '1234', deviceId: DEVICE, isAdult: true, noticeVersion: '2026-11-01', consents: { account: true, orderSharing: true, marketing: false } });
    assert.equal(r.body.error, 'weak_pin');
  });

  it('gives the same answer for unknown numbers and wrong PINs (no account discovery)', async () => {
    const a = await call('POST', '/v1/auth/login', { phone: '9123456789', pin: '4826', deviceId: DEVICE });
    const b = await call('POST', '/v1/auth/login', { phone: '9876500002', pin: '9999', deviceId: DEVICE });
    assert.equal(a.status, 401);
    assert.deepEqual(a.body, b.body);
  });

  it('locks the account after 5 wrong PINs, even with the right PIN after', async () => {
    const victim = await signup('9876500020', 'Lock Me', '4826');
    void victim;
    for (let i = 0; i < 5; i++) await call('POST', '/v1/auth/login', { phone: '9876500020', pin: '7777', deviceId: DEVICE });
    const r = await call('POST', '/v1/auth/login', { phone: '9876500020', pin: '4826', deviceId: DEVICE });
    assert.equal(r.status, 423);
  });

  it('never stores phone numbers, names or PINs in clear text', () => {
    const dump = JSON.stringify(all(db, 'SELECT * FROM users'));
    assert.ok(!dump.includes('9876500001'));
    assert.ok(!dump.includes('Asha'));
    assert.ok(!dump.includes('4826'));
  });
});

describe('tokens', () => {
  it('rejects a tampered token', async () => {
    const [h, p, s] = customer.accessToken.split('.');
    const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
    claims.sub = other.userId;
    const forged = [h, Buffer.from(JSON.stringify(claims)).toString('base64url'), s].join('.');
    assert.equal((await call('GET', '/v1/me', undefined, forged)).status, 401);
  });

  it('rejects alg=none tokens', async () => {
    const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: customer.userId, realm: 'user', aud: 'user', iss: 'lastminute-api', tv: 0 })).toString('base64url')}.`;
    assert.equal((await call('GET', '/v1/me', undefined, none)).status, 401);
  });

  it('a user token cannot open admin APIs', async () => {
    assert.equal((await call('GET', '/v1/admin/overview', undefined, customer.accessToken)).status, 401);
  });

  it('detects refresh-token theft (reuse) and signs the user out everywhere', async () => {
    const victim = await signup('9876500030', 'Reuse Test');
    const r1 = await call('POST', '/v1/auth/refresh', { refreshToken: victim.refreshToken });
    assert.equal(r1.status, 200);
    const replay = await call('POST', '/v1/auth/refresh', { refreshToken: victim.refreshToken }); // attacker replays old token
    assert.equal(replay.status, 401);
    const after = await call('POST', '/v1/auth/refresh', { refreshToken: r1.body.refreshToken });
    assert.equal(after.status, 401, 'whole family revoked');
    assert.equal((await call('GET', '/v1/me', undefined, r1.body.accessToken)).status, 401);
  });

  it('logout makes the access token useless immediately', async () => {
    const t = await signup('9876500031', 'Logout Test');
    assert.equal((await call('POST', '/v1/auth/logout', {}, t.accessToken)).status, 200);
    assert.equal((await call('GET', '/v1/me', undefined, t.accessToken)).status, 401);
  });
});

describe('orders: authorization & tampering', () => {
  let orderId = '';
  const needBy = () => new Date(Date.now() + 2 * 3600_000).toISOString();

  it('computes the price on the server and rejects client-sent prices', async () => {
    const bad = await call('POST', '/v1/orders', { providerId, serviceId, needBy: needBy(), handover: 'self', price: 1 }, customer.accessToken);
    assert.equal(bad.status, 400);
    const ok = await call('POST', '/v1/orders', { providerId, serviceId, needBy: needBy(), handover: 'delivery', deliveryPartnerId: 'porter' }, customer.accessToken);
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.price, 450);
    assert.equal(ok.body.rushFee, 50);
    assert.ok(ok.body.deliveryFee > 0);
    assert.equal(ok.body.commission, undefined, 'customer does not see commission');
    orderId = ok.body.id;
  });

  it('another user cannot see or change someone else’s order', async () => {
    assert.equal((await call('GET', `/v1/orders/${orderId}`, undefined, other.accessToken)).status, 404);
    assert.equal((await call('POST', `/v1/orders/${orderId}/status`, { status: 'cancelled' }, other.accessToken)).status, 404);
  });

  it('the customer cannot accept or complete their own order', async () => {
    assert.equal((await call('POST', `/v1/orders/${orderId}/status`, { status: 'accepted' }, customer.accessToken)).status, 409);
    assert.equal((await call('POST', `/v1/orders/${orderId}/status`, { status: 'delivered' }, customer.accessToken)).status, 409);
  });

  it('the provider cannot skip steps', async () => {
    assert.equal((await call('POST', `/v1/orders/${orderId}/status`, { status: 'delivered' }, provider.accessToken)).status, 409);
  });

  it('full happy path, then exactly one review by the customer', async () => {
    for (const s of ['accepted', 'working', 'ready', 'delivered']) {
      const r = await call('POST', `/v1/orders/${orderId}/status`, { status: s }, provider.accessToken);
      assert.equal(r.status, 200, `${s}: ${JSON.stringify(r.body)}`);
    }
    const p = await call('GET', `/v1/orders/${orderId}`, undefined, provider.accessToken);
    assert.ok(!p.body.customerPhone.includes('98765'), 'provider loses the customer’s number after completion');
    assert.equal(p.body.address, '');
    assert.equal((await call('POST', `/v1/orders/${orderId}/review`, { rating: 5, text: 'Great' }, provider.accessToken)).status, 403);
    assert.equal((await call('POST', `/v1/orders/${orderId}/review`, { rating: 5, text: 'Great' }, customer.accessToken)).status, 200);
    assert.equal((await call('POST', `/v1/orders/${orderId}/review`, { rating: 1, text: 'again' }, customer.accessToken)).status, 409);
  });

  it('a provider cannot make their own shop "verified"', async () => {
    const r = await call('PATCH', '/v1/shop', { verified: true, rating: 5 }, provider.accessToken);
    assert.equal(r.status, 400);
  });

  it('public listings never expose phone numbers', async () => {
    const r = await call('GET', '/v1/providers');
    assert.ok(!JSON.stringify(r.body).includes('98200'));
  });
});

describe('admin', () => {
  let token = '';
  let secret = '';
  it('needs password + authenticator code, then a password change', async () => {
    const s1 = await call('POST', '/v1/admin/login', { username: 'superadmin', password: DEMO.admin.tempPassword });
    assert.equal(s1.body.mfa, 'setup');
    secret = s1.body.secret;
    assert.equal((await call('POST', '/v1/admin/login/totp', { challenge: s1.body.challenge, code: '000000' })).status, 401);
    const code = totp(secret).code;
    const s2 = await call('POST', '/v1/admin/login/totp', { challenge: s1.body.challenge, code });
    assert.equal(s2.status, 200, JSON.stringify(s2.body));
    assert.equal(s2.body.mustChangePassword, true);
    assert.equal((await call('GET', '/v1/admin/overview', undefined, s2.body.accessToken)).body.error, 'password_change_required');
    assert.equal((await call('POST', '/v1/admin/password', { current: DEMO.admin.tempPassword, next: 'short' }, s2.body.accessToken)).body.error, 'weak_password');
    const pw = await call('POST', '/v1/admin/password', { current: DEMO.admin.tempPassword, next: 'Correct-Horse-Battery-77' }, s2.body.accessToken);
    assert.equal(pw.status, 200);
    token = pw.body.accessToken;
    assert.equal((await call('GET', '/v1/admin/overview', undefined, token)).status, 200);
  });

  it('a used authenticator code cannot be replayed', async () => {
    const s1 = await call('POST', '/v1/admin/login', { username: 'superadmin', password: 'Correct-Horse-Battery-77' });
    const code = totp(secret).code; // same 30 s window as the previous login
    assert.equal((await call('POST', '/v1/admin/login/totp', { challenge: s1.body.challenge, code })).status, 401);
  });

  it('roles are least-privilege: support cannot verify or suspend', async () => {
    assert.equal((await call('POST', '/v1/admin/admins', { username: 'sam.support', role: 'support', tempPassword: 'Support-Temp-Pass-2026' }, token)).status, 200);
    const s1 = await call('POST', '/v1/admin/login', { username: 'sam.support', password: 'Support-Temp-Pass-2026' });
    const s2 = await call('POST', '/v1/admin/login/totp', { challenge: s1.body.challenge, code: totp(s1.body.secret).code });
    const s3 = await call('POST', '/v1/admin/password', { current: 'Support-Temp-Pass-2026', next: 'Support-Real-Pass-9988' }, s2.body.accessToken);
    const sup = s3.body.accessToken;
    assert.equal((await call('POST', `/v1/admin/providers/${providerId}`, { verified: false, reason: 'testing roles' }, sup)).status, 403);
    assert.equal((await call('GET', '/v1/admin/audit', undefined, sup)).status, 403);
    assert.equal((await call('POST', `/v1/admin/users/${customer.userId}/reveal`, { reason: 'curious about it' }, sup)).status, 403);
    const users = await call('GET', '/v1/admin/users', undefined, sup);
    assert.ok(!JSON.stringify(users.body).includes('9876500001'), 'phones are masked in lists');
  });

  it('blocking a user signs them out at once', async () => {
    const victim = await signup('9876500040', 'Block Test');
    assert.equal((await call('POST', `/v1/admin/users/${victim.userId}/block`, { blocked: true, reason: 'fraud report #12' }, token)).status, 200);
    assert.equal((await call('GET', '/v1/me', undefined, victim.accessToken)).status, 401);
  });

  it('every admin action needs a reason and lands in the audit log', async () => {
    assert.equal((await call('POST', `/v1/admin/providers/${providerId}`, { suspended: true }, token)).status, 400);
    await call('POST', `/v1/admin/users/${customer.userId}/reveal`, { reason: 'customer called support' }, token);
    const log = await call('GET', '/v1/admin/audit', undefined, token);
    assert.ok(log.body.some((e: { action: string }) => e.action === 'admin.pii_viewed'));
  });

  it('the audit log is append-only and tampering is detected', () => {
    assert.equal(verifyAuditChain(db).ok, true);
    assert.throws(() => db.exec("UPDATE audit_log SET action = 'nothing' WHERE seq = 1"));
    // an attacker with raw DB access drops the trigger and edits a row…
    db.exec('DROP TRIGGER audit_no_update');
    db.exec("UPDATE audit_log SET action = 'nothing' WHERE seq = 2");
    const r = verifyAuditChain(db);
    assert.equal(r.ok, false);
    assert.equal(r.brokenAt, 2);
  });
});

describe('privacy rights (DPDP Act)', () => {
  it('exports all of my data', async () => {
    const r = await call('GET', '/v1/me/export', undefined, customer.accessToken);
    assert.equal(r.status, 200);
    assert.equal(r.body.profile.name, 'Asha Rao');
    assert.ok(r.body.consentHistory.length >= 3);
    assert.ok(r.body.orders.length >= 1);
  });

  it('withdrawing consent stops new orders', async () => {
    await call('POST', '/v1/me/consents', { purpose: 'order_sharing', granted: false }, other.accessToken);
    const r = await call('POST', '/v1/orders', { providerId, serviceId, needBy: new Date(Date.now() + 7200_000).toISOString(), handover: 'self' }, other.accessToken);
    assert.equal(r.body.error, 'consent_required');
  });

  it('erasure wipes personal data and the account can no longer log in', async () => {
    assert.equal((await call('DELETE', '/v1/me', { pin: '0000' }, customer.accessToken)).status, 401);
    assert.equal((await call('DELETE', '/v1/me', { pin: '4826' }, customer.accessToken)).status, 200);
    const u = one<{ phone_enc: string | null; name_enc: string | null; status: string }>(db, 'SELECT phone_enc, name_enc, status FROM users WHERE id = ?', customer.userId)!;
    assert.deepEqual([u.phone_enc, u.name_enc, u.status], [null, null, 'erased']);
    const o = one<{ address_enc: string | null; price: number }>(db, 'SELECT address_enc, price FROM orders WHERE customer_id = ?', customer.userId)!;
    assert.equal(o.address_enc, null);
    assert.equal(o.price, 450, 'money record kept for tax law');
    const r = await call('POST', '/v1/auth/login', { phone: '9876500001', pin: '4826', deviceId: DEVICE });
    assert.equal(r.status, 401);
  });

  it('encrypted values are bound to their row (copying ciphertext to another user fails)', () => {
    const a = one<{ id: string; name_enc: string }>(db, "SELECT id, name_enc FROM users WHERE status = 'active' AND name_enc IS NOT NULL LIMIT 1")!;
    assert.throws(() => decrypt(a.name_enc, 'users.name:someone-else'));
  });
});

describe('rate limits', () => {
  it('blocks brute force: the 6th SMS code request from one IP within 15 min is refused', async () => {
    const codes = [];
    for (let i = 0; i < 6; i++) codes.push((await call('POST', '/v1/auth/otp', { phone: `98765001${10 + i}`, purpose: 'login' }, undefined, '203.0.113.7')).status);
    assert.deepEqual(codes, [200, 200, 200, 200, 200, 429]);
  });

  it('max 3 SMS codes per phone number per 15 min, whatever the IP', async () => {
    const st = [];
    for (let i = 0; i < 4; i++) st.push((await call('POST', '/v1/auth/otp', { phone: '9876500077', purpose: 'login' })).status);
    assert.deepEqual(st, [200, 200, 200, 429]);
  });
});

describe('transport & headers', () => {
  it('sends strict security headers and never caches API answers', async () => {
    const r = await call('GET', '/health');
    assert.match(String(r.headers['content-security-policy']), /default-src 'self'/);
    assert.match(String(r.headers['content-security-policy']), /frame-ancestors 'none'/);
    assert.equal(r.headers['x-content-type-options'], 'nosniff');
    assert.equal(r.headers['cache-control'], 'no-store');
    assert.equal(r.headers['x-powered-by'], undefined);
  });

  it('hides internal errors', async () => {
    const r = await app.inject({ method: 'POST', url: '/v1/auth/login', payload: '{bad json', headers: { 'content-type': 'application/json' } });
    assert.equal(r.statusCode, 400);
    assert.ok(!r.body.includes('at '), 'no stack trace');
  });
});
