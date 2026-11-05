import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { HttpError, requireUser } from '../app.ts';
import { audit } from '../audit.ts';
import { decrypt, encrypt } from '../crypto.ts';
import { all, one, run, tx, type DB } from '../db.ts';
import { getQuotes, PARTNERS } from '../delivery.ts';
import { ACTIVE_STATUSES, canTransition, maskPhone, ORDER_STATUSES, type OrderStatus } from '../domain.ts';
import { newId } from '../ids.ts';
import { quote } from '../pricing.ts';
import { distanceFor, type ProviderRow } from './catalog.ts';
import { currentConsents } from './me.ts';

interface OrderRow {
  id: string; provider_id: string; customer_id: string; service_id: string; service_name: string;
  price: number; rush_fee: number; delivery_fee: number; platform_fee: number; commission: number;
  need_by: number; notes_enc: string | null; handover: 'delivery' | 'self'; address_enc: string | null;
  delivery: string | null; status: OrderStatus; created_at: number; updated_at: number;
}

type Viewer = 'customer' | 'provider' | 'admin';

/**
 * Serialises an order for one viewer. The provider sees the customer's
 * phone and address only while the order is active (data minimisation);
 * after that they are masked.
 */
export function orderView(db: DB, o: OrderRow, viewer: Viewer) {
  const active = ACTIVE_STATUSES.includes(o.status);
  const cust = one<{ name_enc: string | null; phone_enc: string | null; status: string }>(db, 'SELECT name_enc, phone_enc, status FROM users WHERE id = ?', o.customer_id);
  const custName = cust?.name_enc ? decrypt(cust.name_enc, `users.name:${o.customer_id}`) : 'Former customer';
  const custPhone = cust?.phone_enc ? decrypt(cust.phone_enc, `users.phone:${o.customer_id}`) : '';
  const prov = one<{ name: string; phone_enc: string | null }>(db, 'SELECT name, phone_enc FROM providers WHERE id = ?', o.provider_id);
  const showContact = viewer === 'customer' || (viewer === 'provider' && active);
  return {
    id: o.id,
    providerId: o.provider_id,
    providerName: prov?.name ?? '',
    providerPhone: viewer === 'customer' && active && prov?.phone_enc ? decrypt(prov.phone_enc, `providers.phone:${o.provider_id}`) : undefined,
    serviceId: o.service_id,
    serviceName: o.service_name,
    price: o.price,
    rushFee: o.rush_fee,
    deliveryFee: o.delivery_fee,
    platformFee: o.platform_fee,
    ...(viewer !== 'customer' ? { commission: o.commission, providerPayout: o.price + o.rush_fee - o.commission } : {}),
    needBy: new Date(o.need_by).toISOString(),
    createdAt: new Date(o.created_at).toISOString(),
    handover: o.handover,
    delivery: o.delivery ? JSON.parse(o.delivery) : undefined,
    status: o.status,
    customerName: viewer === 'customer' ? custName : custName.split(' ')[0],
    customerPhone: showContact ? custPhone : maskPhone(custPhone),
    address: showContact ? decrypt(o.address_enc, `orders.address:${o.id}`) : '',
    notes: decrypt(o.notes_enc, `orders.notes:${o.id}`),
    history: all<{ status: string; at: number }>(db, 'SELECT status, at FROM order_events WHERE order_id = ? ORDER BY at', o.id).map((h) => ({ status: h.status, at: new Date(h.at).toISOString() })),
    review: one(db, 'SELECT rating, text FROM reviews WHERE order_id = ? AND removed_at IS NULL', o.id) ?? undefined,
  };
}

/** Which side of this order is the caller on? Anyone else gets 404 (no hint the order exists). */
function roleIn(db: DB, o: OrderRow, userId: string): 'customer' | 'provider' {
  if (o.customer_id === userId) return 'customer';
  const p = one<{ owner_user_id: string }>(db, 'SELECT owner_user_id FROM providers WHERE id = ?', o.provider_id);
  if (p?.owner_user_id === userId) return 'provider';
  throw new HttpError(404, 'not_found', 'Order not found.');
}

export function addEvent(db: DB, orderId: string, status: string, actorType: string, actorId: string) {
  run(db, 'INSERT INTO order_events (id, order_id, status, actor_type, actor_id, at) VALUES (?,?,?,?,?,?)', newId('ev'), orderId, status, actorType, actorId, Date.now());
}

export async function orderRoutes(app: FastifyInstance) {
  const db = app.db;
  const load = (id: string) => {
    const o = one<OrderRow>(db, 'SELECT * FROM orders WHERE id = ?', id);
    if (!o) throw new HttpError(404, 'not_found', 'Order not found.');
    return o;
  };

  /** Place an order. The client sends only choices; every rupee is computed here. */
  app.post('/orders', { preHandler: requireUser, config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (req) => {
    const body = z
      .object({
        providerId: z.string().max(64),
        serviceId: z.string().max(64),
        needBy: z.iso.datetime(),
        notes: z.string().trim().max(500).default(''),
        handover: z.enum(['delivery', 'self']),
        deliveryPartnerId: z.enum(PARTNERS.map((p) => p.id) as [string, ...string[]]).optional(),
      })
      .strict()
      .parse(req.body);
    const uid = req.user!.sub;
    if (!currentConsents(db, uid).order_sharing?.granted) throw new HttpError(403, 'consent_required', 'Allow sharing your details with the provider to place orders.');
    const p = one<ProviderRow>(db, 'SELECT * FROM providers WHERE id = ?', body.providerId);
    if (!p || p.suspended) throw new HttpError(404, 'not_found', 'This provider is not available right now.');
    if (!p.available) throw new HttpError(409, 'unavailable', 'This provider is not taking orders right now.');
    if (p.owner_user_id === uid) throw new HttpError(400, 'own_shop', 'You can’t order from your own shop.');
    const svc = one<{ id: string; name: string; price: number }>(db, 'SELECT id, name, price FROM services WHERE id = ? AND provider_id = ? AND active = 1', body.serviceId, p.id);
    if (!svc) throw new HttpError(400, 'bad_service', 'That service is not offered any more.');
    const needBy = Date.parse(body.needBy);
    const minutes = Math.round((needBy - Date.now()) / 60000);
    if (minutes < 15 || minutes > 7 * 24 * 60) throw new HttpError(400, 'bad_deadline', 'Pick a time between 15 minutes and 7 days from now.');
    const user = one<{ address_enc: string | null }>(db, 'SELECT address_enc FROM users WHERE id = ?', uid)!;
    const address = decrypt(user.address_enc, `users.address:${uid}`);
    if (body.handover === 'delivery' && !address) throw new HttpError(400, 'address_required', 'Add your address in Profile first.');

    let delivery: { partnerId: string; partnerName: string; vehicle: string; price: number; etaMins: number; leg: string } | undefined;
    if (body.handover === 'delivery') {
      const quotes = getQuotes(distanceFor(p), 2);
      const q = quotes.find((x) => x.partner.id === body.deliveryPartnerId) ?? quotes[0];
      delivery = { partnerId: q.partner.id, partnerName: q.partner.name, vehicle: q.partner.vehicle, price: q.price, etaMins: q.etaMins, leg: 'both' };
    }
    const money = quote({ price: svc.price, rushFee: p.rush_fee, minutesUntilDue: minutes, deliveryFee: delivery?.price ?? 0, providerAgeDays: (Date.now() - p.created_at) / 86_400_000 });
    const id = newId('o');
    const now = Date.now();
    tx(db, () => {
      run(db, `INSERT INTO orders (id, provider_id, customer_id, service_id, service_name, price, rush_fee, delivery_fee, platform_fee, commission, need_by, notes_enc, handover, address_enc, delivery, status, created_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        id, p.id, uid, svc.id, svc.name, money.price, money.rushFee, money.deliveryFee, money.platformFee, money.commission, needBy,
        encrypt(body.notes, `orders.notes:${id}`), body.handover, body.handover === 'delivery' ? encrypt(address, `orders.address:${id}`) : null,
        delivery ? JSON.stringify(delivery) : null, 'requested', now, now);
      addEvent(db, id, 'requested', 'customer', uid);
      audit(db, { actorType: 'user', actorId: uid, action: 'order.created', target: id, ipHash: req.ipHash });
    });
    return orderView(db, load(id), 'customer');
  });

  app.get('/orders', { preHandler: requireUser }, async (req) =>
    all<OrderRow>(db, 'SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC LIMIT 200', req.user!.sub).map((o) => orderView(db, o, 'customer')),
  );

  app.get('/shop/orders', { preHandler: requireUser }, async (req) => {
    const p = one<{ id: string }>(db, 'SELECT id FROM providers WHERE owner_user_id = ?', req.user!.sub);
    if (!p) return [];
    return all<OrderRow>(db, 'SELECT * FROM orders WHERE provider_id = ? ORDER BY need_by ASC LIMIT 200', p.id).map((o) => orderView(db, o, 'provider'));
  });

  app.get('/orders/:id', { preHandler: requireUser }, async (req) => {
    const { id } = z.object({ id: z.string().max(64) }).parse(req.params);
    const o = load(id);
    return orderView(db, o, roleIn(db, o, req.user!.sub));
  });

  /** Move an order along. The allowed moves depend on who you are in this order. */
  app.post('/orders/:id/status', { preHandler: requireUser }, async (req) => {
    const { id } = z.object({ id: z.string().max(64) }).parse(req.params);
    const { status } = z.object({ status: z.enum(ORDER_STATUSES) }).strict().parse(req.body);
    const o = load(id);
    const role = roleIn(db, o, req.user!.sub);
    if (!canTransition(o.status, status, role)) throw new HttpError(409, 'bad_transition', 'That step is not possible right now.');
    tx(db, () => {
      // optimistic check: only update if nobody changed it meanwhile
      const r = run(db, 'UPDATE orders SET status = ?, updated_at = ? WHERE id = ? AND status = ?', status, Date.now(), id, o.status);
      if (r.changes !== 1) throw new HttpError(409, 'conflict', 'This order just changed. Please refresh.');
      addEvent(db, id, status, role, req.user!.sub);
      if (status === 'delivered') run(db, 'UPDATE providers SET jobs_done = jobs_done + 1 WHERE id = ?', o.provider_id);
      audit(db, { actorType: 'user', actorId: req.user!.sub, action: 'order.status', target: id, detail: { from: o.status, to: status, as: role }, ipHash: req.ipHash });
    });
    return orderView(db, load(id), role);
  });

  /** Record which delivery partner was booked (pickup by customer, drop by provider). */
  app.post('/orders/:id/delivery', { preHandler: requireUser }, async (req) => {
    const { id } = z.object({ id: z.string().max(64) }).parse(req.params);
    const body = z.object({ partnerId: z.enum(PARTNERS.map((p) => p.id) as [string, ...string[]]), leg: z.enum(['pickup', 'drop']) }).strict().parse(req.body);
    const o = load(id);
    const role = roleIn(db, o, req.user!.sub);
    if (o.handover !== 'delivery') throw new HttpError(400, 'no_delivery', 'This order is not using delivery.');
    if (body.leg === 'pickup' && !(role === 'customer' && o.status === 'accepted')) throw new HttpError(409, 'bad_transition', 'Pickup can be booked after the provider accepts.');
    if (body.leg === 'drop' && !(role === 'provider' && o.status === 'ready')) throw new HttpError(409, 'bad_transition', 'The return ride can be booked when the work is ready.');
    const q = getQuotes(distanceFor({ id: o.provider_id }), 1).find((x) => x.partner.id === body.partnerId)!;
    const delivery = { partnerId: q.partner.id, partnerName: q.partner.name, vehicle: q.partner.vehicle, price: q.price, etaMins: q.etaMins, leg: body.leg };
    tx(db, () => {
      run(db, 'UPDATE orders SET delivery = ?, updated_at = ? WHERE id = ?', JSON.stringify(delivery), Date.now(), id);
      if (body.leg === 'pickup') {
        run(db, "UPDATE orders SET status = 'pickup' WHERE id = ?", id);
        addEvent(db, id, 'pickup', role, req.user!.sub);
      }
    });
    return orderView(db, load(id), role);
  });

  /** One review per completed order, only by the customer who placed it. */
  app.post('/orders/:id/review', { preHandler: requireUser, config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (req) => {
    const { id } = z.object({ id: z.string().max(64) }).parse(req.params);
    const body = z.object({ rating: z.number().int().min(1).max(5), text: z.string().trim().max(500).default('') }).strict().parse(req.body);
    const o = load(id);
    if (roleIn(db, o, req.user!.sub) !== 'customer') throw new HttpError(403, 'forbidden', 'Only the customer can review.');
    if (o.status !== 'delivered') throw new HttpError(409, 'not_completed', 'You can review once the work is done.');
    if (one(db, 'SELECT 1 FROM reviews WHERE order_id = ?', id)) throw new HttpError(409, 'already_reviewed', 'You already reviewed this order.');
    const u = one<{ name_enc: string }>(db, 'SELECT name_enc FROM users WHERE id = ?', req.user!.sub)!;
    const full = decrypt(u.name_enc, `users.name:${req.user!.sub}`);
    const display = `${full.split(' ')[0]} ${full.split(' ')[1]?.[0] ? `${full.split(' ')[1][0]}.` : ''}`.trim();
    tx(db, () => {
      run(db, 'INSERT INTO reviews (id, order_id, provider_id, customer_id, author_display, rating, text, created_at) VALUES (?,?,?,?,?,?,?,?)', newId('rv'), id, o.provider_id, req.user!.sub, display, body.rating, body.text, Date.now());
      recomputeRating(db, o.provider_id);
    });
    return orderView(db, load(id), 'customer');
  });
}

export function recomputeRating(db: DB, providerId: string) {
  const r = one<{ avg: number | null; n: number }>(db, 'SELECT AVG(rating) avg, COUNT(*) n FROM reviews WHERE provider_id = ? AND removed_at IS NULL', providerId)!;
  run(db, 'UPDATE providers SET rating = ?, review_count = ? WHERE id = ?', r.avg ? Math.round(r.avg * 10) / 10 : 0, r.n, providerId);
}
