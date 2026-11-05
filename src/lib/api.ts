import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { newId } from './id';

/**
 * Client for the LastMinute API ("live mode").
 *
 * When EXPO_PUBLIC_API_URL (or app.json → extra.apiUrl) is set, the app keeps
 * NO business data of its own: accounts, shops, orders and admin actions live
 * on the server, which checks every permission. Tokens are kept in the
 * Android Keystore / iOS Keychain via expo-secure-store.
 * Without a URL the app runs as an offline demo with sample data.
 */
const extra = (Constants.expoConfig?.extra ?? {}) as { apiUrl?: string };
export const API_URL: string | null = (process.env.EXPO_PUBLIC_API_URL || extra.apiUrl || '').replace(/\/$/, '') || null;
export const LIVE = !!API_URL;

/** Release builds talk to the server over HTTPS only (plain HTTP allowed for local testing). */
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)(:\d+)?$/;
if (LIVE && !__DEV__ && !API_URL!.startsWith('https://') && !LOCAL.test(API_URL!)) {
  throw new Error('API_URL must use HTTPS in release builds');
}

const mem: Record<string, string | null> = {};
const secure = {
  async get(k: string) {
    if (Platform.OS === 'web') return mem[k] ?? null; // web: memory only, never localStorage
    return SecureStore.getItemAsync(k);
  },
  async set(k: string, v: string | null) {
    if (Platform.OS === 'web') {
      mem[k] = v;
      return;
    }
    if (v === null) await SecureStore.deleteItemAsync(k);
    else await SecureStore.setItemAsync(k, v, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  },
};

let access: string | null = null;

export async function deviceId() {
  let d = await secure.get('lm.device');
  if (!d) {
    d = `${newId('dev')}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
    await secure.set('lm.device', d);
  }
  return d;
}

export async function setSession(s: { accessToken: string; refreshToken: string } | null) {
  access = s?.accessToken ?? null;
  await secure.set('lm.refresh', s?.refreshToken ?? null);
}

export const hasSession = async () => !!(await secure.get('lm.refresh'));

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function refresh(): Promise<boolean> {
  const rt = await secure.get('lm.refresh');
  if (!rt) return false;
  const r = await fetch(`${API_URL}/v1/auth/refresh`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: rt }) });
  if (!r.ok) {
    await setSession(null);
    return false;
  }
  await setSession(await r.json());
  return true;
}

export async function api<T = unknown>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown, retry = true): Promise<T> {
  if (!API_URL) throw new ApiError(0, 'no_server', 'No server configured.');
  if (!access && retry && !path.startsWith('/v1/auth/') && (await hasSession())) await refresh();
  let r: Response;
  try {
    r = await fetch(`${API_URL}${path}`, {
      method,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(access ? { authorization: `Bearer ${access}` } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'offline', 'No internet. Please check your connection.');
  }
  if (r.status === 401 && retry && !path.startsWith('/v1/auth/') && (await refresh())) return api(method, path, body, false);
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new ApiError(r.status, data?.error ?? 'error', data?.message ?? 'Something went wrong.');
  return data as T;
}
