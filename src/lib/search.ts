import { CATEGORIES } from '../data/categories';
import type { Provider } from '../data/types';

export type Sort = 'best' | 'near' | 'fast' | 'cheap';

export function matches(p: Provider, q: string) {
  if (!q.trim()) return true;
  const cat = CATEGORIES.find((c) => c.id === p.categoryId);
  const hay = [p.name, p.bio, p.area, cat?.name, cat?.nameHi, ...p.services.map((s) => s.name)].join(' ').toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

export const fastest = (p: Provider) => Math.min(...p.services.map((s) => s.minutes));
export const cheapest = (p: Provider) => Math.min(...p.services.map((s) => s.price));

export function sortProviders(list: Provider[], sort: Sort) {
  const l = [...list];
  if (sort === 'near') l.sort((a, b) => a.distanceKm - b.distanceKm);
  if (sort === 'fast') l.sort((a, b) => fastest(a) - fastest(b));
  if (sort === 'cheap') l.sort((a, b) => cheapest(a) - cheapest(b));
  if (sort === 'best') l.sort((a, b) => b.rating * 2 - a.distanceKm * 0.3 - (a.rating * 2 - b.distanceKm * 0.3));
  return l;
}
