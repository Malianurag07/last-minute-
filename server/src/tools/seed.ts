import { audit } from '../audit.ts';
import { isProd } from '../config.ts';
import { encrypt, hashSecret, phoneIndex } from '../crypto.ts';
import { one, run, tx, type DB } from '../db.ts';
import { newId } from '../ids.ts';
import { readFileSync } from 'node:fs';

interface DemoProvider {
  name: string; phone: string; categoryId: string; bio: string; area: string; rushFee: number;
  services: { name: string; price: number; minutes: number }[]; rating: number;
  reviews: { author: string; rating: number; text: string; date: string }[];
  jobsDone: number; languages: string[]; openFrom: string; openTo: string; verified: boolean; visits: number[];
}
const SEED_PROVIDERS = JSON.parse(readFileSync(new URL('./demo-providers.json', import.meta.url), 'utf8')) as DemoProvider[];

/** Demo logins for development only (all user PINs: 2580). */
export const DEMO = {
  pin: '2580',
  customerPhone: '9000012345',
  providerPhone: '9820011111',
  admin: { username: 'superadmin', tempPassword: 'Demo-Temp-Pass-2026' },
};

const DAY = 86_400_000;

export async function seedDemo(db: DB) {
  if (isProd) throw new Error('Refusing to seed demo data in production');
  if (one(db, 'SELECT 1 FROM users LIMIT 1')) return false;
  const pinHash = await hashSecret(DEMO.pin);
  const adminHash = await hashSecret(DEMO.admin.tempPassword);
  const now = Date.now();
  tx(db, () => {
    const addUser = (name: string, phone: string, address = '') => {
      const id = newId('u');
      run(db, 'INSERT INTO users (id, phone_idx, phone_enc, name_enc, address_enc, pin_hash, is_adult, created_at) VALUES (?,?,?,?,?,?,1,?)',
        id, phoneIndex(phone), encrypt(phone, `users.phone:${id}`), encrypt(name, `users.name:${id}`), encrypt(address, `users.address:${id}`), pinHash, now - 40 * DAY);
      for (const purpose of ['account', 'order_sharing']) run(db, 'INSERT INTO consents (id, user_id, purpose, notice_version, granted, at) VALUES (?,?,?,?,1,?)', newId('cs'), id, purpose, '2026-11-01', now);
      return id;
    };
    const priya = addUser('Priya Sharma', DEMO.customerPhone, 'Flat 4B, Sai Residency, FC Road');

    SEED_PROVIDERS.forEach((sp, i) => {
      const phone = sp.phone.replace(/\D/g, '').slice(-10);
      const owner = i === 0 ? addUser('Kamala Joshi', DEMO.providerPhone, 'Shivaji Nagar') : addUser(sp.name.split(/['’ ]/)[0], phone);
      const pid = newId('p');
      run(db, 'INSERT INTO providers (id, owner_user_id, name, category_id, bio, area, rush_fee, open_from, open_to, available, verified, rating, review_count, jobs_done, languages, phone_enc, created_at) VALUES (?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,?,?)',
        pid, owner, sp.name, sp.categoryId, sp.bio, sp.area, sp.rushFee, sp.openFrom, sp.openTo, sp.verified ? 1 : 0, sp.rating, sp.reviews.length, sp.jobsDone, JSON.stringify(sp.languages), encrypt(phone, `providers.phone:${pid}`), now - 200 * DAY);
      const svcIds = sp.services.map((s) => {
        const sid = newId('s');
        run(db, 'INSERT INTO services (id, provider_id, name, price, minutes) VALUES (?,?,?,?,?)', sid, pid, s.name, s.price, s.minutes);
        return sid;
      });
      sp.reviews.forEach((r) => run(db, 'INSERT INTO reviews (id, provider_id, author_display, rating, text, created_at) VALUES (?,?,?,?,?,?)', newId('rv'), pid, r.author, r.rating, r.text, Date.parse(r.date)));
      sp.visits.forEach((v, d) => run(db, 'INSERT INTO visits (provider_id, day, count) VALUES (?,?,?)', pid, new Date(now - (6 - d) * DAY).toISOString().slice(0, 10), v));
      if (i === 0) {
        const oid = newId('o');
        run(db, `INSERT INTO orders (id, provider_id, customer_id, service_id, service_name, price, rush_fee, delivery_fee, platform_fee, commission, need_by, notes_enc, handover, address_enc, delivery, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'requested',?,?)`,
          oid, pid, priya, svcIds[0], sp.services[0].name, 450, 50, 80, 9, 64, now + 3 * 3600_000, encrypt('Wedding tonight at 8. Measurements same as the old blouse I am sending.', `orders.notes:${oid}`), 'delivery',
          encrypt('Flat 4B, Sai Residency, FC Road', `orders.address:${oid}`), JSON.stringify({ partnerId: 'rapido', partnerName: 'Rapido Parcel', vehicle: 'Bike', price: 80, etaMins: 8, leg: 'both' }), now - 600_000, now - 600_000);
        run(db, 'INSERT INTO order_events (id, order_id, status, actor_type, actor_id, at) VALUES (?,?,?,?,?,?)', newId('ev'), oid, 'requested', 'customer', priya, now - 600_000);
      }
    });

    run(db, "INSERT INTO admins (id, username, pass_hash, role, created_at) VALUES (?,?,?,'super_admin',?)", newId('adm'), DEMO.admin.username, adminHash, now);
    audit(db, { actorType: 'system', actorId: 'seed', action: 'seed.demo' });
  });
  console.info(`Demo data loaded. Users PIN ${DEMO.pin}; admin "${DEMO.admin.username}" / temporary password "${DEMO.admin.tempPassword}" (must change + enrol 2FA).`);
  return true;
}
