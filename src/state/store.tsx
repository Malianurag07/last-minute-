import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { SEED_PROVIDERS, seedCollabs, seedOrders } from '../data/seed';
import type {
  Collaboration,
  CollabStatus,
  DeliveryBooking,
  Lang,
  Order,
  OrderStatus,
  Provider,
  Role,
} from '../data/types';
import { translate, type StrKey } from '../lib/i18n';
import { type as typeScale, type TypeVariant } from '../theme';

const STORAGE_KEY = 'lastminute/v1';

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
  customer: Customer;
  myProviderId: string | null;
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
  customer: { name: 'Priya', phone: '+91 90000 12345', address: 'Flat 4B, Sai Residency, FC Road' },
  myProviderId: null,
  favorites: [],
  providers: SEED_PROVIDERS,
  orders: seedOrders(),
  collabs: seedCollabs(),
});

export type NewOrder = Omit<Order, 'id' | 'createdAt' | 'status' | 'history'>;

interface Store extends Persisted {
  ready: boolean;
  t: (k: StrKey) => string;
  fs: (v: TypeVariant | number) => number;
  set: <K extends keyof Persisted>(key: K, value: Persisted[K]) => void;
  me: Provider | undefined;
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
  signOut: () => void;
  resetDemo: () => void;
}

const Ctx = createContext<Store | null>(null);

const now = () => new Date().toISOString();

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Persisted>(initialState);
  const [ready, setReady] = useState(false);
  const loaded = useRef(false);

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
    (id: string, fn: (o: Order) => Order) =>
      patch((s) => ({ orders: s.orders.map((o) => (o.id === id ? fn(o) : o)) })),
    [patch],
  );

  const store = useMemo<Store>(() => {
    const scale = state.easyMode ? Math.max(state.textScale, 1.2) : state.textScale;
    return {
      ...state,
      ready,
      t: (k) => translate(state.lang, k),
      fs: (v) => Math.round((typeof v === 'number' ? v : typeScale[v]) * scale),
      set: (key, value) => patch(() => ({ [key]: value }) as Partial<Persisted>),
      me: state.providers.find((p) => p.id === state.myProviderId),

      registerProvider: (p) =>
        patch((s) => ({
          providers: [p, ...s.providers.filter((x) => x.id !== p.id)],
          myProviderId: p.id,
          role: 'provider',
        })),

      updateProvider: (id, upd) =>
        patch((s) => ({ providers: s.providers.map((p) => (p.id === id ? { ...p, ...upd } : p)) })),

      recordVisit: (providerId) =>
        patch((s) => ({
          providers: s.providers.map((p) => {
            if (p.id !== providerId || p.id === s.myProviderId) return p;
            const visits = [...p.visits];
            visits[visits.length - 1] = (visits[visits.length - 1] ?? 0) + 1;
            return { ...p, visits };
          }),
        })),

      placeOrder: (o) => {
        const order: Order = {
          ...o,
          id: `o-${Date.now().toString().slice(-6)}`,
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
          if (!order) return {};
          return {
            orders: s.orders.map((o) => (o.id === id ? { ...o, rating, review } : o)),
            providers: s.providers.map((p) => {
              if (p.id !== order.providerId) return p;
              const reviews = [
                { id: `rv-${id}`, author: order.customerName, rating, text: review || 'Great work!', date: now() },
                ...p.reviews,
              ];
              const avg = reviews.reduce((a, r) => a + r.rating, 0) / reviews.length;
              return { ...p, reviews, rating: Math.round(avg * 10) / 10, jobsDone: p.jobsDone + 1 };
            }),
          };
        }),

      sendCollab: (toProviderId, message) =>
        patch((s) => ({
          collabs: [
            {
              id: `c-${Date.now()}`,
              fromProviderId: s.myProviderId ?? '',
              toProviderId,
              message,
              createdAt: now(),
              status: 'pending',
            },
            ...s.collabs,
          ],
        })),

      answerCollab: (id, status) =>
        patch((s) => ({ collabs: s.collabs.map((c) => (c.id === id ? { ...c, status } : c)) })),

      toggleFavorite: (pid) =>
        patch((s) => ({
          favorites: s.favorites.includes(pid) ? s.favorites.filter((f) => f !== pid) : [...s.favorites, pid],
        })),

      signOut: () => patch(() => ({ role: null })),

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
