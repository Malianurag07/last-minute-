import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { HttpError, requireUser } from '../app.ts';
import { audit } from '../audit.ts';
import { decrypt, encrypt } from '../crypto.ts';
import { all, one, run, tx, type DB } from '../db.ts';
import { CATEGORY_IDS } from '../domain.ts';
import { newId } from '../ids.ts';
import { publicProvider, type ProviderRow } from './catalog.ts';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const service = z.object({ id: z.string().max(64).optional(), name: z.string().trim().min(2).max(60), price: z.number().int().min(1).max(100000), minutes: z.number().int().min(1).max(10080) }).strict();

export function myShop(db: DB, userId: string) {
  const p = one<ProviderRow>(db, 'SELECT * FROM providers WHERE owner_user_id = ?', userId);
  if (!p) throw new HttpError(404, 'no_shop', 'You have not opened a shop yet.');
  return p;
}

export async function shopRoutes(app: FastifyInstance) {
  const db = app.db;

  app.post('/shop', { preHandler: requireUser }, async (req) => {
    // `.strict()` rejects unknown fields, so nobody can sneak in verified/rating/suspended
    const body = z
      .object({
        name: z.string().trim().min(2).max(60),
        categoryId: z.enum(CATEGORY_IDS),
        bio: z.string().trim().max(300).default(''),
        area: z.string().trim().min(2).max(60),
        openFrom: time,
        openTo: time,
        rushFee: z.number().int().min(0).max(1000).default(50),
        languages: z.array(z.string().max(20)).max(6).default([]),
        services: z.array(service).min(1).max(20),
      })
      .strict()
      .parse(req.body);
    const uid = req.user!.sub;
    if (one(db, 'SELECT 1 FROM providers WHERE owner_user_id = ?', uid)) throw new HttpError(409, 'exists', 'You already have a shop.');
    const id = newId('p');
    const phone = decrypt(one<{ phone_enc: string }>(db, 'SELECT phone_enc FROM users WHERE id = ?', uid)!.phone_enc, `users.phone:${uid}`);
    tx(db, () => {
      run(db, 'INSERT INTO providers (id, owner_user_id, name, category_id, bio, area, rush_fee, open_from, open_to, languages, phone_enc, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
        id, uid, body.name, body.categoryId, body.bio, body.area, body.rushFee, body.openFrom, body.openTo, JSON.stringify(body.languages), encrypt(phone, `providers.phone:${id}`), Date.now());
      for (const s of body.services) run(db, 'INSERT INTO services (id, provider_id, name, price, minutes) VALUES (?,?,?,?,?)', newId('s'), id, s.name, s.price, s.minutes);
      audit(db, { actorType: 'user', actorId: uid, action: 'shop.created', target: id, ipHash: req.ipHash });
    });
    return publicProvider(db, one<ProviderRow>(db, 'SELECT * FROM providers WHERE id = ?', id)!);
  });

  app.get('/shop', { preHandler: requireUser }, async (req) => {
    const p = myShop(db, req.user!.sub);
    return { ...publicProvider(db, p, true), suspended: !!p.suspended };
  });

  app.patch('/shop', { preHandler: requireUser }, async (req) => {
    const body = z
      .object({
        bio: z.string().trim().max(300).optional(),
        area: z.string().trim().min(2).max(60).optional(),
        openFrom: time.optional(),
        openTo: time.optional(),
        rushFee: z.number().int().min(0).max(1000).optional(),
        available: z.boolean().optional(),
        services: z.array(service).min(1).max(20).optional(),
      })
      .strict()
      .parse(req.body);
    const p = myShop(db, req.user!.sub);
    if (p.suspended && body.available) throw new HttpError(403, 'suspended', 'Your shop is paused by our team. Please call the helpline.');
    tx(db, () => {
      const cols: Record<string, unknown> = { bio: body.bio, area: body.area, open_from: body.openFrom, open_to: body.openTo, rush_fee: body.rushFee, available: body.available === undefined ? undefined : body.available ? 1 : 0 };
      for (const [k, v] of Object.entries(cols)) if (v !== undefined) run(db, `UPDATE providers SET ${k} = ? WHERE id = ?`, v as string | number, p.id);
      if (body.services) {
        const keep = new Set<string>();
        for (const s of body.services) {
          // only ids that belong to THIS shop can be updated
          const owned = s.id && one(db, 'SELECT 1 FROM services WHERE id = ? AND provider_id = ?', s.id, p.id);
          if (owned) {
            run(db, 'UPDATE services SET name = ?, price = ?, minutes = ?, active = 1 WHERE id = ?', s.name, s.price, s.minutes, s.id!);
            keep.add(s.id!);
          } else {
            const nid = newId('s');
            run(db, 'INSERT INTO services (id, provider_id, name, price, minutes) VALUES (?,?,?,?,?)', nid, p.id, s.name, s.price, s.minutes);
            keep.add(nid);
          }
        }
        for (const old of all<{ id: string }>(db, 'SELECT id FROM services WHERE provider_id = ? AND active = 1', p.id)) {
          if (!keep.has(old.id)) run(db, 'UPDATE services SET active = 0 WHERE id = ?', old.id); // soft delete keeps old orders readable
        }
      }
      audit(db, { actorType: 'user', actorId: req.user!.sub, action: 'shop.updated', target: p.id, detail: { fields: Object.keys(body) }, ipHash: req.ipHash });
    });
    return publicProvider(db, one<ProviderRow>(db, 'SELECT * FROM providers WHERE id = ?', p.id)!);
  });

  /** Provider dashboard numbers, computed from real records. */
  app.get('/shop/dashboard', { preHandler: requireUser }, async (req) => {
    const p = myShop(db, req.user!.sub);
    const days = [...Array(7)].map((_, i) => new Date(Date.now() - (6 - i) * 86_400_000).toISOString().slice(0, 10));
    const visits = days.map((d) => one<{ count: number }>(db, 'SELECT count FROM visits WHERE provider_id = ? AND day = ?', p.id, d)?.count ?? 0);
    const orders = all<{ status: string; price: number; rush_fee: number; commission: number; created_at: number }>(db, 'SELECT status, price, rush_fee, commission, created_at FROM orders WHERE provider_id = ?', p.id);
    const answered = orders.filter((o) => !['requested', 'cancelled'].includes(o.status));
    const done = orders.filter((o) => o.status === 'delivered');
    const dist = [5, 4, 3, 2, 1].map((n) => ({ stars: n, count: one<{ n: number }>(db, 'SELECT COUNT(*) n FROM reviews WHERE provider_id = ? AND rating = ? AND removed_at IS NULL', p.id, n)!.n }));
    return {
      visits: days.map((d, i) => ({ day: d, count: visits[i] })),
      ordersTotal: orders.length,
      acceptRate: answered.length ? Math.round((answered.filter((o) => o.status !== 'declined').length / answered.length) * 100) : 100,
      earnings: done.reduce((s, o) => s + o.price + o.rush_fee - o.commission, 0),
      completed: done.length,
      rating: p.rating,
      ratingDistribution: dist,
    };
  });

  /* collaborations between providers */
  app.post('/collabs', { preHandler: requireUser, config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (req) => {
    const body = z.object({ toProviderId: z.string().max(64), message: z.string().trim().min(3).max(500) }).strict().parse(req.body);
    const me = myShop(db, req.user!.sub);
    if (body.toProviderId === me.id) throw new HttpError(400, 'bad_request', 'You can’t send a request to yourself.');
    if (!one(db, 'SELECT 1 FROM providers WHERE id = ? AND suspended = 0', body.toProviderId)) throw new HttpError(404, 'not_found', 'Provider not found.');
    const id = newId('c');
    run(db, 'INSERT INTO collabs (id, from_provider, to_provider, message, created_at) VALUES (?,?,?,?,?)', id, me.id, body.toProviderId, body.message, Date.now());
    return { id };
  });

  app.get('/collabs', { preHandler: requireUser }, async (req) => {
    const me = myShop(db, req.user!.sub);
    return all(db, 'SELECT c.id, c.from_provider AS fromProviderId, c.to_provider AS toProviderId, c.message, c.status, c.created_at AS createdAt, pf.name AS fromName, pt.name AS toName FROM collabs c JOIN providers pf ON pf.id = c.from_provider JOIN providers pt ON pt.id = c.to_provider WHERE c.from_provider = ? OR c.to_provider = ? ORDER BY c.created_at DESC', me.id, me.id);
  });

  app.post('/collabs/:id', { preHandler: requireUser }, async (req) => {
    const { id } = z.object({ id: z.string().max(64) }).parse(req.params);
    const { status } = z.object({ status: z.enum(['accepted', 'declined']) }).strict().parse(req.body);
    const me = myShop(db, req.user!.sub);
    const c = one<{ to_provider: string; status: string }>(db, 'SELECT to_provider, status FROM collabs WHERE id = ?', id);
    if (!c || c.to_provider !== me.id) throw new HttpError(404, 'not_found', 'Request not found.'); // only the recipient may answer
    if (c.status !== 'pending') throw new HttpError(409, 'already_answered', 'Already answered.');
    run(db, 'UPDATE collabs SET status = ? WHERE id = ?', status, id);
    return { ok: true };
  });
}
