import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { HttpError } from '../app.ts';
import { all, one, run, type DB } from '../db.ts';
import { getQuotes } from '../delivery.ts';
import { CATEGORY_IDS } from '../domain.ts';

export interface ProviderRow {
  id: string;
  owner_user_id: string | null;
  name: string;
  category_id: string;
  bio: string;
  area: string;
  lat: number | null;
  lng: number | null;
  rush_fee: number;
  open_from: string;
  open_to: string;
  available: number;
  verified: number;
  suspended: number;
  rating: number;
  review_count: number;
  jobs_done: number;
  languages: string;
  created_at: number;
}

/** Public view of a shop. Never includes the owner's phone or user id. */
export function publicProvider(db: DB, p: ProviderRow, withReviews = false) {
  return {
    id: p.id,
    name: p.name,
    categoryId: p.category_id,
    bio: p.bio,
    area: p.area,
    distanceKm: distanceFor(p),
    rushFee: p.rush_fee,
    openFrom: p.open_from,
    openTo: p.open_to,
    available: !!p.available,
    verified: !!p.verified,
    rating: p.rating,
    reviewCount: p.review_count,
    jobsDone: p.jobs_done,
    languages: JSON.parse(p.languages) as string[],
    services: all<{ id: string; name: string; price: number; minutes: number }>(db, 'SELECT id, name, price, minutes FROM services WHERE provider_id = ? AND active = 1', p.id),
    ...(withReviews
      ? {
          reviews: all(db, 'SELECT id, author_display AS author, rating, text, created_at AS date FROM reviews WHERE provider_id = ? AND removed_at IS NULL ORDER BY created_at DESC LIMIT 50', p.id),
        }
      : {}),
  };
}

/** Placeholder until real geolocation: a stable pseudo-distance per shop. */
export function distanceFor(p: { id: string }) {
  let h = 0;
  for (const ch of p.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return Math.round((0.5 + (h % 50) / 10) * 10) / 10;
}

export async function catalogRoutes(app: FastifyInstance) {
  const db = app.db;

  app.get('/providers', async (req) => {
    const q = z
      .object({ category: z.enum(CATEGORY_IDS).optional(), q: z.string().max(60).optional() })
      .parse(req.query);
    const rows = all<ProviderRow>(db, 'SELECT * FROM providers WHERE suspended = 0 ORDER BY verified DESC, rating DESC LIMIT 200');
    const words = (q.q ?? '').toLowerCase().split(/\s+/).filter(Boolean);
    return rows
      .filter((p) => !q.category || p.category_id === q.category)
      .map((p) => publicProvider(db, p))
      .filter((p) => !words.length || words.every((w) => `${p.name} ${p.bio} ${p.area} ${p.services.map((s) => s.name).join(' ')}`.toLowerCase().includes(w)));
  });

  app.get('/providers/:id', async (req) => {
    const { id } = z.object({ id: z.string().max(64) }).parse(req.params);
    const p = one<ProviderRow>(db, 'SELECT * FROM providers WHERE id = ? AND suspended = 0', id);
    if (!p) throw new HttpError(404, 'not_found', 'This provider is not available right now.');
    const day = new Date().toISOString().slice(0, 10);
    run(db, 'INSERT INTO visits (provider_id, day, count) VALUES (?, ?, 1) ON CONFLICT DO UPDATE SET count = count + 1', id, day);
    return publicProvider(db, p, true);
  });

  app.get('/providers/:id/delivery-quotes', async (req) => {
    const { id } = z.object({ id: z.string().max(64) }).parse(req.params);
    const { legs } = z.object({ legs: z.coerce.number().pipe(z.union([z.literal(1), z.literal(2)])).default(2) }).parse(req.query);
    const p = one<ProviderRow>(db, 'SELECT id FROM providers WHERE id = ? AND suspended = 0', id);
    if (!p) throw new HttpError(404, 'not_found', 'Provider not found.');
    return getQuotes(distanceFor(p), legs).map((q) => ({ partnerId: q.partner.id, name: q.partner.name, vehicle: q.partner.vehicle, price: q.price, etaMins: q.etaMins, reliability: q.partner.reliability, tags: q.tags }));
  });
}
