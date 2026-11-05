import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import { config } from './config.ts';

/**
 * SQLite via Node's built-in driver. Personal data columns end in _enc and are
 * AES-GCM encrypted by the app layer; phone numbers are only stored as a keyed
 * HMAC index plus ciphertext. Swap for Postgres in production by keeping the
 * same table layout.
 */
export type DB = DatabaseSync;

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA secure_delete = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  phone_idx TEXT UNIQUE,
  phone_enc TEXT,
  name_enc TEXT,
  address_enc TEXT,
  pin_hash TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked','erased')),
  is_adult INTEGER NOT NULL DEFAULT 0,
  token_version INTEGER NOT NULL DEFAULT 0,
  pin_fail_count INTEGER NOT NULL DEFAULT 0,
  pin_locked_until INTEGER,
  created_at INTEGER NOT NULL,
  last_login_at INTEGER
);

CREATE TABLE IF NOT EXISTS otps (
  id TEXT PRIMARY KEY,
  phone_idx TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('signup','login','reset')),
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  consumed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS otps_phone ON otps(phone_idx, purpose);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id TEXT PRIMARY KEY,
  realm TEXT NOT NULL CHECK (realm IN ('user','admin')),
  subject_id TEXT NOT NULL,
  family_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL,
  revoked_at INTEGER,
  replaced_by TEXT
);
CREATE INDEX IF NOT EXISTS rt_family ON refresh_tokens(family_id);

CREATE TABLE IF NOT EXISTS trusted_devices (
  user_id TEXT NOT NULL REFERENCES users(id),
  device_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, device_hash)
);

CREATE TABLE IF NOT EXISTS consents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  purpose TEXT NOT NULL,
  notice_version TEXT NOT NULL,
  granted INTEGER NOT NULL,
  at INTEGER NOT NULL,
  channel TEXT NOT NULL DEFAULT 'app'
);
CREATE INDEX IF NOT EXISTS consents_user ON consents(user_id, purpose, at);

CREATE TABLE IF NOT EXISTS nominees (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  name_enc TEXT NOT NULL,
  phone_enc TEXT NOT NULL,
  relation TEXT NOT NULL,
  at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT UNIQUE REFERENCES users(id),
  name TEXT NOT NULL,
  category_id TEXT NOT NULL,
  bio TEXT NOT NULL DEFAULT '',
  area TEXT NOT NULL,
  lat REAL, lng REAL,
  rush_fee INTEGER NOT NULL DEFAULT 0,
  open_from TEXT NOT NULL,
  open_to TEXT NOT NULL,
  available INTEGER NOT NULL DEFAULT 1,
  verified INTEGER NOT NULL DEFAULT 0,
  suspended INTEGER NOT NULL DEFAULT 0,
  rating REAL NOT NULL DEFAULT 0,
  review_count INTEGER NOT NULL DEFAULT 0,
  jobs_done INTEGER NOT NULL DEFAULT 0,
  languages TEXT NOT NULL DEFAULT '[]',
  phone_enc TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES providers(id),
  name TEXT NOT NULL,
  price INTEGER NOT NULL CHECK (price BETWEEN 1 AND 100000),
  minutes INTEGER NOT NULL CHECK (minutes BETWEEN 1 AND 10080),
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS visits (
  provider_id TEXT NOT NULL REFERENCES providers(id),
  day TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (provider_id, day)
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES providers(id),
  customer_id TEXT NOT NULL REFERENCES users(id),
  service_id TEXT NOT NULL,
  service_name TEXT NOT NULL,
  price INTEGER NOT NULL,
  rush_fee INTEGER NOT NULL,
  delivery_fee INTEGER NOT NULL,
  platform_fee INTEGER NOT NULL,
  commission INTEGER NOT NULL,
  need_by INTEGER NOT NULL,
  notes_enc TEXT,
  handover TEXT NOT NULL CHECK (handover IN ('delivery','self')),
  address_enc TEXT,
  delivery TEXT,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  pii_purged_at INTEGER
);
CREATE INDEX IF NOT EXISTS orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS orders_provider ON orders(provider_id);

CREATE TABLE IF NOT EXISTS order_events (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  status TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  order_id TEXT UNIQUE REFERENCES orders(id),
  provider_id TEXT NOT NULL REFERENCES providers(id),
  customer_id TEXT,
  author_display TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  text TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  removed_at INTEGER,
  removed_by TEXT,
  removed_reason TEXT
);

CREATE TABLE IF NOT EXISTS collabs (
  id TEXT PRIMARY KEY,
  from_provider TEXT NOT NULL REFERENCES providers(id),
  to_provider TEXT NOT NULL REFERENCES providers(id),
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS admins (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  pass_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('super_admin','ops','support','auditor')),
  totp_secret_enc TEXT,
  totp_enabled INTEGER NOT NULL DEFAULT 0,
  totp_last_counter INTEGER NOT NULL DEFAULT 0,
  fail_count INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER,
  disabled INTEGER NOT NULL DEFAULT 0,
  must_change_password INTEGER NOT NULL DEFAULT 1,
  token_version INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_login_at INTEGER
);

CREATE TABLE IF NOT EXISTS audit_log (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT,
  ip_hash TEXT,
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL
);
-- the audit log is append-only: block edits and deletes at the database level too
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit log is append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_log WHEN OLD.at > (strftime('%s','now') - 3*365*86400) * 1000
  BEGIN SELECT RAISE(ABORT, 'audit entries are retained for 3 years'); END;

CREATE TABLE IF NOT EXISTS privacy_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  type TEXT NOT NULL CHECK (type IN ('access','correction','erasure','grievance','nominee','consent_withdrawal')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','rejected')),
  detail_enc TEXT,
  created_at INTEGER NOT NULL,
  due_at INTEGER NOT NULL,
  resolved_at INTEGER,
  resolution TEXT,
  handled_by TEXT
);

CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  personal_data INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','contained','closed')),
  detected_at INTEGER NOT NULL,
  board_notified_at INTEGER,
  users_notified_at INTEGER,
  created_by TEXT NOT NULL
);
`;

export function openDb(path = config.dbPath): DB {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  return db;
}

/* small typed helpers */
export const one = <T>(db: DB, sql: string, ...p: SQLInputValue[]) => db.prepare(sql).get(...p) as T | undefined;
export const all = <T>(db: DB, sql: string, ...p: SQLInputValue[]) => db.prepare(sql).all(...p) as T[];
export const run = (db: DB, sql: string, ...p: SQLInputValue[]) => db.prepare(sql).run(...p);

export function tx<T>(db: DB, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
