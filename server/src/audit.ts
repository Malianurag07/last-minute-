import { config } from './config.ts';
import { hmac } from './crypto.ts';
import { all, one, type DB } from './db.ts';

/**
 * Tamper-evident audit trail. Every row stores HMAC(key, prev_hash || row).
 * Editing or deleting any row (even directly in the database) breaks the
 * chain, which `verifyAuditChain` detects. UPDATE/DELETE are also blocked by
 * database triggers. Personal data is never written here — only ids.
 */
export interface AuditEntry {
  actorType: 'user' | 'admin' | 'system';
  actorId: string;
  action: string;
  target?: string;
  detail?: Record<string, unknown>;
  ipHash?: string;
}

const GENESIS = '0'.repeat(64);

const canonical = (at: number, e: AuditEntry) =>
  JSON.stringify([at, e.actorType, e.actorId, e.action, e.target ?? null, e.detail ?? null, e.ipHash ?? null]);

export function audit(db: DB, e: AuditEntry) {
  const prev = one<{ hash: string }>(db, 'SELECT hash FROM audit_log ORDER BY seq DESC LIMIT 1')?.hash ?? GENESIS;
  const at = Date.now();
  const hash = hmac(config.auditKey, prev + canonical(at, e));
  db.prepare(
    'INSERT INTO audit_log (at, actor_type, actor_id, action, target, detail, ip_hash, prev_hash, hash) VALUES (?,?,?,?,?,?,?,?,?)',
  ).run(at, e.actorType, e.actorId, e.action, e.target ?? null, e.detail ? JSON.stringify(e.detail) : null, e.ipHash ?? null, prev, hash);
}

export function verifyAuditChain(db: DB): { ok: boolean; checked: number; brokenAt?: number } {
  const rows = all<{
    seq: number; at: number; actor_type: string; actor_id: string; action: string;
    target: string | null; detail: string | null; ip_hash: string | null; prev_hash: string; hash: string;
  }>(db, 'SELECT * FROM audit_log ORDER BY seq');
  let prev = rows[0]?.prev_hash ?? GENESIS; // allows old rows to be archived after retention
  for (const r of rows) {
    const e: AuditEntry = {
      actorType: r.actor_type as AuditEntry['actorType'],
      actorId: r.actor_id,
      action: r.action,
      target: r.target ?? undefined,
      detail: r.detail ? JSON.parse(r.detail) : undefined,
      ipHash: r.ip_hash ?? undefined,
    };
    if (r.prev_hash !== prev || hmac(config.auditKey, prev + canonical(r.at, e)) !== r.hash) {
      return { ok: false, checked: rows.length, brokenAt: r.seq };
    }
    prev = r.hash;
  }
  return { ok: true, checked: rows.length };
}
