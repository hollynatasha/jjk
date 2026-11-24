// Megumi / Chimera Shadow Garden. Drawn in code, nothing traced.
// Shadow leaks out from under the hands, branches across the floor, and the
// room turns into an ink garden behind a red lattice. No shikigami get drawn,
// only the barrier.

import { TAU, glow, rgba, ease, range01, clamp01, lerp, fitFont, FONTS, drawTracked, withBloom, seedMotes, drawMotes, hexToRgb } from '../render/draw.js';
import { HAND_CONNECTIONS } from '../handmodel/synthetic.js';
import { drawClipCover } from '../media/clips.js';

const C = {
  ink: '#02040a',
  inkBlue: '#050b18',
  sky: '#02040b',
  deep: '#05070f',
  teal: '#5fe0c8',
  tealDim: '#1f6f6a',
  mist: '#9fe9da',
  title: '#dff0ff',
  // the barrier drawn around you, and the energy running through it
  grid: '#e0264a',
  gridHot: '#ff3b63',
  arc: '#6fd4ff',
  arcHot: '#eaf9ff',
  arcDeep: '#2a6cff',
  arcGreen: '#5dffae',
  arcGreenDeep: '#10a86a',
};

// lerp two hex colours. rgba() here only takes hex, so hand back hex.
function mixHex(a, b, k) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const hex = (n) => Math.round(clamp01(n / 255) * 255).toString(16).padStart(2, '0');
  return `#${hex(lerp(A[0], B[0], k))}${hex(lerp(A[1], B[1], k))}${hex(lerp(A[2], B[2], k))}`;
}

function persp(y, horizon, H) {
  return clamp01((y - horizon) / (H - horizon));
}

function handSilhouette(g, pts) {
  g.beginPath();
  const palm = [0, 1, 5, 9, 13, 17].map((i) => pts[i]);
  g.moveTo(palm[0][0], palm[0][1]);
  for (let i = 1; i < palm.length; i++) g.lineTo(palm[i][0], palm[i][1]);
  g.closePath();
  g.fill();
  for (const [a, b] of HAND_CONNECTIONS) {
    g.beginPath();
    g.moveTo(pts[a][0], pts[a][1]);
    g.lineTo(pts[b][0], pts[b][1]);
    g.stroke();
  }
}

export default {
  id: 'chimera-shadow-garden',
  domain: 'megumi',
  title: 'CHIMERA SHADOW GARDEN',
  palette: C,

  init(rng, { W, H, low }) {
    const horizon = H * 0.56;
    const dripRng = rng.fork('drips');
    const drips = Array.from({ length: low ? 10 : 22 }, (_, i) => ({
      hand: i % 2,
      t0: dripRng.range(0, 0.55),
      dx: dripRng.normal() * 10,
      floor: dripRng.range(H * 0.8, H * 0.93),
      r: dripRng.range(3, 6.5),
    }));
    const poolRng = rng.fork('pools');
    const nodes = [];
    const perTree = low ? 10 : 20;
    // roots go under the hands and at both frame edges, where the floor stays
    // visible around a performer in a portrait shot
    const roots = [[W * 0.4, H * 0.9, 0.3], [W * 0.6, H * 0.9, 0.32], [W * 0.07, H * 0.66, 0.42], [W * 0.93, H * 0.66, 0.44]];
    for (let tree = 0; tree < roots.length; tree++) {
      const [rootX, rootY, at] = roots[tree];
      const root = { x: rootX, y: rootY, at, r: 40, parent: null, depth: 0 };
      nodes.push(root);
      const frontier = [root];
      let count = 1;
      while (frontier.length && count < perTree) {
        const n = frontier.shift();
        const kids = poolRng.int(1, 3);
        for (let k = 0; k < kids && count < perTree; k++) {
          const ang = (poolRng.chance(0.5) ? 0 : Math.PI) + poolRng.normal() * 0.55;
          const p = persp(n.y, horizon, H) + 0.25;
          const dist = poolRng.range(34, 90) * p;
          const y = Math.min(H * 1.02, Math.max(horizon + 18, n.y + Math.sin(ang) * dist * 0.45 + poolRng.normal() * 10));
          const c = { x: n.x + Math.cos(ang) * dist, y, at: n.at + 0.08 + poolRng.range(0, 0.07), r: poolRng.range(16, 44) * (persp(y, horizon, H) + 0.3), parent: n, depth: n.depth + 1 };
          nodes.push(c);
          frontier.push(c);
          count++;
        }
      }
    }
    // the barrier grid, scrolling toward the camera
    const gridRng = rng.fork('grid');
    const grid = {
      rows: low ? 9 : 14,
      cols: low ? 10 : 16,
      drift: gridRng.range(0.05, 0.09),
      jitter: Array.from({ length: 20 }, () => gridRng.range(-0.004, 0.004)),
    };
    const arcRng = rng.fork('arcs');
    const nArcs = low ? 11 : 20;
    const tendrils = Array.from({ length: nArcs }, (_, i) => ({
      // fanned evenly across the upper half, then jittered
      ang: -Math.PI * 1.04 + (Math.PI * 1.08 * (i + 0.5)) / nArcs + arcRng.range(-0.08, 0.08),
      len: arcRng.range(0.42, 0.95),
      wob: arcRng.range(0.25, 0.9),
      ph: arcRng.range(0, TAU),
      sp: arcRng.range(0.5, 1.6),
      w: arcRng.range(1, 3.4),
      t0: arcRng.range(1.1, 2.0),
      branch: arcRng.range(0.45, 0.8),
      hot: arcRng.chance(0.3),
    }));
    const motes = seedMotes(rng.fork('motes'), low ? 26 : 60, { speed: [10, 46], size: [0.7, 2.6], life: [1.4, 3.6] });
    const flecks = Array.from({ length: low ? 20 : 48 }, () => ({ x: rng.range(0, W), off: rng.range(-12, 12), s: rng.range(1, 2.4) }));
    return { horizon, drips, nodes, grid, tendrils, motes, flecks };
  },

  charge(g, f, p, sec) {
    if (!f.a) return;
    g.save();
    g.fillStyle = C.ink;
    for (const h of f.a.hands) {
      const n = 1 + Math.floor(p * 3);
      for (let i = 0; i < n; i++) {
        const ph = ((sec * 0.9 + i / n) % 1);
        const y = h.bottom[1] + ph * ph * 60;
        g.globalAlpha = (1 - ph) * 0.85;
        g.beginPath();
        g.ellipse(h.bottom[0] + (i - 1) * 6, y, 3.5, 5.5, 0, 0, TAU);
        g.fill();
      }
    }
    g.globalAlpha = 1;
    g.strokeStyle = rgba(C.teal, 0.9);
    g.lineWidth = 2;
    g.lineCap = 'round';
    g.beginPath();
    g.arc(f.a.mid[0], f.a.mid[1], 42 + f.a.size * 0.08, -Math.PI / 2, -Math.PI / 2 + TAU * p);
    g.stroke();
    g.restore();
  },

  render(g, s, f) {
    const { W, H, t, ph } = f;
    const hands = f.a ? f.a.hands : [{ bottom: [W * 0.42, H * 0.62] }, { bottom: [W * 0.58, H * 0.62] }];
    const reduced = f.reduced;

    f.room.draw(g, {});

    // ink rises off the floor through the rupture, drains back out on dissolve
    const rise = reduced ? ease.inOutSine(ph.rupture) : ease.inOut(ph.rupture);
    const levelIn = H - (H + 60) * rise;
    const drain = ease.inOut(ph.dissolve);
    const levelTop = lerp(-60, H + 40, drain);
    if (rise > 0 && drain < 1) {
      g.save();
      g.beginPath();
      const top = Math.max(levelIn, levelTop);
      const wave = reduced ? 3 : 10;
      g.moveTo(0, H);
      for (let x = 0; x <= W; x += 24) g.lineTo(x, top + Math.sin(x * 0.02 + t * 2.4) * wave);
      g.lineTo(W, H);
      g.closePath();
      g.clip();
      this.garden(g, s, f);
      g.restore();
    }

    this.pools(g, s, f);
    if (!f.clip) withBloom(g, f, (gg) => this.tendrils(gg, s, f), { blur: 18, alpha: 0.85 });
    this.wave(g, s, f, false);

    if (f.particles) f.particles(g);
    if (f.person.available) {
      f.person.draw(g, { rim: 'rgba(111,212,255,0.8)', rimBlur: f.low ? 0 : 16, grade: '#0a1d3a', gradeAlpha: 0.22 * ph.world });
    } else if (ph.world > 0) {
      f.portalRoom(g, { cx: W / 2, cy: H * 0.44, rx: W * 0.41, ry: H * 0.3, feather: 60, edge: 'liquid', alpha: 1, grade: '#0a1d3a', gradeAlpha: 0.25 * ph.world, t });
    }

    // everything below here draws in front of the performer
    if (ph.world > 0.05) this.shadowHands(g, s, f);
    this.drips(g, s, f, hands);
    this.floorInk(g, s, f, hands);
    this.wave(g, s, f, true);
  },

  // Black, with a red perspective grid on the floor and overhead, both
  // scrolling toward the camera. Horizon sits where the shadow meets it.
  garden(g, s, f) {
    const { W, H, t } = f;
    const hz = s.horizon;
    const vx = W / 2;
    // if a backdrop clip loaded, it stands in for the barrier: starts pushed
    // in at 1.45 and pulls back to 1 over the first 4.2s
    const zoom = lerp(1.45, 1, ease.outCubic(clamp01(t / 4.2)));
    if (f.clip && drawClipCover(g, f.clip, W, H, zoom)) return;
    // slow creep toward the camera so the barrier is never a still image
    g.save();
    g.translate(vx, hz);
    const push = 1 + 0.06 * ease.outCubic(clamp01(t / 6.5));
    g.scale(push, push);
    g.translate(-vx, -hz);
    g.fillStyle = C.ink;
    g.fillRect(0, 0, W, H);
    glow(g, vx, hz, W * 0.75, '#12040d', 0.9);

    const gr = s.grid;
    const scroll = (t * gr.drift) % 1;
    g.save();
    g.lineCap = 'butt';
    // rails receding to the horizon, plus a fan running away from it
    for (const dir of [1, -1]) {
      const far = dir > 0 ? H : 0;
      for (let i = 0; i < gr.rows; i++) {
        const u = (i + scroll) / gr.rows;
        const d = Math.pow(u, 2.3);
        const y = hz + dir * (far - hz) * d;
        const a = (0.07 + 0.5 * d) * (dir > 0 ? 1 : 0.5);
        g.strokeStyle = rgba(C.grid, a);
        g.lineWidth = 0.6 + 2.2 * d;
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(W, y);
        g.stroke();
      }
      for (let i = 0; i <= gr.cols; i++) {
        const k = i / gr.cols - 0.5;
        g.strokeStyle = rgba(C.grid, dir > 0 ? 0.3 : 0.14);
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(vx + k * W * 0.1, hz);
        g.lineTo(vx + k * W * 3.4 + (gr.jitter[i % gr.jitter.length] || 0) * W, dir > 0 ? H : 0);
        g.stroke();
      }
    }
    // the horizon itself, hot where the grid converges
    g.strokeStyle = rgba(C.gridHot, 0.75);
    g.lineWidth = 1.4;
    g.shadowColor = rgba(C.gridHot, 0.9);
    g.shadowBlur = f.low ? 0 : 16;
    g.beginPath();
    g.moveTo(0, hz);
    g.lineTo(W, hz);
    g.stroke();
    g.restore();
    g.restore();
  },

  // Cursed energy whipping out of a point above the performer. Additive, so
  // the crossings burn out to white.
  tendrils(g, s, f) {
    const { W, H, t, ph } = f;
    if (ph.world <= 0) return;
    const R = Math.min(W, H);
    const src = [W / 2, H * 0.2];
    const fade = (1 - ease.inOut(ph.dissolve)) * clamp01(ph.world * 2);
    // comes up green, turns blue as the domain settles
    const blueness = ease.inOut(clamp01((t - 2.4) / 1.8));
    const body = mixHex(C.arcGreen, C.arc, blueness);
    const deep = mixHex(C.arcGreenDeep, C.arcDeep, blueness);
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const d of s.tendrils) {
      const age = t - d.t0;
      if (age < 0) continue;
      const grow = clamp01(age / 0.5);
      const a = d.hot ? 0.9 : 0.55;
      const len = d.len * R * grow;
      const steps = 7;
      const pts = [src];
      for (let i = 1; i <= steps; i++) {
        const u = i / steps;
        const wob = Math.sin(t * d.sp * 2.2 + d.ph + u * 5) * d.wob * R * 0.07 * u;
        const ang = d.ang + Math.sin(t * d.sp + d.ph) * 0.12;
        pts.push([
          src[0] + Math.cos(ang) * len * u - Math.sin(ang) * wob,
          src[1] + Math.sin(ang) * len * u + Math.cos(ang) * wob,
        ]);
      }
      for (const [col, w, al] of [[deep, d.w * 3.4, 0.16], [body, d.w * 1.5, 0.5], [C.arcHot, d.w * 0.5, a]]) {
        g.strokeStyle = rgba(col, al * fade);
        g.lineWidth = w;
        g.beginPath();
        g.moveTo(pts[0][0], pts[0][1]);
        for (const p of pts.slice(1)) g.lineTo(p[0], p[1]);
        g.stroke();
      }
      // one fork near the end
      const b = pts[Math.floor(steps * d.branch)];
      const tip = pts[pts.length - 1];
      g.strokeStyle = rgba(body, 0.3 * fade);
      g.lineWidth = d.w;
      g.beginPath();
      g.moveTo(b[0], b[1]);
      g.lineTo(b[0] + (tip[0] - b[0]) * 0.7 + Math.sin(t * 2 + d.ph) * R * 0.05, b[1] + (tip[1] - b[1]) * 0.4 - R * 0.04);
      g.stroke();
    }
    glow(g, src[0], src[1], R * 0.16, body, 0.32 * fade);
    glow(g, src[0], src[1], R * 0.05, C.arcHot, 0.5 * fade);
    g.restore();
    drawMotes(g, s.motes, f, body, 0.55 * fade);
  },

  pools(g, s, f) {
    const { t, ph, H } = f;
    const drain = ease.inOut(ph.dissolve);
    const stretch = f.reduced ? 1.4 : 1;
    g.save();
    for (const pass of [0, 1]) {
      for (const n of s.nodes) {
        const k = ease.outCubic(range01(t, n.at * stretch, n.at * stretch + 0.35)) * (1 - drain);
        if (k <= 0) continue;
        const r = n.r * k;
        if (pass === 0) {
          if (n.parent) {
            g.strokeStyle = C.ink;
            g.lineCap = 'round';
            g.lineWidth = Math.min(r, n.parent.r * k) * 0.55;
            g.beginPath();
            g.moveTo(n.parent.x, n.parent.y);
            g.lineTo(n.x, n.y);
            g.stroke();
          }
          g.fillStyle = C.ink;
          g.beginPath();
          g.ellipse(n.x, n.y, r, r * 0.34, 0, 0, TAU);
          g.fill();
        } else {
          // teal sheen = puddle reflection of the horizon light
          g.strokeStyle = rgba(C.teal, 0.18 * k);
          g.lineWidth = 1;
          g.beginPath();
          g.ellipse(n.x, n.y - r * 0.06, r * 0.7, r * 0.2, 0, Math.PI * 1.1, Math.PI * 1.9);
          g.stroke();
        }
      }
    }
    g.restore();
  },

  drips(g, s, f, hands) {
    const { t } = f;
    g.save();
    g.fillStyle = C.ink;
    for (const d of s.drips) {
      const h = hands[d.hand % hands.length];
      if (!h) continue;
      const tt = t - d.t0;
      if (tt < 0 || tt > 1.2) continue;
      const y = h.bottom[1] + 0.5 * 2600 * tt * tt;
      if (y > d.floor) continue;
      g.globalAlpha = 0.9;
      g.beginPath();
      g.ellipse(h.bottom[0] + d.dx, y, d.r * 0.8, d.r * 1.3, 0, 0, TAU);
      g.fill();
    }
    g.restore();
  },

  floorInk(g, s, f, hands) {
    const { W, H, t, ph } = f;
    const k = ease.outCubic(range01(t, 0.3, 1.4)) * (1 - ease.inOut(ph.dissolve));
    if (k <= 0) return;
    const lowest = Math.max(...hands.map((h) => h.bottom[1]));
    const top = Math.max(lowest + 90, H - H * 0.13 * k);
    g.save();
    g.beginPath();
    g.moveTo(0, H);
    for (let x = 0; x <= W; x += 20) g.lineTo(x, top + Math.sin(x * 0.03 + t * 2) * 7 + Math.sin(x * 0.011 - t) * 9);
    g.lineTo(W, H);
    g.closePath();
    const gr = g.createLinearGradient(0, top - 10, 0, H);
    gr.addColorStop(0, rgba(C.inkBlue, 0.0));
    gr.addColorStop(0.18, rgba(C.inkBlue, 0.88));
    gr.addColorStop(1, rgba(C.ink, 0.97));
    g.fillStyle = gr;
    g.fill();
    g.strokeStyle = rgba(C.teal, 0.25 * k);
    g.lineWidth = 1;
    g.stroke();
    g.restore();
  },

  shadowHands(g, s, f) {
    const delays = f.low ? [0.3, 0.65] : [0.18, 0.42, 0.68];
    const fade = f.ph.world;
    g.save();
    g.lineCap = 'round';
    g.lineJoin = 'round';
    delays.forEach((d, i) => {
      const past = f.hist(d);
      if (!past) return;
      const off = 62 + i * 46;
      g.globalAlpha = (0.3 - i * 0.07) * fade;
      g.fillStyle = C.inkBlue;
      g.strokeStyle = C.inkBlue;
      for (const hnd of past.hands) {
        g.lineWidth = Math.max(8, hnd.size * 0.12);
        g.save();
        g.translate((i % 2 ? -1 : 1) * off, off * 0.4);
        handSilhouette(g, hnd.pts);
        g.restore();
      }
    });
    g.restore();
  },

  wave(g, s, f, front) {
    const { W, H, t } = f;
    const t0 = f.reduced ? 4.2 : 4.4;
    const dur = f.reduced ? 1.4 : 1.0;
    const p = range01(t, t0, t0 + dur);
    if (p <= 0 || p >= 1) return;
    const e = f.reduced ? ease.inOutSine(p) : ease.inCubic(p);
    const crest = lerp(s.horizon - 20, H + 120, e);
    const height = lerp(30, 340, e);
    if (front && crest < H * 0.9) return;
    g.save();
    if (front) {
      g.beginPath();
      g.rect(0, H * 0.9, W, H * 0.1);
      g.clip();
    }
    g.beginPath();
    g.moveTo(0, crest + height);
    for (let x = 0; x <= W; x += 18) {
      const curl = Math.sin(x * 0.018 + t * 3) * 14 + Math.sin(x * 0.051 + t * 1.7) * 6;
      g.lineTo(x, crest + curl);
    }
    g.lineTo(W, crest + height);
    g.closePath();
    const gr = g.createLinearGradient(0, crest - 20, 0, crest + height);
    gr.addColorStop(0, rgba('#0b2a3a', 0.95));
    gr.addColorStop(0.15, rgba(C.inkBlue, 0.96));
    gr.addColorStop(1, rgba(C.ink, 0));
    g.fillStyle = gr;
    g.fill();
    g.fillStyle = rgba(C.teal, 0.5);
    for (const fl of s.flecks) g.fillRect(fl.x, crest + Math.sin(fl.x * 0.018 + t * 3) * 14 + fl.off - 4, fl.s, fl.s);
    g.restore();
  },

  title(g, f) {
    const { W, H, t } = f;
    const t0 = f.reduced ? 2.0 : 1.7;
    if (t < t0) return;
    const out = 1 - ease.inOut(range01(t, 5.45, 6.15));
    if (out <= 0) return;
    const rise = ease.outCubic(clamp01((t - t0) / 0.9));
    const y = H * 0.86;
    g.save();
    const size = fitFont(g, 'CHIMERA SHADOW GARDEN', FONTS.serif, 'italic 400', 64, W * 0.9, 0.08);
    g.textBaseline = 'alphabetic';
    // rising out of the ink: clip below a line that climbs with the letters
    g.save();
    g.beginPath();
    g.rect(0, y - size * 1.1, W, size * 1.1 * rise + 6);
    g.clip();
    g.globalAlpha = out;
    g.fillStyle = C.title;
    g.shadowColor = 'rgba(95,224,200,0.7)';
    g.shadowBlur = f.low ? 0 : 14;
    drawTracked(g, 'CHIMERA SHADOW GARDEN', W / 2, y + (1 - rise) * size * 0.5, size * 0.08, 'center');
    g.restore();
    // reflection
    g.save();
    g.globalAlpha = 0.18 * out * rise;
    g.translate(0, y * 2 + 10);
    g.scale(1, -0.55);
    g.fillStyle = C.teal;
    drawTracked(g, 'CHIMERA SHADOW GARDEN', W / 2, y, size * 0.08, 'center');
    g.restore();
    g.font = `500 14px ${FONTS.mono}`;
    g.fillStyle = rgba(C.mist, 0.7 * out * clamp01((t - t0 - 0.9) / 0.6));
    drawTracked(g, 'expansion hrd-03 · shadows on loan · @hollynst', W / 2, y + 52, 1.4, 'center');
    g.restore();
  },
};
