import * as Crypto from 'expo-crypto';

/**
 * Local authentication helpers.
 *
 * Accounts are stored on the device (there is no server yet), so PINs are
 * only ever kept as salted SHA-256 hashes. When a backend is added this
 * should move server-side with phone OTP verification.
 */
export const digits = (s: string) => s.replace(/\D/g, '');

/** Accepts "+91 98200 11111", "09820011111", "9820011111" → "9820011111" */
export function normalizePhone(s: string) {
  const d = digits(s);
  if (d.length === 12 && d.startsWith('91')) return d.slice(2);
  if (d.length === 11 && d.startsWith('0')) return d.slice(1);
  return d;
}

export const isValidPhone = (s: string) => /^[6-9]\d{9}$/.test(normalizePhone(s));

export const formatPhone = (s: string) => {
  const d = normalizePhone(s);
  return d.length === 10 ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : s;
};

const sha = (s: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, s);

export const hashPin = (phone: string, pin: string) => sha(`lastminute:${normalizePhone(phone)}:${pin}`);

export const hashAdmin = (username: string, password: string) =>
  sha(`lastminute-admin:${username.trim().toLowerCase()}:${password}`);

/** PINs that are too easy to guess. */
export const weakPin = (pin: string) => /^(\d)\1{3}$/.test(pin) || pin === '0123' || pin === '9876';

export const MAX_ATTEMPTS = 5;
export const LOCK_MINUTES = 5;
