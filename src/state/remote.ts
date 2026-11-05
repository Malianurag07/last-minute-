import type { Collaboration, Order, OrderStatus, PrivacyRequest, Provider, Review, Service, User } from '../data/types';
import { api } from '../lib/api';
import { NOTICE_VERSION } from '../lib/privacy';

/* ---- server shapes (subset) ---- */
interface SProvider {
  id: string; name: string; categoryId: string; bio: string; area: string; distanceKm: number; rushFee: number;
  openFrom: string; openTo: string; available: boolean; verified: boolean; rating: number; reviewCount: number;
  jobsDone: number; languages: string[]; services: Service[]; suspended?: boolean;
  reviews?: { id: string; author: string; rating: number; text: string; date: number }[];
}
interface SOrder {
  id: string; providerId: string; providerName: string; serviceId: string; serviceName: string; price: number; rushFee: number;
  deliveryFee: number; platformFee: number; needBy: string; createdAt: string; handover: 'delivery' | 'self';
  delivery?: Order['delivery']; status: OrderStatus; customerName: string; customerPhone: string; address: string; notes: string;
  history: { status: OrderStatus; at: string }[]; review?: { rating: number; text: string };
}
interface SMe {
  id: string; phone: string; name: string; address: string; createdAt: number; providerId: string | null;
  consents: Record<string, { granted: boolean; at: number; noticeVersion: string }>;
}

export function toProvider(p: SProvider, prev?: Provider): Provider {
  return {
    id: p.id,
    name: p.name,
    phone: '',
    categoryId: p.categoryId,
    bio: p.bio,
    area: p.area,
    distanceKm: p.distanceKm,
    rushFee: p.rushFee,
    services: p.services,
    rating: p.rating,
    reviews: p.reviews
      ? p.reviews.map((r): Review => ({ id: r.id, author: r.author, rating: r.rating, text: r.text, date: new Date(r.date).toISOString() }))
      : prev?.reviews ?? [],
    jobsDone: p.jobsDone,
    languages: p.languages,
    openFrom: p.openFrom,
    openTo: p.openTo,
    available: p.available,
    visits: prev?.visits ?? [0, 0, 0, 0, 0, 0, 0],
    verified: p.verified,
    suspended: p.suspended,
    joinedAt: prev?.joinedAt ?? new Date().toISOString(),
  };
}

export function toOrder(o: SOrder, customerId: string): Order {
  return {
    id: o.id,
    providerId: o.providerId,
    customerId,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    serviceId: o.serviceId,
    serviceName: o.serviceName,
    price: o.price,
    rushFee: o.rushFee,
    deliveryFee: o.deliveryFee + o.platformFee,
    needBy: o.needBy,
    createdAt: o.createdAt,
    notes: o.notes,
    handover: o.handover,
    address: o.address,
    delivery: o.delivery,
    status: o.status,
    history: o.history,
    rating: o.review?.rating,
    review: o.review?.text,
  };
}

export function toUser(me: SMe): User {
  return {
    id: me.id,
    name: me.name,
    phone: me.phone,
    pinHash: '',
    role: me.providerId ? 'provider' : 'customer',
    address: me.address,
    providerId: me.providerId ?? undefined,
    createdAt: new Date(me.createdAt).toISOString(),
    isAdult: true,
    consents: {
      noticeVersion: me.consents.order_sharing?.noticeVersion ?? NOTICE_VERSION,
      orderSharing: !!me.consents.order_sharing?.granted,
      marketing: !!me.consents.marketing?.granted,
      at: new Date(me.consents.order_sharing?.at ?? me.createdAt).toISOString(),
    },
  };
}

/** Everything the signed-in user is allowed to see, fetched fresh from the server. */
export async function loadAll(prevProviders: Provider[]) {
  const me = await api<SMe>('GET', '/v1/me');
  const user = toUser(me);
  const byId = new Map(prevProviders.map((p) => [p.id, p]));
  const list = await api<SProvider[]>('GET', '/v1/providers');
  const providers = list.map((p) => toProvider(p, byId.get(p.id)));
  const mine = (await api<SOrder[]>('GET', '/v1/orders')).map((o) => toOrder(o, me.id));
  let shopOrders: Order[] = [];
  let collabs: Collaboration[] = [];
  if (me.providerId) {
    const shop = await api<SProvider>('GET', '/v1/shop');
    const dash = await api<{ visits: { day: string; count: number }[] }>('GET', '/v1/shop/dashboard');
    const own = toProvider(shop, byId.get(shop.id));
    own.visits = dash.visits.map((v) => v.count);
    const i = providers.findIndex((p) => p.id === own.id);
    if (i >= 0) providers[i] = own;
    else providers.push(own);
    shopOrders = (await api<SOrder[]>('GET', '/v1/shop/orders')).map((o) => toOrder(o, `cust:${o.id}`));
    collabs = (await api<{ id: string; fromProviderId: string; toProviderId: string; message: string; status: Collaboration['status']; createdAt: number }[]>('GET', '/v1/collabs')).map((c) => ({
      ...c,
      createdAt: new Date(c.createdAt).toISOString(),
    }));
  }
  const requests = (await api<{ id: string; type: PrivacyRequest['type']; status: PrivacyRequest['status']; created_at: number; due_at: number; resolution: string | null }[]>('GET', '/v1/me/requests')).map(
    (r): PrivacyRequest => ({ id: r.id, type: r.type, status: r.status, createdAt: new Date(r.created_at).toISOString(), dueAt: new Date(r.due_at).toISOString(), resolution: r.resolution ?? undefined }),
  );
  const orders = [...mine, ...shopOrders.filter((o) => !mine.some((m) => m.id === o.id))];
  return { user, providers, orders, collabs, requests };
}

export async function loadProvider(id: string, prev?: Provider) {
  return toProvider(await api<SProvider>('GET', `/v1/providers/${id}`), prev);
}
