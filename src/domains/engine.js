// Shared timed state engine. Every domain runs on the same clock:
//   0.00-0.25 s  hand charge
//   0.25-1.25 s  spatial rupture
//   1.25-5.80 s  sustained world
//   5.80-7.50 s  dissolve
// Reduced motion stretches the rupture and dissolve into slow wipes.
// Each cast is a record { domainId, seed, track, ... }; replaying the record
// re-runs the same seeded choreography along the same anchor path.

import { makeRng } from '../core/rng.js';
import { ease, clamp01 } from '../render/draw.js';

export const TIMELINE = { charge: [0, 0.25], rupture: [0.25, 1.25], sustain: [1.25, 5.8], dissolve: [5.8, 7.5], total: 7.5 };
export const TIMELINE_REDUCED = { charge: [0, 0.25], rupture: [0.25, 1.85], sustain: [1.85, 5.6], dissolve: [5.6, 7.9], total: 7.9 };

export function timelineFor(reduced) {
  return reduced ? TIMELINE_REDUCED : TIMELINE;
}

const span = (t, [a, b]) => clamp01((t - a) / (b - a));

export function phases(t, reduced = false) {
  const tl = timelineFor(reduced);
  const charge = span(t, tl.charge);
  const rupture = span(t, tl.rupture);
  const sustain = span(t, tl.sustain);
  const dissolve = span(t, tl.dissolve);
  const inWorld = ease.inOut(rupture);
  const outWorld = ease.inOut(dissolve);
  return { t, charge, rupture, sustain, dissolve, inWorld, outWorld, world: inWorld * (1 - outWorld), total: tl.total, tl };
}

/** Anchor geometry from hands already mapped to stage pixels. */
export function anchorsFromHands(hands) {
  if (!hands || !hands.length) return null;
  const hs = hands.map((h) => {
    const pts = h.pts;
    const palm = [0, 5, 9, 13, 17].map((i) => pts[i]);
    const center = [palm.reduce((s, p) => s + p[0], 0) / 5, palm.reduce((s, p) => s + p[1], 0) / 5];
    let bottom = pts[0];
    for (const p of pts) if (p[1] > bottom[1]) bottom = p;
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    return { pts: pts.map((p) => [p[0], p[1]]), center, bottom: [bottom[0], bottom[1]], size };
  });
  const mid = [hs.reduce((s, h) => s + h.center[0], 0) / hs.length, hs.reduce((s, h) => s + h.center[1], 0) / hs.length];
  const first = hs[0];
  const tips = [first.pts[8], first.pts[12]];
  const tipMid = [(tips[0][0] + tips[1][0]) / 2, (tips[0][1] + tips[1][1]) / 2];
  return { hands: hs, mid, tips, tipMid, size: hs.reduce((s, h) => s + h.size, 0) / hs.length };
}

function lerpAnchors(a, b, t) {
  if (!a) return b;
  if (!b) return a;
  const L = (p, q) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  const hands = a.hands.map((h, i) => {
    const o = b.hands[i];
    if (!o) return h;
    return { pts: h.pts.map((p, k) => L(p, o.pts[k])), center: L(h.center, o.center), bottom: L(h.bottom, o.bottom), size: h.size + (o.size - h.size) * t };
  });
  return { hands, mid: L(a.mid, b.mid), tips: [L(a.tips[0], b.tips[0]), L(a.tips[1], b.tips[1])], tipMid: L(a.tipMid, b.tipMid), size: a.size + (b.size - a.size) * t };
}

/** One running (or replayed) cast. */
export class CastRun {
  constructor(record, module, { W, H }) {
    this.record = record;
    this.module = module;
    this.W = W;
    this.H = H;
    this.replay = !!record.replayOf;
    this.rng = makeRng(record.seed);
    this.state = module.init(this.rng.fork('init'), { W, H, low: !!record.low, reduced: !!record.reduced });
    this.startedAt = null;
    this.track = this.replay ? record.track : [];
    this.lastRecordT = -1;
    this.last = record.track && record.track.length ? record.track[0].a : record.anchor0 || null;
    this.anchor0 = record.anchor0 || this.last;
    this.peakTaken = false;
  }

  begin(now) {
    this.startedAt = now;
  }

  t(now) {
    return this.startedAt === null ? 0 : Math.max(0, (now - this.startedAt) / 1000);
  }

  get total() {
    return timelineFor(!!this.record.reduced).total;
  }

  done(now) {
    return this.t(now) >= this.total;
  }

  /** Live casts record anchors at ~30 Hz; replays read them back. If hands vanish, the last anchor holds. */
  anchors(now, live) {
    const t = this.t(now);
    if (this.replay) {
      const tr = this.track;
      if (!tr.length) return this.last;
      let i = 0;
      while (i < tr.length - 1 && tr[i + 1].t <= t) i++;
      const a = tr[i];
      const b = tr[Math.min(i + 1, tr.length - 1)];
      const k = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 0;
      this.last = lerpAnchors(a.a, b.a, k);
      return this.last;
    }
    if (live) this.last = live;
    if (this.last && t - this.lastRecordT >= 1 / 30) {
      this.track.push({ t, a: this.last });
      this.lastRecordT = t;
    }
    return this.last;
  }

  /** Anchors at an earlier cast time (for delayed shadow copies). */
  anchorsAtTime(tq) {
    const tr = this.track;
    if (!tr.length || tq < 0) return null;
    let i = 0;
    while (i < tr.length - 1 && tr[i + 1].t <= tq) i++;
    const a = tr[i];
    const b = tr[Math.min(i + 1, tr.length - 1)];
    const k = b.t > a.t ? Math.min(1, Math.max(0, (tq - a.t) / (b.t - a.t))) : 0;
    return lerpAnchors(a.a, b.a, k);
  }

  /** The record to keep for Replay. */
  snapshot() {
    return { ...this.record, track: this.track.slice(), anchor0: this.anchor0 };
  }
}
