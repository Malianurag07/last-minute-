/**
 * API client for the console. The access token lives only in memory (lost on
 * reload, by design); the refresh token is an HttpOnly cookie the browser
 * sends to /v1/admin/refresh — JavaScript can never read it.
 */
let accessToken: string | null = null;
let onSignedOut: (msg?: string) => void = () => {};

export const setSignedOutHandler = (fn: (msg?: string) => void) => (onSignedOut = fn);
export const setAccessToken = (t: string | null) => (accessToken = t);

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function raw(method: string, path: string, body?: unknown) {
  return fetch(path, {
    method,
    credentials: 'same-origin',
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export async function refresh(): Promise<SessionInfo | null> {
  const r = await fetch('/v1/admin/refresh', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: '{}' });
  if (!r.ok) return null;
  const s = (await r.json()) as SessionInfo & { accessToken: string };
  accessToken = s.accessToken;
  return s;
}

export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  let r = await raw(method, `/v1/admin${path}`, body);
  if (r.status === 401 && !path.startsWith('/login')) {
    const s = await refresh();
    if (s) r = await raw(method, `/v1/admin${path}`, body);
  }
  const data = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok) {
    if (r.status === 401 && !path.startsWith('/login')) onSignedOut(data?.message);
    throw new ApiError(r.status, data?.error ?? 'error', data?.message ?? 'Something went wrong.');
  }
  return data as T;
}

export interface SessionInfo {
  accessToken?: string;
  mustChangePassword: boolean;
  role: Role;
  username: string;
}
export type Role = 'super_admin' | 'ops' | 'support' | 'auditor';

export const PERMS: Record<Role, string[]> = {
  super_admin: ['*'],
  ops: ['dashboard', 'providers.view', 'providers.verify', 'providers.suspend', 'orders.view', 'orders.cancel', 'users.view', 'users.block', 'reviews.view', 'reviews.moderate', 'privacy.view', 'privacy.handle', 'incidents.view'],
  support: ['dashboard', 'providers.view', 'orders.view', 'users.view', 'reviews.view', 'privacy.view', 'privacy.handle'],
  auditor: ['dashboard', 'audit.view', 'incidents.view', 'privacy.view'],
};
export const can = (role: Role, p: string) => PERMS[role].includes('*') || PERMS[role].includes(p);

export const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
export const when = (ms: number | string | null | undefined) =>
  ms == null ? '—' : new Date(ms).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
