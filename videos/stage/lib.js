/*
 * Tiny deterministic animation engine for the LastMinute videos.
 * Every element's look is a pure function of time t (seconds), so the renderer
 * can step frame by frame and get perfectly smooth, repeatable output.
 */
(() => {
  const C = {
    ink: '#111111', paper: '#FBF8F1', white: '#FFFFFF', muted: '#55524B',
    yellow: '#FFD21F', yellowSoft: '#FFE9A3', pink: '#FF4F7B', pinkSoft: '#FFC9D6',
    purple: '#5B3FE0', purpleSoft: '#D9D1FF', green: '#2DBE3A', greenSoft: '#C9F2C2',
    blue: '#1F6FEB', blueSoft: '#CFE0FF', orange: '#FF8A1F',
  };
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const ease = {
    out: (x) => 1 - Math.pow(1 - x, 3),
    inOut: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
    back: (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
  };
  const prog = (t, start, dur) => clamp((t - start) / dur);
  const lerp = (a, b, p) => a + (b - a) * p;

  const el = (tag, style = {}, html = '', parent) => {
    const e = document.createElement(tag);
    Object.assign(e.style, style);
    if (html) e.innerHTML = html;
    (parent ?? document.getElementById('stage')).appendChild(e);
    return e;
  };

  /** Registered per-frame updaters. */
  const updaters = [];
  const onFrame = (fn) => updaters.push(fn);

  /**
   * Animate an element in at `t0` and out at `t1`.
   * from: { x, y, s, r, o } offsets applied at the start of the enter animation.
   */
  function anim(e, t0, t1, { from = { y: 40 }, dur = 0.55, outDur = 0.35, easing = 'out', out = { y: -20 } } = {}) {
    onFrame((t) => {
      const pin = ease[easing](prog(t, t0, dur));
      const pout = t1 == null ? 0 : ease.inOut(prog(t, t1 - outDur, outDur));
      const vis = t >= t0 - 0.001 && (t1 == null || t <= t1 + 0.001);
      if (!vis) { e.style.opacity = 0; e.style.visibility = 'hidden'; return; }
      e.style.visibility = 'visible';
      const x = lerp(from.x ?? 0, 0, pin) + (out.x ?? 0) * pout;
      const y = lerp(from.y ?? 0, 0, pin) + (out.y ?? 0) * pout;
      const s = lerp(from.s ?? 1, 1, pin) * (1 + (out.s ?? 0) * pout);
      const r = lerp(from.r ?? 0, 0, pin);
      e.style.opacity = Math.min(lerp(from.o ?? 0, 1, pin), 1 - pout);
      e.style.transform = `${e.dataset.base ?? ''} translate(${x}px, ${y}px) scale(${s}) rotate(${r}deg)`;
    });
    return e;
  }

  /** Brutalist card with offset shadow. */
  const card = (style = {}, html = '', parent) =>
    el('div', { position: 'absolute', background: C.white, border: `5px solid ${C.ink}`, borderRadius: '28px', boxShadow: `12px 12px 0 ${C.ink}`, padding: '28px 34px', boxSizing: 'border-box', ...style }, html, parent);

  const text = (style, html, parent) => el('div', { position: 'absolute', fontFamily: 'Inter, Hind, sans-serif', color: C.ink, ...style }, html, parent);

  /**
   * Phone mock-up showing a captured app screen. `scroll` = [[t, y], …] keyframes
   * (y in CSS px of the 390-px-wide capture) to pan tall screenshots.
   */
  function phone({ x, y, w = 430, src, scroll = [[0, 0]], tilt = 0, parent }) {
    const h = Math.round(w * 2.165);
    const wrap = el('div', { position: 'absolute', left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` }, '', parent);
    wrap.dataset.base = `rotate(${tilt}deg)`;
    el('div', { position: 'absolute', left: '22px', top: '22px', width: '100%', height: '100%', background: C.ink, borderRadius: `${w * 0.13}px` }, '', wrap);
    const body = el('div', { position: 'absolute', inset: '0', background: C.ink, borderRadius: `${w * 0.13}px`, padding: `${w * 0.035}px`, boxSizing: 'border-box' }, '', wrap);
    const screen = el('div', { position: 'relative', width: '100%', height: '100%', overflow: 'hidden', borderRadius: `${w * 0.1}px`, background: C.paper }, '', body);
    const img = el('img', { position: 'absolute', left: '0', top: '0', width: '100%', display: 'block' }, '', screen);
    img.src = src;
    const scale = (w - 2 * w * 0.035) / 390;
    onFrame((t) => {
      let yv = scroll[0][1];
      for (let i = 0; i < scroll.length - 1; i++) {
        const [ta, ya] = scroll[i];
        const [tb, yb] = scroll[i + 1];
        if (t >= tb) yv = yb;
        else if (t > ta) { yv = lerp(ya, yb, ease.inOut((t - ta) / (tb - ta))); break; }
      }
      img.style.transform = `translateY(${-yv * scale}px)`;
    });
    return wrap;
  }

  /** Tap ripple at (x, y) inside a parent at time t0. */
  function tap(x, y, t0, parent) {
    const r = el('div', { position: 'absolute', left: `${x - 40}px`, top: `${y - 40}px`, width: '80px', height: '80px', borderRadius: '50%', border: `6px solid ${C.pink}`, background: 'rgba(255,79,123,0.25)', opacity: 0 }, '', parent);
    onFrame((t) => {
      const p = prog(t, t0, 0.6);
      r.style.opacity = p > 0 && p < 1 ? 1 - p : 0;
      r.style.transform = `scale(${0.4 + p})`;
    });
  }

  /** Counter that rolls from a to b. */
  function counter(e, t0, dur, a, b, fmt = (v) => Math.round(v).toLocaleString('en-IN')) {
    onFrame((t) => { e.textContent = fmt(lerp(a, b, ease.out(prog(t, t0, dur)))); });
  }

  /** Yellow backdrop with the pink circle and purple slab from the brand art. */
  function backdrop(W, H, { t0 = 0, t1 = null, bg = C.yellow, side = 'right' } = {}) {
    const g = el('div', { position: 'absolute', inset: '0', background: bg, overflow: 'hidden' });
    const circle = el('div', { position: 'absolute', width: `${H * 0.55}px`, height: `${H * 0.55}px`, borderRadius: '50%', background: C.pink, left: `${-H * 0.18}px`, top: `${H * (side === 'left' ? 0.02 : 0.18)}px` }, '', g);
    const slab = side === 'left'
      ? el('div', { position: 'absolute', width: `${W * 0.42}px`, height: `${H * 0.9}px`, background: C.purple, left: `${-W * 0.08}px`, bottom: `${-H * 0.5}px`, transform: 'rotate(14deg)' }, '', g)
      : el('div', { position: 'absolute', width: `${W * 0.6}px`, height: `${H * 0.9}px`, background: C.purple, right: `${-W * 0.12}px`, bottom: `${-H * 0.38}px`, transform: 'rotate(-14deg)' }, '', g);
    const baseRot = side === 'left' ? 14 : -14;
    onFrame((t) => {
      const vis = t >= t0 && (t1 == null || t <= t1);
      g.style.display = vis ? 'block' : 'none';
      circle.style.transform = `translate(${Math.sin(t * 0.4) * 30}px, ${Math.cos(t * 0.3) * 20}px)`;
      slab.style.transform = `rotate(${baseRot + Math.sin(t * 0.25) * 2}deg)`;
    });
    return g;
  }

  /** A scene = a group shown between t0 and t1 with a quick cross-fade. */
  function scene(t0, t1, style = {}) {
    const g = el('div', { position: 'absolute', inset: '0', ...style });
    onFrame((t) => {
      const fade = 0.3;
      const o = Math.min(prog(t, t0, fade), 1 - prog(t, t1 - fade, fade));
      g.style.display = t >= t0 && t <= t1 ? 'block' : 'none';
      g.style.opacity = o;
    });
    return g;
  }

  window.V = { C, el, card, text, phone, anim, tap, counter, backdrop, scene, onFrame, prog, ease, lerp, clamp };
  window.render = (t) => { for (const f of updaters) f(t); };
  /** wait until every image and font is ready before rendering frames */
  window.ready = async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = r; i.onerror = r; }))));
    return true;
  };
})();
