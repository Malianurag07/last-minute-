import { randomBytes } from 'node:crypto';

import { audit } from '../audit.ts';
import { hashSecret } from '../crypto.ts';
import { one, openDb, run } from '../db.ts';
import { newId } from '../ids.ts';

/**
 * Bootstrap the first super admin from the server shell:
 *   npm run admin:create -- <username>
 * Prints a one-time temporary password. The admin must change it and set up
 * an authenticator app on first login.
 */
const username = (process.argv[2] ?? '').toLowerCase();
if (!/^[a-z][a-z0-9._-]{2,30}$/.test(username)) {
  console.error('Usage: npm run admin:create -- <username>');
  process.exit(1);
}
const db = openDb();
if (one(db, 'SELECT 1 FROM admins WHERE username = ?', username)) {
  console.error('That username already exists.');
  process.exit(1);
}
const temp = randomBytes(12).toString('base64url');
const id = newId('adm');
run(db, "INSERT INTO admins (id, username, pass_hash, role, created_at) VALUES (?,?,?,'super_admin',?)", id, username, await hashSecret(temp), Date.now());
audit(db, { actorType: 'system', actorId: 'cli', action: 'admin.bootstrap', target: id });
console.log(`Super admin "${username}" created. Temporary password (shown once): ${temp}`);
