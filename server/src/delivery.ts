
/**
 * Server copy of the delivery estimator (the app shows the same numbers).
 * The server recomputes the fee so the client can't send a fake price.
 *
 * Delivery partner comparison.
 *
 * Porter, Uber, Rapido and Ola do not expose public quote APIs, so prices here are
 * ESTIMATES built from each partner's published base fare + per-km rate for the
 * vehicle class that suits small parcels in Indian cities. Reliability is a
 * 0–100 score (on-time pickup %, cancellation rate) that should be replaced with
 * the platform's own data once we have real bookings flowing.
 *
 * Booking is handed off to the partner app via deep link (falling back to its
 * website), with pickup/drop details copied to the clipboard for pasting.
 */
export interface DeliveryPartner {
  id: string;
  name: string;
  vehicle: string;
  icon: string;
  base: number;
  perKm: number;
  pickupMins: number;
  speedKmh: number;
  reliability: number;
  maxKg: number;
  deepLink: string;
  web: string;
  note: string;
}

export const PARTNERS: DeliveryPartner[] = [
  {
    id: 'rapido',
    name: 'Rapido Parcel',
    vehicle: 'Bike',
    icon: 'bicycle',
    base: 25,
    perKm: 8,
    pickupMins: 5,
    speedKmh: 24,
    reliability: 86,
    maxKg: 10,
    deepLink: 'rapido://',
    web: 'https://www.rapido.bike/',
    note: 'Cheapest for clothes, food & small parcels',
  },
  {
    id: 'porter',
    name: 'Porter',
    vehicle: '2-Wheeler',
    icon: 'cube',
    base: 40,
    perKm: 9,
    pickupMins: 8,
    speedKmh: 22,
    reliability: 94,
    maxKg: 20,
    deepLink: 'porter://',
    web: 'https://porter.in/',
    note: 'Most reliable, live tracking, parcel insurance',
  },
  {
    id: 'uber',
    name: 'Uber Connect',
    vehicle: 'Moto',
    icon: 'car',
    base: 45,
    perKm: 10,
    pickupMins: 6,
    speedKmh: 23,
    reliability: 90,
    maxKg: 8,
    deepLink: 'uber://?action=setPickup&pickup=my_location',
    web: 'https://m.uber.com/ul/?action=setPickup&pickup=my_location',
    note: 'Fast pickup, OTP-secured handover',
  },
  {
    id: 'ola',
    name: 'Ola Parcel',
    vehicle: 'Bike',
    icon: 'bicycle',
    base: 30,
    perKm: 9,
    pickupMins: 9,
    speedKmh: 22,
    reliability: 80,
    maxKg: 10,
    deepLink: 'olacabs://app/launch',
    web: 'https://book.olacabs.com/',
    note: 'Good backup when others are busy',
  },
];

export interface Quote {
  partner: DeliveryPartner;
  price: number;
  etaMins: number;
  /** 0-100, higher is better. Balances price, reliability and speed. */
  score: number;
  tags: ('cheapest' | 'most-reliable' | 'fastest' | 'best-value')[];
}

/** Late-evening / rush-hour multiplier, like the partner apps apply. */
const surge = (d = new Date()) => {
  const h = d.getHours();
  if ((h >= 8 && h < 10) || (h >= 18 && h < 21)) return 1.2;
  if (h >= 22 || h < 6) return 1.15;
  return 1;
};

export function getQuotes(distanceKm: number, legs: 1 | 2 = 1, now = new Date()): Quote[] {
  const km = Math.max(0.5, distanceKm);
  const s = surge(now);
  const raw = PARTNERS.map((p) => {
    const one = Math.round((p.base + p.perKm * km) * s);
    const price = one * legs;
    const etaMins = Math.round(p.pickupMins + (km / p.speedKmh) * 60);
    return { partner: p, price, etaMins };
  });

  const minP = Math.min(...raw.map((q) => q.price));
  const maxP = Math.max(...raw.map((q) => q.price));
  const minE = Math.min(...raw.map((q) => q.etaMins));
  const maxE = Math.max(...raw.map((q) => q.etaMins));
  const norm = (v: number, lo: number, hi: number) => (hi === lo ? 1 : 1 - (v - lo) / (hi - lo));

  const quotes: Quote[] = raw.map((q) => ({
    ...q,
    tags: [],
    // last-minute orders: reliability matters most, then price, then speed
    score: Math.round(
      q.partner.reliability * 0.5 + norm(q.price, minP, maxP) * 100 * 0.3 + norm(q.etaMins, minE, maxE) * 100 * 0.2,
    ),
  }));

  const best = (key: (q: Quote) => number) => quotes.reduce((a, b) => (key(b) > key(a) ? b : a));
  best((q) => -q.price).tags.push('cheapest');
  best((q) => q.partner.reliability).tags.push('most-reliable');
  best((q) => -q.etaMins).tags.push('fastest');
  best((q) => q.score).tags.push('best-value');

  return quotes.sort((a, b) => b.score - a.score);
}
