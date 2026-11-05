import { jwtVerify, SignJWT } from 'jose';

import { audit } from './audit.ts';
import { config } from './config.ts';
import { randomToken, sha256 } from './crypto.ts';
import { one, run, tx, type DB } from './db.ts';
import { newId } from './ids.ts';

export type Realm = 'user' | 'admin';

export interface AccessClaims {
  sub: string;
  realm: Realm;
  tv: number; // token version — bump to revoke every token for a subject
  role?: string;
  sid: string; // refresh family = session id
}

const ISSUER = 'lastminute-api';

export async function signAccess(c: AccessClaims) {
  return new SignJWT({ realm: c.realm, tv: c.tv, role: c.role, sid: c.sid })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(c.sub)
    .setIssuer(ISSUER)
    .setAudience(c.realm)
    .setIssuedAt()
    .setExpirationTime(`${c.realm === 'admin' ? config.adminAccessTtlSec : config.accessTtlSec}s`)
    .setJti(newId('jt'))
    .sign(config.jwtSecret);
}

export async function verifyAccess(token: string, realm: Realm): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, config.jwtSecret, {
      issuer: ISSUER,
      audience: realm,
      algorithms: ['HS256'], // never accept "none" or asymmetric confusion
    });
    if (payload.realm !== realm || typeof payload.sub !== 'string') return null;
    return { sub: payload.sub, realm, tv: Number(payload.tv), role: payload.role as string | undefined, sid: String(payload.sid) };
  } catch {
    return null;
  }
}

/** Creates a new refresh-token family (one per login / device). */
export function newRefresh(db: DB, realm: Realm, subjectId: string, familyId = newId('fam')) {
  const token = randomToken(32);
  const now = Date.now();
  run(
    db,
    'INSERT INTO refresh_tokens (id, realm, subject_id, family_id, token_hash, expires_at, last_used_at) VALUES (?,?,?,?,?,?,?)',
    newId('rt'),
    realm,
    subjectId,
    familyId,
    sha256(token),
    now + config.refreshTtlSec * 1000,
    now,
  );
  return { token, familyId };
}

interface RtRow {
  id: string;
  realm: Realm;
  subject_id: string;
  family_id: string;
  expires_at: number;
  last_used_at: number;
  revoked_at: number | null;
}

/**
 * Rotate a refresh token. Reuse of an already-rotated token means it was
 * stolen: the whole family is revoked and the subject is signed out everywhere.
 */
export function rotateRefresh(db: DB, token: string, realm: Realm): { subjectId: string; familyId: string; token: string } | 'invalid' | 'reuse' | 'idle' {
  const row = one<RtRow>(db, 'SELECT * FROM refresh_tokens WHERE token_hash = ?', sha256(token));
  if (!row || row.realm !== realm) return 'invalid';
  const now = Date.now();
  if (row.revoked_at) {
    tx(db, () => {
      run(db, 'UPDATE refresh_tokens SET revoked_at = ? WHERE family_id = ? AND revoked_at IS NULL', now, row.family_id);
      bumpTokenVersion(db, realm, row.subject_id);
      audit(db, { actorType: 'system', actorId: 'auth', action: 'refresh_token_reuse_detected', target: `${realm}:${row.subject_id}` });
    });
    return 'reuse';
  }
  if (row.expires_at < now) return 'invalid';
  if (realm === 'admin' && now - row.last_used_at > config.adminIdleTimeoutSec * 1000) {
    run(db, 'UPDATE refresh_tokens SET revoked_at = ? WHERE id = ?', now, row.id);
    return 'idle';
  }
  return tx(db, () => {
    const next = newRefresh(db, realm, row.subject_id, row.family_id);
    run(db, 'UPDATE refresh_tokens SET revoked_at = ?, replaced_by = ? WHERE id = ?', now, sha256(next.token), row.id);
    return { subjectId: row.subject_id, familyId: row.family_id, token: next.token };
  });
}

export function revokeFamily(db: DB, familyId: string) {
  run(db, 'UPDATE refresh_tokens SET revoked_at = ? WHERE family_id = ? AND revoked_at IS NULL', Date.now(), familyId);
}

export function revokeAll(db: DB, realm: Realm, subjectId: string) {
  run(db, 'UPDATE refresh_tokens SET revoked_at = ? WHERE realm = ? AND subject_id = ? AND revoked_at IS NULL', Date.now(), realm, subjectId);
  bumpTokenVersion(db, realm, subjectId);
}

export function bumpTokenVersion(db: DB, realm: Realm, subjectId: string) {
  run(db, `UPDATE ${realm === 'admin' ? 'admins' : 'users'} SET token_version = token_version + 1 WHERE id = ?`, subjectId);
}

export function isFamilyActive(db: DB, familyId: string) {
  return !!one(db, 'SELECT 1 FROM refresh_tokens WHERE family_id = ? AND revoked_at IS NULL LIMIT 1', familyId);
}

export function touchFamily(db: DB, familyId: string) {
  run(db, 'UPDATE refresh_tokens SET last_used_at = ? WHERE family_id = ? AND revoked_at IS NULL', Date.now(), familyId);
}
