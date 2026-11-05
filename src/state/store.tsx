import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';

import { SEED_PROVIDERS, seedCollabs, seedOrders, seedUsers } from '../data/seed';
import type { Collaboration, CollabStatus, DeliveryBooking, Lang, Order, OrderStatus, PrivacyRequest, Provider, Role, User } from '../data/types';
import { api, ApiError, deviceId, hasSession, LIVE, setSession } from '../lib/api';
import { hashPin, LOCK_MINUTES, MAX_ATTEMPTS, normalizePhone } from '../lib/auth';
import { translate, type StrKey } from '../lib/i18n';
import { newId as uid } from '../lib/id';
import { NOTICE_VERSION } from '../lib/privacy';
import { type as typeScale, type TypeVariant } from '../theme';
import { loadAll, loadProvider, toProvider } from './remote';

const STORAGE_KEY = LIVE ? 'lastminute/live-prefs/v1' : 'lastminute/v3';

export interface Customer {
  name: string;
  phone: string;
  address: string;
}

interface Persisted {
  role: Role | null;
  lang: Lang;
  textScale: number;
  easyMode: boolean;
  users: User[];
  sessionUserId: string | null;
  attempts: Record<string, { count: number; until?: number }>;
  favorites: string[];
  providers: Provider[];
  orders: Order[];
  collabs: Collaboration[];
  requests: PrivacyRequest[];
}

const initialState = (): Persisted => ({
  role: null,
  lang: 'en',
  textScale: 1,
  easyMode: false,
  users: LIVE ? [] : seedUsers(),
  sessionUserId: null,
  attempts: {},
  favorites: [],
  providers: LIVE ? [] : SEED_PROVIDERS,
  orders: LIVE ? [] : seedOrders(),
  collabs: LIVE ? [] : seedCollabs(),
  requests: [],
});

/** In live mode only display preferences are cached on the phone — never business data. */
const persistable = (s: Persisted): Partial<Persisted> =>
  LIVE ? { lang: s.lang, textScale: s.textScale, easyMode: s.easyMode, favorites: s.favorites, role: s.role } : s;

export type NewOrder = Omit<Order, 'id' | 'createdAt' | 'status' | 'history' | 'customerId' | 'customerName' | 'customerPhone'>;
export type OtpPurpose = 'signup' | 'login' | 'reset';
export interface SignUpInput {
  name: string;
  phone: string;
  pin: string;
  otp: string;
  role: Role;
  isAdult: boolean;
  marketing: boolean;
}
/** null = success, 'otp_required' = new device needs an SMS code, otherwise a message to show. */
type AuthResult = Promise<string | null>;

interface Store extends Persisted {
  ready: boolean;
  live: boolean;
  t: (k: StrKey) => string;
  fs: (v: TypeVariant | number) => number;
  set: <K extends 'lang' | 'textScale' | 'easyMode' | 'role'>(key: K, value: Persisted[K]) => void;

  user: User | undefined;
  customer: Customer;
  me: Provider | undefined;
  listed: Provider[];

  requestOtp: (phone: string, purpose: OtpPurpose) => Promise<{ error?: string; demoCode?: string }>;
  signUp: (d: SignUpInput) => AuthResult;
  login: (phone: string, pin: string, otp?: string) => AuthResult;
  logout: () => void;
  updateMe: (patch: Partial<Pick<User, 'name' | 'address'>>) => Promise<void>;
  changePin: (oldPin: string, newPin: string) => AuthResult;
  refresh: () => Promise<void>;

  registerProvider: (p: Provider) => Promise<boolean>;
  updateProvider: (id: string, patch: Partial<Provider>) => Promise<void>;
  recordVisit: (providerId: string) => void;
  placeOrder: (o: NewOrder) => Promise<Order | null>;
  setOrderStatus: (id: string, s: OrderStatus) => Promise<void>;
  attachDelivery: (id: string, d: DeliveryBooking) => Promise<void>;
  rateOrder: (id: string, rating: number, review: string) => Promise<void>;
  sendCollab: (toProviderId: string, message: string) => Promise<void>;
  answerCollab: (id: string, s: CollabStatus) => Promise<void>;
  toggleFavorite: (providerId: string) => void;

  /* DPDP Act rights */
  setConsent: (purpose: 'marketing' | 'orderSharing', granted: boolean) => Promise<void>;
  exportMyData: () => Promise<unknown>;
  setNominee: (n: { name: string; phone: string; relation: string }) => Promise<string | null>;
  raiseGrievance: (subject: string, message: string) => Promise<string | null>;
  deleteAccount: (pin: string) => AuthResult;

  resetDemo: () => void;
}

const Ctx = createContext<Store | null>(null);

const now = () => new Date().toISOString();
const DAY = 86_400_000;

const recomputeRating = (p: Provider): Provider => {
  const avg = p.reviews.length ? p.reviews.reduce((a, r) => a + r.rating, 0) / p.reviews.length : 0;
  return { ...p, rating: Math.round(avg * 10) / 10 };
};

function showError(e: unknown) {
  const msg = e instanceof ApiError ? e.message : 'Something went wrong. Please try again.';
  if (Platform.OS === 'web') console.warn(msg);
  else Alert.alert('Could not complete', msg);
}

/** Demo-mode SMS codes (shown on screen instead of being sent). */
const demoOtps = new Map<string, string>();

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Persisted>(initialState);
  const [ready, setReady] = useState(false);
  const loaded = useRef(false);
  const ref = useRef(state);
  useLayoutEffect(() => {
    ref.current = state;
  }, [state]);

  const patch = useCallback((fn: (s: Persisted) => Partial<Persisted>) => {
    setState((s) => ({ ...s, ...fn(s) }));
  }, []);

  /** Live mode: reload everything this user may see from the server. */
  const pull = useCallback(async () => {
    const d = await loadAll(ref.current.providers);
    patch(() => ({ users: [d.user], sessionUserId: d.user.id, providers: d.providers, orders: d.orders, collabs: d.collabs, requests: d.requests }));
  }, [patch]);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) setState({ ...initialState(), ...JSON.parse(raw) });
        if (LIVE) {
          if (await hasSession()) await pull().catch(() => setSession(null));
          else {
            const ps = await api<Parameters<typeof toProvider>[0][]>('GET', '/v1/providers').catch(() => []);
            patch(() => ({ providers: ps.map((p) => toProvider(p)) }));
          }
        }
      } catch {
        // start fresh
      } finally {
        loaded.current = true;
        setReady(true);
      }
    })();
  }, [pull, patch]);

  useEffect(() => {
    if (!loaded.current) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(persistable(state))).catch(() => {});
  }, [state]);

  const mapOrder = useCallback(
    (id: string, fn: (o: Order) => Order) => patch((s) => ({ orders: s.orders.map((o) => (o.id === id ? fn(o) : o)) })),
    [patch],
  );

  /** Run a live API call, refresh state, and show friendly errors. */
  const liveDo = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T | null> => {
      try {
        const r = await fn();
        await pull();
        return r;
      } catch (e) {
        showError(e);
        return null;
      }
    },
    [pull],
  );

  const store = useMemo<Store>(() => {
    const scale = state.easyMode ? Math.max(state.textScale, 1.2) : state.textScale;
    const user = state.users.find((u) => u.id === state.sessionUserId);
    const me = user?.providerId ? state.providers.find((p) => p.id === user.providerId) : undefined;
    const updateUser = (fn: (u: User) => User) => patch((s) => ({ users: s.users.map((u) => (u.id === s.sessionUserId ? fn(u) : u)) }));
    const addRequest = (r: Omit<PrivacyRequest, 'id' | 'createdAt' | 'dueAt' | 'status'> & { status?: PrivacyRequest['status'] }) => {
      const req: PrivacyRequest = { status: 'open', ...r, id: uid('pr'), createdAt: now(), dueAt: new Date(Date.now() + 7 * DAY).toISOString() };
      patch((s) => ({ requests: [req, ...s.requests] }));
      return req.id;
    };

    return {
      ...state,
      ready,
      live: LIVE,
      t: (k) => translate(state.lang, k),
      fs: (v) => Math.round((typeof v === 'number' ? v : typeScale[v]) * scale),
      set: (key, value) => patch(() => ({ [key]: value }) as Partial<Persisted>),

      user,
      customer: { name: user?.name ?? '', phone: user?.phone ?? '', address: user?.address ?? '' },
      me,
      listed: state.providers.filter((p) => !p.suspended && p.id !== me?.id),
      refresh: async () => {
        if (LIVE && user) await pull().catch(showError);
      },

      /* ------------------------------------------------------------ auth */
      requestOtp: async (phone, purpose) => {
        const ph = normalizePhone(phone);
        if (LIVE) {
          try {
            const r = await api<{ devCode?: string }>('POST', '/v1/auth/otp', { phone: ph, purpose });
            return { demoCode: r.devCode };
          } catch (e) {
            return { error: e instanceof ApiError ? e.message : 'Could not send the code.' };
          }
        }
        const code = String(Math.floor(100000 + Math.random() * 900000));
        demoOtps.set(`${purpose}:${ph}`, code);
        return { demoCode: code };
      },

      signUp: async (d) => {
        const ph = normalizePhone(d.phone);
        if (!d.isAdult) return 'LastMinute is only for people aged 18 or older.';
        if (LIVE) {
          try {
            const r = await api<{ accessToken: string; refreshToken: string }>('POST', '/v1/auth/signup', {
              phone: ph, otp: d.otp, name: d.name.trim(), pin: d.pin, deviceId: await deviceId(), isAdult: true, noticeVersion: NOTICE_VERSION,
              consents: { account: true, orderSharing: true, marketing: d.marketing },
            });
            await setSession(r);
            await pull();
            patch(() => ({ role: d.role }));
            return null;
          } catch (e) {
            return e instanceof ApiError ? e.message : 'Could not create the account.';
          }
        }
        if (demoOtps.get(`signup:${ph}`) !== d.otp) return 'The code is wrong or has expired.';
        demoOtps.delete(`signup:${ph}`);
        if (ref.current.users.some((u) => u.phone === ph)) return 'This number already has an account. Please log in.';
        const u: User = {
          id: uid('u'), name: d.name.trim(), phone: ph, pinHash: await hashPin(ph, d.pin), role: d.role, address: '', createdAt: now(),
          isAdult: true, consents: { noticeVersion: NOTICE_VERSION, orderSharing: true, marketing: d.marketing, at: now() },
        };
        patch((s) => ({ users: [...s.users, u], sessionUserId: u.id, role: d.role }));
        return null;
      },

      login: async (phone, pin, otp) => {
        const ph = normalizePhone(phone);
        if (LIVE) {
          try {
            const r = await api<{ accessToken: string; refreshToken: string }>('POST', '/v1/auth/login', { phone: ph, pin, deviceId: await deviceId(), ...(otp ? { otp } : {}) });
            await setSession(r);
            await pull();
            return null;
          } catch (e) {
            if (e instanceof ApiError && e.code === 'otp_required') return 'otp_required';
            return e instanceof ApiError ? e.message : 'Could not log in.';
          }
        }
        const s = ref.current;
        const att = s.attempts[ph];
        if (att?.until && att.until > Date.now()) {
          const mins = Math.ceil((att.until - Date.now()) / 60000);
          return `Too many wrong tries. Please wait ${mins} minute${mins > 1 ? 's' : ''}.`;
        }
        const u = s.users.find((x) => x.phone === ph);
        if (u?.blocked) return 'This account has been blocked. Please call the helpline.';
        if (!u || (await hashPin(ph, pin)) !== u.pinHash) {
          // same message whether the number exists or not
          const count = (att?.until ? 0 : att?.count ?? 0) + 1;
          const locked = count >= MAX_ATTEMPTS;
          patch((st) => ({ attempts: { ...st.attempts, [ph]: { count, until: locked ? Date.now() + LOCK_MINUTES * 60000 : undefined } } }));
          return locked ? `Wrong number or PIN. Locked for ${LOCK_MINUTES} minutes.` : `Wrong number or PIN. ${MAX_ATTEMPTS - count} tr${MAX_ATTEMPTS - count === 1 ? 'y' : 'ies'} left.`;
        }
        patch((st) => {
          const { [ph]: _, ...rest } = st.attempts;
          return { sessionUserId: u.id, role: u.role, attempts: rest };
        });
        return null;
      },

      logout: () => {
        if (LIVE) {
          api('POST', '/v1/auth/logout', {}).catch(() => {});
          void setSession(null);
          patch(() => ({ sessionUserId: null, role: null, users: [], orders: [], collabs: [], requests: [] }));
          return;
        }
        patch(() => ({ sessionUserId: null, role: null }));
      },

      updateMe: async (upd) => {
        if (LIVE) {
          await liveDo(() => api('PATCH', '/v1/me', upd));
          return;
        }
        updateUser((u) => ({ ...u, ...upd }));
      },

      changePin: async (oldPin, newPin) => {
        if (LIVE) return 'To change your PIN, use “Forgot PIN” on the login screen (an SMS code confirms it is you).';
        const u = ref.current.users.find((x) => x.id === ref.current.sessionUserId);
        if (!u) return 'Not logged in';
        if ((await hashPin(u.phone, oldPin)) !== u.pinHash) return 'Old PIN is wrong.';
        const pinHash = await hashPin(u.phone, newPin);
        updateUser((x) => ({ ...x, pinHash }));
        return null;
      },

      /* ------------------------------------------------------- providers */
      registerProvider: async (p) => {
        if (LIVE) {
          const r = await liveDo(() =>
            api('POST', '/v1/shop', {
              name: p.name, categoryId: p.categoryId, bio: p.bio, area: p.area, openFrom: p.openFrom, openTo: p.openTo, rushFee: p.rushFee,
              languages: p.languages, services: p.services.map((s) => ({ name: s.name, price: s.price, minutes: s.minutes })),
            }),
          );
          if (r) patch(() => ({ role: 'provider' }));
          return !!r;
        }
        patch((s) => ({
          providers: [p, ...s.providers.filter((x) => x.id !== p.id)],
          users: s.users.map((u) => (u.id === s.sessionUserId ? { ...u, providerId: p.id, role: 'provider' } : u)),
          role: 'provider',
        }));
        return true;
      },

      updateProvider: async (id, upd) => {
        if (LIVE) {
          const allowed = {
            bio: upd.bio, area: upd.area, openFrom: upd.openFrom, openTo: upd.openTo, rushFee: upd.rushFee, available: upd.available,
            services: upd.services?.map((s) => ({ id: s.id.startsWith('s_') ? s.id : undefined, name: s.name, price: s.price, minutes: s.minutes })),
          };
          await liveDo(() => api('PATCH', '/v1/shop', JSON.parse(JSON.stringify(allowed))));
          return;
        }
        patch((s) => ({ providers: s.providers.map((p) => (p.id === id ? { ...p, ...upd } : p)) }));
      },

      recordVisit: (providerId) => {
        if (LIVE) {
          const prev = ref.current.providers.find((p) => p.id === providerId);
          loadProvider(providerId, prev)
            .then((p) => patch((s) => ({ providers: s.providers.some((x) => x.id === p.id) ? s.providers.map((x) => (x.id === p.id ? { ...p, visits: x.visits } : x)) : [...s.providers, p] })))
            .catch(() => {});
          return;
        }
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
        });
      },

      /* ---------------------------------------------------------- orders */
      placeOrder: async (o) => {
        if (LIVE) {
          const r = await liveDo(() =>
            api<{ id: string }>('POST', '/v1/orders', {
              providerId: o.providerId, serviceId: o.serviceId, needBy: o.needBy, notes: o.notes, handover: o.handover,
              ...(o.delivery ? { deliveryPartnerId: o.delivery.partnerId } : {}),
            }),
          );
          return r ? ref.current.orders.find((x) => x.id === r.id) ?? ({ id: r.id } as Order) : null;
        }
        if (user && user.consents && !user.consents.orderSharing) {
          showError(new ApiError(403, 'consent', 'Allow sharing your details with the provider (Privacy Centre) to place orders.'));
          return null;
        }
        const order: Order = {
          ...o, id: uid('o'), customerId: user?.id ?? '', customerName: user?.name ?? 'Customer', customerPhone: user ? `+91 ${user.phone}` : '',
          createdAt: now(), status: 'requested', history: [{ status: 'requested', at: now() }],
        };
        patch((s) => ({ orders: [order, ...s.orders] }));
        return order;
      },

      setOrderStatus: async (id, status) => {
        if (LIVE) {
          await liveDo(() => api('POST', `/v1/orders/${id}/status`, { status }));
          return;
        }
        mapOrder(id, (o) => ({ ...o, status, history: [...o.history, { status, at: now() }] }));
      },

      attachDelivery: async (id, delivery) => {
        if (LIVE) {
          await liveDo(() => api('POST', `/v1/orders/${id}/delivery`, { partnerId: delivery.partnerId, leg: delivery.leg === 'drop' ? 'drop' : 'pickup' }));
          return;
        }
        mapOrder(id, (o) => ({
          ...o, delivery,
          status: o.status === 'accepted' ? 'pickup' : o.status,
          history: o.status === 'accepted' ? [...o.history, { status: 'pickup', at: now() }] : o.history,
        }));
      },

      rateOrder: async (id, rating, review) => {
        if (LIVE) {
          await liveDo(() => api('POST', `/v1/orders/${id}/review`, { rating, text: review }));
          return;
        }
        patch((s) => {
          const order = s.orders.find((o) => o.id === id);
          if (!order || order.rating || order.customerId !== s.sessionUserId || order.status !== 'delivered') return {};
          return {
            orders: s.orders.map((o) => (o.id === id ? { ...o, rating, review } : o)),
            providers: s.providers.map((p) =>
              p.id !== order.providerId
                ? p
                : recomputeRating({ ...p, jobsDone: p.jobsDone + 1, reviews: [{ id: `rv-${id}`, author: order.customerName, rating, text: review.trim() || 'Great work!', date: now() }, ...p.reviews] }),
            ),
          };
        });
      },

      sendCollab: async (toProviderId, message) => {
        if (LIVE) {
          await liveDo(() => api('POST', '/v1/collabs', { toProviderId, message }));
          return;
        }
        patch((s) => {
          const from = s.users.find((u) => u.id === s.sessionUserId)?.providerId;
          if (!from) return {};
          return { collabs: [{ id: uid('c'), fromProviderId: from, toProviderId, message, createdAt: now(), status: 'pending' }, ...s.collabs] };
        });
      },

      answerCollab: async (id, status) => {
        if (LIVE) {
          await liveDo(() => api('POST', `/v1/collabs/${id}`, { status }));
          return;
        }
        patch((s) => ({ collabs: s.collabs.map((c) => (c.id === id ? { ...c, status } : c)) }));
      },

      toggleFavorite: (pid) =>
        patch((s) => ({ favorites: s.favorites.includes(pid) ? s.favorites.filter((f) => f !== pid) : [...s.favorites, pid] })),

      /* ------------------------------------------------------- privacy */
      setConsent: async (purpose, granted) => {
        if (LIVE) {
          await liveDo(() => api('POST', '/v1/me/consents', { purpose: purpose === 'orderSharing' ? 'order_sharing' : 'marketing', granted }));
          return;
        }
        updateUser((u) => ({ ...u, consents: { ...(u.consents ?? { noticeVersion: NOTICE_VERSION, orderSharing: true, marketing: false, at: now() }), [purpose]: granted, at: now() } }));
        if (!granted) addRequest({ type: 'consent_withdrawal', status: 'resolved', subject: purpose, resolution: 'Applied immediately' });
      },

      exportMyData: async () => {
        if (LIVE) {
          try {
            return await api('GET', '/v1/me/export');
          } catch (e) {
            showError(e);
            return null;
          }
        }
        const s = ref.current;
        const u = s.users.find((x) => x.id === s.sessionUserId);
        if (!u) return null;
        const { pinHash: _pin, ...profile } = u;
        return {
          exportedAt: now(),
          profile,
          orders: s.orders.filter((o) => o.customerId === u.id),
          reviews: s.providers.flatMap((p) => p.reviews.filter((r) => s.orders.some((o) => o.customerId === u.id && `rv-${o.id}` === r.id))),
          shop: s.providers.find((p) => p.id === u.providerId) ?? null,
          favorites: s.favorites,
          requests: s.requests,
        };
      },

      setNominee: async (n) => {
        if (LIVE) {
          try {
            await api('POST', '/v1/me/nominee', n);
            return null;
          } catch (e) {
            return e instanceof ApiError ? e.message : 'Failed';
          }
        }
        updateUser((u) => ({ ...u, nominee: n }));
        return null;
      },

      raiseGrievance: async (subject, message) => {
        if (LIVE) {
          try {
            const r = await api<{ ticket: string }>('POST', '/v1/grievances', { subject, message });
            await pull();
            return r.ticket;
          } catch (e) {
            showError(e);
            return null;
          }
        }
        return addRequest({ type: 'grievance', subject, message });
      },

      deleteAccount: async (pin) => {
        if (LIVE) {
          try {
            await api('DELETE', '/v1/me', { pin });
            await setSession(null);
            patch(() => ({ sessionUserId: null, role: null, users: [], orders: [], collabs: [], requests: [], favorites: [] }));
            return null;
          } catch (e) {
            return e instanceof ApiError ? e.message : 'Could not delete the account.';
          }
        }
        const s = ref.current;
        const u = s.users.find((x) => x.id === s.sessionUserId);
        if (!u) return 'Not logged in';
        if ((await hashPin(u.phone, pin)) !== u.pinHash) return 'Wrong PIN.';
        const active = s.orders.some((o) => (o.customerId === u.id || o.providerId === u.providerId) && ['requested', 'accepted', 'pickup', 'working', 'ready'].includes(o.status));
        if (active) return 'Please finish or cancel your active orders first.';
        patch((st) => ({
          users: st.users.filter((x) => x.id !== u.id),
          orders: st.orders.map((o) => (o.customerId === u.id ? { ...o, customerName: 'Former customer', customerPhone: '', address: '', notes: '' } : o)),
          providers: st.providers.map((p) => (p.id === u.providerId ? { ...p, name: 'Closed shop', bio: '', phone: '', suspended: true, available: false } : p)),
          sessionUserId: null,
          role: null,
          favorites: [],
          requests: [],
        }));
        return null;
      },

      resetDemo: () => setState({ ...initialState(), lang: state.lang, textScale: state.textScale }),
    };
  }, [state, ready, patch, mapOrder, pull, liveDo]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore must be used inside <StoreProvider>');
  return s;
}
