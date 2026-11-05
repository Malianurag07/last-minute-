/** Shared domain constants (kept in sync with the app's src/data/categories.ts). */
export const CATEGORY_IDS = [
  'tailoring', 'food', 'mehendi', 'baking', 'ironing', 'repairs', 'beauty', 'crafts', 'tuition', 'electronics',
] as const;

export const ORDER_STATUSES = ['requested', 'accepted', 'pickup', 'working', 'ready', 'delivered', 'declined', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const ACTIVE_STATUSES: OrderStatus[] = ['requested', 'accepted', 'pickup', 'working', 'ready'];

/**
 * Who may move an order from one status to the next. Anything not listed is
 * rejected by the server, so a modified app can't e.g. mark its own order
 * "delivered" or accept on behalf of a provider.
 */
export const TRANSITIONS: Record<string, { to: OrderStatus; by: ('customer' | 'provider' | 'admin')[] }[]> = {
  requested: [
    { to: 'accepted', by: ['provider'] },
    { to: 'declined', by: ['provider'] },
    { to: 'cancelled', by: ['customer', 'admin'] },
  ],
  accepted: [
    { to: 'pickup', by: ['customer', 'provider'] },
    { to: 'working', by: ['provider'] },
    { to: 'cancelled', by: ['admin'] },
  ],
  pickup: [
    { to: 'working', by: ['provider'] },
    { to: 'cancelled', by: ['admin'] },
  ],
  working: [
    { to: 'ready', by: ['provider'] },
    { to: 'cancelled', by: ['admin'] },
  ],
  ready: [
    { to: 'delivered', by: ['provider'] },
    { to: 'cancelled', by: ['admin'] },
  ],
};

export const canTransition = (from: string, to: string, actor: 'customer' | 'provider' | 'admin') =>
  !!TRANSITIONS[from]?.some((t) => t.to === to && t.by.includes(actor));

/** Indian mobile numbers: 10 digits starting 6–9. */
export function normalizePhone(s: string) {
  const d = s.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) return d.slice(2);
  if (d.length === 11 && d.startsWith('0')) return d.slice(1);
  return d;
}
export const isValidPhone = (s: string) => /^[6-9]\d{9}$/.test(normalizePhone(s));
export const maskPhone = (p: string) => (p.length === 10 ? `+91 ••••• •${p.slice(-4)}` : '••••');

const WEAK_PINS = new Set(['0123', '1234', '2345', '3456', '4567', '5678', '6789', '9876', '4321', '1212', '0000', '1122', '1004', '2000', '6969']);
export const isWeakPin = (pin: string) => /^(\d)\1+$/.test(pin) || WEAK_PINS.has(pin) || /^(19|20)\d\d$/.test(pin);

/** Admin password policy (NIST 800-63B style: length over complexity, block common ones). */
export function passwordProblem(pw: string, username: string): string | null {
  if (pw.length < 12) return 'Use at least 12 characters.';
  if (pw.length > 128) return 'Use at most 128 characters.';
  const lower = pw.toLowerCase();
  if (lower.includes(username.toLowerCase())) return 'Password must not contain the username.';
  if (/^(.)\1+$/.test(pw) || ['password1234', 'admin@123456', 'lastminute123', 'qwerty123456'].includes(lower)) return 'That password is too common.';
  return null;
}
