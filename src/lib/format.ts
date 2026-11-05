export const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

export function duration(mins: number) {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

/** "in 2 hr 15 min" / "15 min late" */
export function timeLeft(iso: string, nowMs = Date.now()) {
  const diff = Math.round((new Date(iso).getTime() - nowMs) / 60000);
  if (diff >= 0) return `in ${duration(Math.max(diff, 1))}`;
  return `${duration(-diff)} ago`;
}

export const minutesUntil = (iso: string) => Math.round((new Date(iso).getTime() - Date.now()) / 60000);

export function clock(iso: string) {
  const d = new Date(iso);
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ap}`;
}

export function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  const t = new Date();
  t.setDate(today.getDate() + 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  if (d.toDateString() === t.toDateString()) return 'Tomorrow';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function isOpenNow(from: string, to: string, d = new Date()) {
  const toMin = (s: string) => {
    const [h, m] = s.split(':').map(Number);
    return h * 60 + m;
  };
  const cur = d.getHours() * 60 + d.getMinutes();
  return cur >= toMin(from) && cur <= toMin(to);
}

export const to12h = (s: string) => {
  const [h, m] = s.split(':').map(Number);
  return `${h % 12 || 12}${m ? `:${m.toString().padStart(2, '0')}` : ''} ${h >= 12 ? 'PM' : 'AM'}`;
};
