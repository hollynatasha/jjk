// Megumi / Chimera Shadow Garden. Liquid shadow leaks from beneath the hands,
// spreads across the floor in branching pools, and the room sinks into a
// deep ink garden with a faint teal horizon. Original angular animal shadows
// (heron, fox, ram, carp: none of them the anime's shikigami) rise and
// collapse into ripples, delayed shadow copies of the hands follow the
// performer, and one wave of shadow rolls toward the camera. No gore.

import { TAU, glow, rgba, ease, range01, clamp01, lerp, polygon, fitFont, FONTS, drawTracked } from '../render/draw.js';
import { HAND_CONNECTIONS } from '../handmodel/synthetic.js';

const C = {
  ink: '#02040a',
  inkBlue: '#050b18',
  sky: '#030712',
  deep: '#071521',
  teal: '#5fe0c8',
  tealDim: '#1f6f6a',
  mist: '#9fe9da',
  title: '#e3f8f3',
};

// Original low-poly silhouettes in a 100x100 box, feet/base at y=100.
const ANIMALS = {
  heron: [[44, 100], [46, 70], [38, 60], [30, 58], [26, 52], [34, 46], [48, 46], [58, 30], [56, 16], [62, 6], [70, 8], [92, 12], [72, 14], [68, 22], [70, 36], [64, 50], [72, 62], [60, 66], [54, 70], [56, 100], [52, 100], [50, 72], [48, 100]],
  fox: [[8, 100], [14, 78], [6, 64], [10, 54], [24, 58], [38, 52], [56, 52], [66, 40], [64, 22], [72, 34], [78, 22], [80, 38], [92, 46], [84, 52], [74, 56], [70, 70], [74, 100], [66, 100], [62, 74], [44, 72], [36, 100], [28, 100], [30, 72], [20, 74], [18, 100]],
  ram: [[18, 100], [20, 72], [14, 60], [22, 46], [40, 42], [60, 42], [66, 30], [62, 20], [70, 12], [82, 14], [88, 24], [84, 36], [76, 34], [74, 26], [70, 28], [74, 40], [80, 48], [76, 58], [68, 60], [70, 100], [62, 100], [58, 68], [36, 70], [32, 100], [26, 100], [26, 74]],
  carp: [[6, 62], [20, 48], [40, 40], [56, 32], [62, 22], [66, 34], [80, 40], [94, 30], [90, 54], [96, 74], [80, 64], [66, 70], [60, 84], [52, 72], [36, 76], [20, 74], [8, 68]],
};

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
    // Branching pool network from two landing zones under the hands.
    const poolRng = rng.fork('pools');
    const nodes = [];
    const perTree = low ? 10 : 20;
    // Pools start under the hands and at both edges of the frame, where the
    // floor stays visible around a performer in a portrait shot.
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
    const gardenRng = rng.fork('garden');
    const reeds = Array.from({ length: low ? 18 : 40 }, () => {
      const x = gardenRng.range(-20, W + 20);
      return { x, h: gardenRng.range(40, 170), bend: gardenRng.range(-30, 30), w: gardenRng.range(1, 2.6), ph: gardenRng.range(0, TAU) };
    });
    const stones = Array.from({ length: 9 }, () => ({ x: gardenRng.range(0, W), y: gardenRng.range(horizon + 10, horizon + 70), rx: gardenRng.range(18, 60), ry: gardenRng.range(7, 18) }));
    const trees = Array.from({ length: 3 }, (_, i) => ({ x: [W * 0.12, W * 0.86, W * 0.7][i], h: gardenRng.range(H * 0.18, H * 0.3), lean: gardenRng.range(-0.15, 0.15), branches: Array.from({ length: 5 }, () => ({ at: gardenRng.range(0.35, 0.9), len: gardenRng.range(30, 90), ang: gardenRng.range(-2.4, -0.7) * (gardenRng.chance(0.5) ? 1 : -1) })) }));
    const animalOrder = ['heron', 'fox', 'ram', 'carp'];
    const animalRng = rng.fork('animals');
    // They rise at the edges, beside the performer, where they stay visible.
    const xs = animalRng.shuffle([W * 0.13, W * 0.87, W * 0.2, W * 0.8]);
    const animals = animalOrder.map((kind, i) => ({
      kind,
      t0: 1.6 + i * 0.75 + animalRng.range(-0.1, 0.1),
      x: xs[i],
      baseY: horizon + animalRng.range(0.05, 0.11) * H,
      size: animalRng.range(170, 220),
      flip: xs[i] > W / 2,
    }));
    const flecks = Array.from({ length: low ? 20 : 48 }, () => ({ x: rng.range(0, W), off: rng.range(-12, 12), s: rng.range(1, 2.4) }));
    return { horizon, drips, nodes, reeds, stones, trees, animals, flecks };
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

    // Ink level rising from the floor during the rupture; draining during dissolve.
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
    this.animals(g, s, f);
    this.wave(g, s, f, false);

    if (f.person.available) {
      f.person.draw(g, { rim: 'rgba(95,224,200,0.75)', rimBlur: f.low ? 0 : 16, grade: '#0a1d3a', gradeAlpha: 0.22 * ph.world });
    } else if (ph.world > 0) {
      f.portalRoom(g, { cx: W / 2, cy: H * 0.44, rx: W * 0.41, ry: H * 0.3, feather: 60, edge: 'liquid', alpha: 1, grade: '#0a1d3a', gradeAlpha: 0.25 * ph.world, t });
    }

    // In front of the performer: delayed shadow hands, drips falling from the
    // real hands, and shadow flooding the bottom edge of the frame.
    if (ph.world > 0.05) this.shadowHands(g, s, f);
    this.drips(g, s, f, hands);
    this.floorInk(g, s, f, hands);
    this.wave(g, s, f, true);
    this.title(g, f);
  },

  garden(g, s, f) {
    const { W, H, t } = f;
    const hz = s.horizon;
    const sky = g.createLinearGradient(0, 0, 0, hz);
    sky.addColorStop(0, C.sky);
    sky.addColorStop(1, C.deep);
    g.fillStyle = sky;
    g.fillRect(0, 0, W, hz);
    const floor = g.createLinearGradient(0, hz, 0, H);
    floor.addColorStop(0, '#04101a');
    floor.addColorStop(1, C.ink);
    g.fillStyle = floor;
    g.fillRect(0, hz, W, H - hz);
    // faint teal horizon
    g.save();
    g.strokeStyle = rgba(C.teal, 0.45);
    g.lineWidth = 1.2;
    g.shadowColor = 'rgba(95,224,200,0.8)';
    g.shadowBlur = f.low ? 0 : 14;
    g.beginPath();
    g.moveTo(0, hz);
    g.lineTo(W, hz);
    g.stroke();
    g.restore();
    glow(g, W / 2, hz, W * 0.6, C.tealDim, 0.22);
    // mist bands
    for (let i = 0; i < 3; i++) {
      const y = hz - 40 - i * 70 + Math.sin(t * 0.3 + i) * 8;
      const m = g.createLinearGradient(0, y - 30, 0, y + 30);
      m.addColorStop(0, rgba(C.mist, 0));
      m.addColorStop(0.5, rgba(C.mist, 0.035));
      m.addColorStop(1, rgba(C.mist, 0));
      g.fillStyle = m;
      g.fillRect(0, y - 30, W, 60);
    }
    // ink trees: original brush-like trunks
    g.save();
    g.strokeStyle = '#03070d';
    g.lineCap = 'round';
    for (const tr of s.trees) {
      g.lineWidth = 9;
      const topX = tr.x + tr.lean * tr.h;
      g.beginPath();
      g.moveTo(tr.x, hz + 6);
      g.quadraticCurveTo(tr.x + tr.lean * tr.h * 0.3, hz - tr.h * 0.5, topX, hz - tr.h);
      g.stroke();
      g.lineWidth = 3;
      for (const b of tr.branches) {
        const bx = lerp(tr.x, topX, b.at);
        const by = hz - tr.h * b.at;
        g.beginPath();
        g.moveTo(bx, by);
        g.lineTo(bx + Math.cos(b.ang) * b.len, by + Math.sin(b.ang) * b.len * 0.6);
        g.stroke();
      }
    }
    g.restore();
    // stones
    g.fillStyle = '#03060c';
    for (const st of s.stones) {
      g.beginPath();
      g.ellipse(st.x, st.y, st.rx, st.ry, 0, 0, TAU);
      g.fill();
    }
    // reeds with a teal rim, swaying slowly
    g.save();
    for (const r of s.reeds) {
      const sway = Math.sin(t * 0.8 + r.ph) * 8;
      g.strokeStyle = '#04090f';
      g.lineWidth = r.w + 1;
      g.beginPath();
      g.moveTo(r.x, hz + 4);
      g.quadraticCurveTo(r.x + r.bend * 0.4, hz - r.h * 0.6, r.x + r.bend + sway, hz - r.h);
      g.stroke();
      g.strokeStyle = rgba(C.teal, 0.12);
      g.lineWidth = 0.8;
      g.stroke();
    }
    g.restore();
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

  animals(g, s, f) {
    const { t } = f;
    for (const an of s.animals) {
      const tt = t - an.t0;
      if (tt < 0 || tt > 2.6) continue;
      const riseK = ease.outCubic(clamp01(tt / 0.5));
      const collapse = range01(tt, 1.0, 1.6);
      const h = an.size * riseK * (1 - ease.inCubic(collapse) * 0.95);
      const pts = ANIMALS[an.kind];
      const sc = an.size / 100;
      if (h > 1) {
        g.save();
        // only the part above the pool surface is visible: it rises out of the liquid
        g.beginPath();
        g.rect(an.x - an.size, an.baseY - an.size * 1.2, an.size * 2, an.size * 1.2);
        g.clip();
        g.translate(an.x, an.baseY + (an.size - h) * 0.9);
        g.scale(an.flip ? -sc : sc, sc * (0.92 + 0.08 * riseK));
        g.translate(-50, -100);
        g.fillStyle = C.ink;
        polygon(g, pts);
        g.fill();
        g.strokeStyle = rgba(C.teal, 0.35);
        g.lineWidth = 1.2 / sc;
        g.stroke();
        g.restore();
        // faint reflection in the pool
        g.save();
        g.globalAlpha = 0.18 * riseK * (1 - collapse);
        g.translate(an.x, an.baseY + 6);
        g.scale(an.flip ? -sc : sc, -sc * 0.35);
        g.translate(-50, -100);
        g.fillStyle = rgba(C.teal, 0.5);
        polygon(g, pts);
        g.fill();
        g.restore();
      }
      // ripples after the collapse
      const rp = range01(tt, 1.25, 2.6);
      if (rp > 0 && rp < 1) {
        g.save();
        for (let k = 0; k < 3; k++) {
          const q = clamp01(rp - k * 0.15);
          if (q <= 0) continue;
          g.strokeStyle = rgba(C.teal, 0.35 * (1 - q));
          g.lineWidth = 1.2;
          g.beginPath();
          g.ellipse(an.x, an.baseY, an.size * 0.25 + q * an.size * 0.9, (an.size * 0.25 + q * an.size * 0.9) * 0.22, 0, 0, TAU);
          g.stroke();
        }
        g.restore();
      }
    }
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
    drawTracked(g, 'permit hrd-03 · shadows on loan', W / 2, y + 52, 1.4, 'center');
    g.restore();
  },
};
