import { audit } from './audit.ts';
import { config } from './config.ts';
import { run, type DB } from './db.ts';

const DAY = 86_400_000;

/**
 * Storage limitation (DPDP Act s.8(7)): delete data once its purpose is over.
 * Runs daily. Each sweep is recorded in the audit log.
 */
export function runRetention(db: DB, now = Date.now()) {
  const r: Record<string, number | bigint> = {
    otps: run(db, 'DELETE FROM otps WHERE expires_at < ?', now - DAY).changes,
    refreshTokens: run(db, 'DELETE FROM refresh_tokens WHERE expires_at < ? OR (revoked_at IS NOT NULL AND revoked_at < ?)', now, now - 30 * DAY).changes,
    // contact details on finished orders are only needed for disputes: drop them after 90 days
    orderPii: run(db, "UPDATE orders SET notes_enc = NULL, address_enc = NULL, pii_purged_at = ? WHERE pii_purged_at IS NULL AND status IN ('delivered','declined','cancelled') AND updated_at < ?", now, now - 90 * DAY).changes,
    visits: run(db, 'DELETE FROM visits WHERE day < ?', new Date(now - 400 * DAY).toISOString().slice(0, 10)).changes,
    trustedDevices: run(db, 'DELETE FROM trusted_devices WHERE last_seen_at < ?', now - 180 * DAY).changes,
    oldAudit: 0,
  };
  // audit rows older than the retention period may be archived (the delete trigger allows it)
  r.oldAudit = Number(run(db, 'DELETE FROM audit_log WHERE at < ?', now - config.retention.auditYears * 365 * DAY).changes);
  audit(db, { actorType: 'system', actorId: 'retention', action: 'retention.sweep', detail: Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Number(v)])) });
  return r;
}
