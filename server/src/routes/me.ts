import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { HttpError, requireUser } from '../app.ts';
import { audit } from '../audit.ts';
import { config } from '../config.ts';
import { decrypt, encrypt, verifySecret } from '../crypto.ts';
import { all, one, run, tx, type DB } from '../db.ts';
import { ACTIVE_STATUSES, isValidPhone, normalizePhone } from '../domain.ts';
import { newId } from '../ids.ts';
import { revokeAll } from '../tokens.ts';

const DAY = 86_400_000;
/** Our own service level for privacy requests (the law's outer limit is longer). */
const SLA_DAYS = 7;

export function currentConsents(db: DB, userId: string) {
  const rows = all<{ purpose: string; granted: number; at: number; notice_version: string }>(
    db,
    'SELECT purpose, granted, at, notice_version FROM consents WHERE user_id = ? ORDER BY at',
    userId,
  );
  const latest: Record<string, { granted: boolean; at: number; noticeVersion: string }> = {};
  for (const r of rows) latest[r.purpose] = { granted: !!r.granted, at: r.at, noticeVersion: r.notice_version };
  return latest;
}

export function profile(db: DB, userId: string) {
  const u = one<{ id: string; phone_enc: string; name_enc: string; address_enc: string | null; created_at: number }>(
    db,
    'SELECT id, phone_enc, name_enc, address_enc, created_at FROM users WHERE id = ?',
    userId,
  );
  if (!u) throw new HttpError(404, 'not_found', 'Account not found.');
  const shop = one<{ id: string }>(db, 'SELECT id FROM providers WHERE owner_user_id = ?', userId);
  return {
    id: u.id,
    phone: decrypt(u.phone_enc, `users.phone:${u.id}`),
    name: decrypt(u.name_enc, `users.name:${u.id}`),
    address: decrypt(u.address_enc, `users.address:${u.id}`),
    createdAt: u.created_at,
    providerId: shop?.id ?? null,
  };
}

function openRequest(db: DB, userId: string | null, type: string, detail: unknown) {
  const id = newId('pr');
  run(
    db,
    'INSERT INTO privacy_requests (id, user_id, type, detail_enc, created_at, due_at) VALUES (?,?,?,?,?,?)',
    id,
    userId,
    type,
    encrypt(JSON.stringify(detail), `privacy_requests.detail:${id}`),
    Date.now(),
    Date.now() + SLA_DAYS * DAY,
  );
  return id;
}

export async function meRoutes(app: FastifyInstance) {
  const db = app.db;

  /** Privacy notice summary shown before sign-up (DPDP Act s.5). Full text lives in the app/website. */
  app.get('/privacy/notice', async () => ({
    version: config.noticeVersion,
    dataWeCollect: ['name', 'mobile number', 'pickup/drop address (only if you use delivery)', 'order details and notes', 'reviews you write'],
    purposes: {
      account: 'Create and secure your account (needed).',
      order_sharing: 'Share your name, number and address with the provider and delivery partner for the order you place (needed to deliver the service).',
      marketing: 'Offers and tips by SMS/WhatsApp (optional, you can stop anytime).',
    },
    retention: `Account data is deleted when you delete your account. Completed order records are kept for ${config.retention.ordersYears} years without your personal details, as tax law requires.`,
    rights: ['see your data', 'correct it', 'delete your account', 'withdraw consent', 'nominate someone', 'complain to our Grievance Officer', 'complain to the Data Protection Board of India'],
    grievanceOfficer: config.grievanceOfficer,
  }));

  app.get('/me', { preHandler: requireUser }, async (req) => ({ ...profile(db, req.user!.sub), consents: currentConsents(db, req.user!.sub) }));

  /** Right to correction. */
  app.patch('/me', { preHandler: requireUser }, async (req) => {
    const body = z.object({ name: z.string().trim().min(2).max(60).optional(), address: z.string().trim().max(200).optional() }).strict().parse(req.body);
    const id = req.user!.sub;
    if (body.name !== undefined) run(db, 'UPDATE users SET name_enc = ? WHERE id = ?', encrypt(body.name, `users.name:${id}`), id);
    if (body.address !== undefined) run(db, 'UPDATE users SET address_enc = ? WHERE id = ?', encrypt(body.address, `users.address:${id}`), id);
    audit(db, { actorType: 'user', actorId: id, action: 'privacy.correction', detail: { fields: Object.keys(body) }, ipHash: req.ipHash });
    return profile(db, id);
  });

  /** Give or withdraw consent for a purpose. Withdrawal is as easy as giving it (s.6(4)). */
  app.post('/me/consents', { preHandler: requireUser }, async (req) => {
    const body = z.object({ purpose: z.enum(['marketing', 'order_sharing']), granted: z.boolean() }).strict().parse(req.body);
    const id = req.user!.sub;
    run(db, 'INSERT INTO consents (id, user_id, purpose, notice_version, granted, at) VALUES (?,?,?,?,?,?)', newId('cs'), id, body.purpose, config.noticeVersion, body.granted ? 1 : 0, Date.now());
    audit(db, { actorType: 'user', actorId: id, action: body.granted ? 'consent.granted' : 'consent.withdrawn', target: body.purpose, ipHash: req.ipHash });
    return { consents: currentConsents(db, id), note: body.purpose === 'order_sharing' && !body.granted ? 'You can’t place new orders until you allow sharing details with the provider.' : undefined };
  });

  /** Right to access: everything we hold about you, in one file. */
  app.get('/me/export', { preHandler: requireUser, config: { rateLimit: { max: 5, timeWindow: '1 hour' } } }, async (req) => {
    const id = req.user!.sub;
    const orders = all<Record<string, unknown> & { id: string; notes_enc: string | null; address_enc: string | null }>(db, 'SELECT * FROM orders WHERE customer_id = ?', id).map(
      (o) => ({
        id: o.id, service: o.service_name, status: o.status, price: o.price, rushFee: o.rush_fee, deliveryFee: o.delivery_fee, platformFee: o.platform_fee,
        needBy: o.need_by, createdAt: o.created_at, notes: decrypt(o.notes_enc, `orders.notes:${o.id}`), address: decrypt(o.address_enc, `orders.address:${o.id}`),
      }),
    );
    const nominee = one<{ name_enc: string; phone_enc: string; relation: string }>(db, 'SELECT * FROM nominees WHERE user_id = ?', id);
    audit(db, { actorType: 'user', actorId: id, action: 'privacy.export', ipHash: req.ipHash });
    return {
      exportedAt: new Date().toISOString(),
      profile: profile(db, id),
      consentHistory: all(db, 'SELECT purpose, granted, notice_version, at FROM consents WHERE user_id = ? ORDER BY at', id),
      orders,
      reviews: all(db, 'SELECT order_id, provider_id, rating, text, created_at FROM reviews WHERE customer_id = ? AND removed_at IS NULL', id),
      shop: one(db, 'SELECT id, name, category_id, bio, area, open_from, open_to, created_at FROM providers WHERE owner_user_id = ?', id) ?? null,
      nominee: nominee ? { name: decrypt(nominee.name_enc, `nominees.name:${id}`), phone: decrypt(nominee.phone_enc, `nominees.phone:${id}`), relation: nominee.relation } : null,
      sharedWith: 'Providers you ordered from and the delivery partner you chose received your name, phone and address for those orders only.',
    };
  });

  /** Right to nominate (s.14): someone who can act for you if you die or can't act. */
  app.post('/me/nominee', { preHandler: requireUser }, async (req) => {
    const body = z.object({ name: z.string().trim().min(2).max(60), phone: z.string().refine(isValidPhone).transform(normalizePhone), relation: z.string().trim().min(2).max(30) }).strict().parse(req.body);
    const id = req.user!.sub;
    run(db, 'INSERT INTO nominees (user_id, name_enc, phone_enc, relation, at) VALUES (?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET name_enc=excluded.name_enc, phone_enc=excluded.phone_enc, relation=excluded.relation, at=excluded.at',
      id, encrypt(body.name, `nominees.name:${id}`), encrypt(body.phone, `nominees.phone:${id}`), body.relation, Date.now());
    audit(db, { actorType: 'user', actorId: id, action: 'privacy.nominee_set', ipHash: req.ipHash });
    return { ok: true };
  });

  /** Grievance redressal (s.13). Anyone signed in can raise one; we answer within 7 days. */
  app.post('/grievances', { preHandler: requireUser, config: { rateLimit: { max: 5, timeWindow: '1 hour' } } }, async (req) => {
    const body = z.object({ subject: z.string().trim().min(3).max(120), message: z.string().trim().min(5).max(2000) }).strict().parse(req.body);
    const id = openRequest(db, req.user!.sub, 'grievance', body);
    audit(db, { actorType: 'user', actorId: req.user!.sub, action: 'privacy.grievance_opened', target: id, ipHash: req.ipHash });
    return { ticket: id, dueInDays: SLA_DAYS, officer: config.grievanceOfficer };
  });

  app.get('/me/requests', { preHandler: requireUser }, async (req) =>
    all(db, 'SELECT id, type, status, created_at, due_at, resolved_at, resolution FROM privacy_requests WHERE user_id = ? ORDER BY created_at DESC', req.user!.sub),
  );

  /**
   * Right to erasure. Needs the PIN again. Personal data is wiped; order
   * money records stay (without your identity) because tax law requires them.
   */
  app.delete('/me', { preHandler: requireUser, config: { rateLimit: { max: 3, timeWindow: '1 hour' } } }, async (req) => {
    const { pin } = z.object({ pin: z.string().regex(/^\d{4,6}$/) }).strict().parse(req.body);
    const id = req.user!.sub;
    const u = one<{ pin_hash: string }>(db, 'SELECT pin_hash FROM users WHERE id = ?', id)!;
    if (!(await verifySecret(pin, u.pin_hash))) throw new HttpError(401, 'bad_credentials', 'Wrong PIN.');
    const shop = one<{ id: string }>(db, 'SELECT id FROM providers WHERE owner_user_id = ?', id);
    const marks = ACTIVE_STATUSES.map(() => '?').join(',');
    const busy = one<{ n: number }>(db, `SELECT COUNT(*) n FROM orders WHERE (customer_id = ? OR provider_id = ?) AND status IN (${marks})`, id, shop?.id ?? '-', ...ACTIVE_STATUSES)!.n;
    if (busy) throw new HttpError(409, 'active_orders', 'Please finish or cancel your active orders first.');
    const now = Date.now();
    tx(db, () => {
      const reqId = openRequest(db, id, 'erasure', { requestedAt: now });
      run(db, "UPDATE users SET phone_idx = NULL, phone_enc = NULL, name_enc = NULL, address_enc = NULL, pin_hash = NULL, status = 'erased' WHERE id = ?", id);
      run(db, 'UPDATE orders SET notes_enc = NULL, address_enc = NULL, pii_purged_at = ? WHERE customer_id = ?', now, id);
      run(db, "UPDATE reviews SET author_display = 'Former customer', customer_id = NULL WHERE customer_id = ?", id);
      run(db, 'DELETE FROM nominees WHERE user_id = ?', id);
      run(db, 'DELETE FROM trusted_devices WHERE user_id = ?', id);
      if (shop) {
        run(db, "UPDATE providers SET name = 'Closed shop', bio = '', phone_enc = NULL, suspended = 1, available = 0, owner_user_id = NULL WHERE id = ?", shop.id);
        run(db, 'UPDATE orders SET notes_enc = NULL, address_enc = NULL, pii_purged_at = ? WHERE provider_id = ?', now, shop.id);
      }
      revokeAll(db, 'user', id);
      run(db, "UPDATE privacy_requests SET status = 'resolved', resolved_at = ?, resolution = 'Erased automatically' WHERE id = ?", now, reqId);
      audit(db, { actorType: 'user', actorId: id, action: 'privacy.erasure', ipHash: req.ipHash });
    });
    return { ok: true };
  });
}
