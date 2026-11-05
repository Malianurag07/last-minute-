import type { Order } from '../data/types';

/**
 * Same money rules as the server (server/src/pricing.ts). In live mode the
 * server's numbers are used; in demo mode these give identical results.
 */
export const PRICING = {
  commissionRate: 0.12,
  rushShare: 0.2,
  platformFee: 9,
  rushWindowMinutes: 180,
} as const;

export const commissionFor = (price: number, rushFee: number) => Math.round(price * PRICING.commissionRate + rushFee * PRICING.rushShare);

/** What the provider receives for an order. */
export const providerPayout = (o: Pick<Order, 'price' | 'rushFee' | 'commission'>) => o.price + o.rushFee - (o.commission ?? commissionFor(o.price, o.rushFee));

/** What the customer pays in total (service + rush + convenience fee + delivery paid to the partner). */
export const customerTotal = (o: Pick<Order, 'price' | 'rushFee' | 'deliveryFee' | 'platformFee'>) => o.price + o.rushFee + o.deliveryFee + (o.platformFee ?? 0);
