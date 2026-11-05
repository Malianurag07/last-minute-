import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { DEFAULT_ADMIN, SEED_PROVIDERS, seedCollabs, seedOrders, seedUsers } from '../data/seed';
import type {
  Collaboration,
  CollabStatus,
  DeliveryBooking,
  Lang,
  Order,
  OrderStatus,
  Provider,
  Role,
  User,
} from '../data/types';
import { newId as uid } from '../lib/id';
import { hashAdmin, hashPin, LOCK_MINUTES, MAX_ATTEMPTS, normalizePhone } from '../lib/auth';
import { translate, type StrKey } from '../lib/i18n';
import { type as typeScale, type TypeVariant } from '../theme';

const STORAGE_KEY = 'lastminute/v2';

export interface Customer {
  name: string;
  phone: string;
  address: string;
}

interface Persisted {
  /** current mode of the signed-in user */
  role: Role | null;
  lang: Lang;
  textScale: number;
  easyMode: boolean;
  users: User[];
  sessionUserId: string | null;
  admin: { username: string; passHash: string };
  adminSession: boolean;
  /** failed login attempts per phone, to slow down PIN guessing */
  attempts: Record<string, { count: number; until?: number }>;
  favorites: string[];
  providers: Provider[];
  orders: Order[];
  collabs: Collaboration[];
}

const initialState = (): Persisted => ({
  role: null,
  lang: 'en',
  textScale: 1,
  easyMode: false,
  users: seedUsers(),
  sessionUserId: null,
  admin: DEFAULT_ADMIN,
  adminSession: false,
  attempts: {},
  favorites: [],
  providers: SEED_PROVIDERS,
  orders: seedOrders(),
  collabs: seedCollabs(),
});

export type NewOrder = Omit<Order, 'id' | 'createdAt' | 'status' | 'history' | 'customerId' | 'customerName' | 'customerPhone'>;

/** Result of an auth call: null on success, otherwise a message to show. */
type AuthResult = Promise<string | null>;

interface Store extends Persisted {
  ready: boolean;
  t: (k: StrKey) => string;
  fs: (v: TypeVariant | number) => number;
  set: <K extends 'lang' | 'textScale' | 'easyMode' | 'role'>(key: K, value: Persisted[K]) => void;

  user: User | undefined;
  customer: Customer;
  me: Provider | undefined;
  /** providers customers are allowed to see */
  listed: Provider[];

  signUp: (d: { name: string; phone: string; pin: string; role: Role }) => AuthResult;
  login: (phone: string, pin: string) => AuthResult;
  logout: () => void;
  updateMe: (patch: Partial<Pick<User, 'name' | 'address'>>) => void;
  changePin: (oldPin: string, newPin: string) => AuthResult;

  registerProvider: (p: Provider) => void;
  updateProvider: (id: string, patch: Partial<Provider>) => void;
  recordVisit: (providerId: string) => void;
  placeOrder: (o: NewOrder) => Order;
  setOrderStatus: (id: string, s: OrderStatus) => void;
  attachDelivery: (id: string, d: DeliveryBooking) => void;
  rateOrder: (id: string, rating: number, review: string) => void;
  sendCollab: (toProviderId: string, message: string) => void;
  answerCollab: (id: string, s: CollabStatus) => void;
  toggleFavorite: (providerId: string) => void;

  adminLogin: (username: string, password: string) => AuthResult;
  adminLogout: () => void;
  adminChangePassword: (oldPass: string, newPass: string) => AuthResult;
  setUserBlocked: (userId: string, blocked: boolean) => void;
  deleteReview: (providerId: string, reviewId: string) => void;

  resetDemo: () => void;
}

const Ctx = createContext<Store | null>(null);

const now = () => new Date().toISOString();

const recomputeRating = (p: Provider): Provider => {
  const avg = p.reviews.length ? p.reviews.reduce((a, r) => a + r.rating, 0) / p.reviews.length : 0;
  return { ...p, rating: Math.round(avg * 10) / 10 };
};

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Persisted>(initialState);
  const [ready, setReady] = useState(false);
  const loaded = useRef(false);
  // latest state for async callbacks
  const ref = useRef(state);
  useLayoutEffect(() => {
    ref.current = state;
  }, [state]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setState({ ...initialState(), ...JSON.parse(raw) });
      })
      .catch(() => {})
      .finally(() => {
        loaded.current = true;
        setReady(true);
      });
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
  }, [state]);

  const patch = useCallback((fn: (s: Persisted) => Partial<Persisted>) => {
    setState((s) => ({ ...s, ...fn(s) }));
  }, []);

  const mapOrder = useCallback(
    (id: string, fn: (o: Order) => Order) => patch((s) => ({ orders: s.orders.map((o) => (o.id === id ? fn(o) : o)) })),
    [patch],
  );

  const store = useMemo<Store>(() => {
    const scale = state.easyMode ? Math.max(state.textScale, 1.2) : state.textScale;
    const user = state.users.find((u) => u.id === state.sessionUserId);
    const me = user?.providerId ? state.providers.find((p) => p.id === user.providerId) : undefined;

    return {
      ...state,
      ready,
      t: (k) => translate(state.lang, k),
      fs: (v) => Math.round((typeof v === 'number' ? v : typeScale[v]) * scale),
      set: (key, value) => patch(() => ({ [key]: value }) as Partial<Persisted>),

      user,
      customer: { name: user?.name ?? '', phone: user?.phone ?? '', address: user?.address ?? '' },
      me,
      listed: state.providers.filter((p) => !p.suspended && p.id !== me?.id),

      /* ------------------------------------------------------------ auth */
      signUp: async ({ name, phone, pin, role }) => {
        const ph = normalizePhone(phone);
        if (ref.current.users.some((u) => u.phone === ph)) return 'This number already has an account. Please log in.';
        const u: User = {
          id: uid('u'),
          name: name.trim(),
          phone: ph,
          pinHash: await hashPin(ph, pin),
          role,
          address: '',
          createdAt: now(),
        };
        patch((s) => ({ users: [...s.users, u], sessionUserId: u.id, role }));
        return null;
      },

      login: async (phone, pin) => {
        const ph = normalizePhone(phone);
        const s = ref.current;
        const att = s.attempts[ph];
        if (att?.until && att.until > Date.now()) {
          const mins = Math.ceil((att.until - Date.now()) / 60000);
          return `Too many wrong tries. Please wait ${mins} minute${mins > 1 ? 's' : ''}.`;
        }
        const u = s.users.find((x) => x.phone === ph);
        if (!u) return 'No account with this number. Tap “Create account”.';
        if (u.blocked) return 'This account has been blocked. Please call the helpline.';
        if ((await hashPin(ph, pin)) !== u.pinHash) {
          const count = (att?.until ? 0 : att?.count ?? 0) + 1;
          const locked = count >= MAX_ATTEMPTS;
          patch((st) => ({
            attempts: { ...st.attempts, [ph]: { count, until: locked ? Date.now() + LOCK_MINUTES * 60000 : undefined } },
          }));
          return locked
            ? `Wrong PIN. Locked for ${LOCK_MINUTES} minutes.`
            : `Wrong PIN. ${MAX_ATTEMPTS - count} tr${MAX_ATTEMPTS - count === 1 ? 'y' : 'ies'} left.`;
        }
        patch((st) => {
          const { [ph]: _, ...rest } = st.attempts;
          return { sessionUserId: u.id, role: u.role, attempts: rest };
        });
        return null;
      },

      logout: () => patch(() => ({ sessionUserId: null, role: null })),

      updateMe: (upd) =>
        patch((s) => ({ users: s.users.map((u) => (u.id === s.sessionUserId ? { ...u, ...upd } : u)) })),

      changePin: async (oldPin, newPin) => {
        const u = ref.current.users.find((x) => x.id === ref.current.sessionUserId);
        if (!u) return 'Not logged in';
        if ((await hashPin(u.phone, oldPin)) !== u.pinHash) return 'Old PIN is wrong.';
        const pinHash = await hashPin(u.phone, newPin);
        patch((s) => ({ users: s.users.map((x) => (x.id === u.id ? { ...x, pinHash } : x)) }));
        return null;
      },

      /* ------------------------------------------------------- providers */
      registerProvider: (p) =>
        patch((s) => ({
          providers: [p, ...s.providers.filter((x) => x.id !== p.id)],
          users: s.users.map((u) => (u.id === s.sessionUserId ? { ...u, providerId: p.id, role: 'provider' } : u)),
          role: 'provider',
        })),

      updateProvider: (id, upd) =>
        patch((s) => ({ providers: s.providers.map((p) => (p.id === id ? { ...p, ...upd } : p)) })),

      recordVisit: (providerId) =>
        patch((s) => {
          const mine = s.users.find((u) => u.id === s.sessionUserId)?.providerId;
          return {
            providers: s.providers.map((p) => {
              if (p.id !== providerId || p.id === mine) return p;
              const visits = [...p.visits];
              visits[visits.length - 1] = (visits[visits.length - 1] ?? 0) + 1;
              return { ...p, visits };
            }),
          };
        }),

      /* ---------------------------------------------------------- orders */
      placeOrder: (o) => {
        const order: Order = {
          ...o,
          id: uid('o'),
          customerId: user?.id ?? '',
          customerName: user?.name ?? 'Customer',
          customerPhone: user ? `+91 ${user.phone}` : '',
          createdAt: now(),
          status: 'requested',
          history: [{ status: 'requested', at: now() }],
        };
        patch((s) => ({ orders: [order, ...s.orders] }));
        return order;
      },

      setOrderStatus: (id, status) =>
        mapOrder(id, (o) => ({ ...o, status, history: [...o.history, { status, at: now() }] })),

      attachDelivery: (id, delivery) =>
        mapOrder(id, (o) => ({
          ...o,
          delivery,
          status: o.status === 'accepted' ? 'pickup' : o.status,
          history: o.status === 'accepted' ? [...o.history, { status: 'pickup', at: now() }] : o.history,
        })),

      rateOrder: (id, rating, review) =>
        patch((s) => {
          const order = s.orders.find((o) => o.id === id);
          if (!order || order.rating) return {};
          return {
            orders: s.orders.map((o) => (o.id === id ? { ...o, rating, review } : o)),
            providers: s.providers.map((p) =>
              p.id !== order.providerId
                ? p
                : recomputeRating({
                    ...p,
                    jobsDone: p.jobsDone + 1,
                    reviews: [
                      { id: `rv-${id}`, author: order.customerName, rating, text: review.trim() || 'Great work!', date: now() },
                      ...p.reviews,
                    ],
                  }),
            ),
          };
        }),

      sendCollab: (toProviderId, message) =>
        patch((s) => {
          const from = s.users.find((u) => u.id === s.sessionUserId)?.providerId;
          if (!from) return {};
          return {
            collabs: [
              { id: uid('c'), fromProviderId: from, toProviderId, message, createdAt: now(), status: 'pending' },
              ...s.collabs,
            ],
          };
        }),

      answerCollab: (id, status) => patch((s) => ({ collabs: s.collabs.map((c) => (c.id === id ? { ...c, status } : c)) })),

      toggleFavorite: (pid) =>
        patch((s) => ({
          favorites: s.favorites.includes(pid) ? s.favorites.filter((f) => f !== pid) : [...s.favorites, pid],
        })),

      /* ----------------------------------------------------------- admin */
      adminLogin: async (username, password) => {
        const { admin } = ref.current;
        if (username.trim().toLowerCase() !== admin.username || (await hashAdmin(username, password)) !== admin.passHash) {
          return 'Wrong username or password.';
        }
        patch(() => ({ adminSession: true }));
        return null;
      },

      adminLogout: () => patch(() => ({ adminSession: false })),

      adminChangePassword: async (oldPass, newPass) => {
        const { admin } = ref.current;
        if ((await hashAdmin(admin.username, oldPass)) !== admin.passHash) return 'Current password is wrong.';
        if (newPass.length < 8) return 'New password must be at least 8 characters.';
        const passHash = await hashAdmin(admin.username, newPass);
        patch((s) => ({ admin: { ...s.admin, passHash } }));
        return null;
      },

      setUserBlocked: (userId, blocked) =>
        patch((s) => ({
          users: s.users.map((u) => (u.id === userId ? { ...u, blocked } : u)),
          // a blocked user is signed out immediately
          ...(blocked && s.sessionUserId === userId ? { sessionUserId: null, role: null } : {}),
        })),

      deleteReview: (providerId, reviewId) =>
        patch((s) => ({
          providers: s.providers.map((p) =>
            p.id === providerId ? recomputeRating({ ...p, reviews: p.reviews.filter((r) => r.id !== reviewId) }) : p,
          ),
        })),

      resetDemo: () => setState({ ...initialState(), lang: state.lang, textScale: state.textScale }),
    };
  }, [state, ready, patch, mapOrder]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore must be used inside <StoreProvider>');
  return s;
}
