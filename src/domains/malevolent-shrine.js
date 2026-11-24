// Sukuna / Malevolent Shrine.
//
// Flat paper cut-outs, all polygons built in code: tiered shrine, skull crown,
// bone rafters, a bone pile at the floor. Nothing traced from a frame, and it
// stops at bone.
//
// Order: hand midpoint lights up, ink spills over the floor, three paper layers
// unfold behind the performer, then crimson slashes leave torn gashes and ash.

import { TAU, glow, rgba, ease, range01, clamp01, lerp, polygon, tornOutline, fitFont, FONTS, drawTracked } from '../render/draw.js';
import { drawClipCover } from '../media/clips.js';

const C = {
  char: '#0b0606',
  charLift: '#1a0909',
  oxblood: '#6e1016',
  oxDeep: '#3a0a0d',
  ember: '#ff5a1f',
  emberHi: '#ffb36b',
  crimson: '#d4142a',
  ash: '#b9aea4',
  paper: '#ebe1cd',
  ink: '#050203',
};

function roof(cx, y, rw, rh, up) {
  return [
    [cx - rw, y + up],
    [cx - rw * 0.86, y - rh * 0.12],
    [cx - rw * 0.55, y - rh * 0.55],
    [cx - rw * 0.2, y - rh * 0.92],
    [cx - rw * 0.06, y - rh],
    [cx + rw * 0.06, y - rh],
    [cx + rw * 0.2, y - rh * 0.92],
    [cx + rw * 0.55, y - rh * 0.55],
    [cx + rw * 0.86, y - rh * 0.12],
    [cx + rw, y + up],
    [cx + rw * 0.72, y + up * 0.35],
    [cx - rw * 0.72, y + up * 0.35],
  ];
}

const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

/** Ellipse as a polygon, optionally rotated by `rot` radians. */
function ellipse(cx, cy, rx, ry, rot = 0, steps = 22) {
  const pts = [];
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * TAU;
    const x = Math.cos(a) * rx;
    const y = Math.sin(a) * ry;
    pts.push([cx + x * c - y * s, cy + x * s + y * c]);
  }
  return pts;
}

/** A capsule (long bone) between two points. */
function bone(x0, y0, x1, y1, w) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const l = Math.hypot(dx, dy) || 1;
  const nx = (-dy / l) * w;
  const ny = (dx / l) * w;
  const ex = (dx / l) * w * 0.8;
  const ey = (dy / l) * w * 0.8;
  return [
    [x0 + nx - ex, y0 + ny - ey], [x1 + nx + ex, y1 + ny + ey],
    [x1 + nx * 0.4 + ex * 1.6, y1 + ny * 0.4 + ey * 1.6],
    [x1 - nx * 0.4 + ex * 1.6, y1 - ny * 0.4 + ey * 1.6],
    [x1 - nx + ex, y1 - ny + ey], [x0 - nx - ex, y0 - ny - ey],
    [x0 - nx * 0.4 - ex * 1.6, y0 - ny * 0.4 - ey * 1.6],
    [x0 + nx * 0.4 - ex * 1.6, y0 + ny * 0.4 - ey * 1.6],
  ];
}

/** Fan of tusks behind the roof. Same crescent as the slashes, so they taper. */
function tusks(cx, y, r) {
  const out = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const spread = 0.4 + i * 0.34;
      const from = [cx + side * r * spread * 0.45, y + r * 0.15];
      const ctrl = [cx + side * r * spread * 1.45, y - r * 0.45];
      const to = [cx + side * r * (0.35 + spread * 0.72), y - r * (1.3 - i * 0.14)];
      out.push(crescent(quad(from, ctrl, to), r * (0.3 - i * 0.05), 1, 20));
    }
  }
  // the small paired horns on the ridge itself
  for (const side of [-1, 1]) {
    out.push(crescent(quad([cx + side * r * 0.06, y], [cx + side * r * 0.2, y - r * 0.2], [cx + side * r * 0.26, y - r * 0.42]), r * 0.07, 1, 10));
  }
  return out;
}

/**
 * Dark opening in the facade, ringed by teeth. `teeth` fills in the pale bone
 * colour, `dark` in the cut-out colour.
 */
function mouth(cx, cy, w, h) {
  const dark = [[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]];
  const teeth = [];
  const n = 7;
  const step = w / n;
  for (let i = 0; i < n; i++) {
    const x = cx - w / 2 + (i + 0.5) * step;
    const tw = step * 0.44;
    const len = h * (i === 0 || i === n - 1 ? 0.24 : 0.34);
    teeth.push([[x - tw, cy - h / 2 - 2], [x + tw, cy - h / 2 - 2], [x, cy - h / 2 + len]]);
    teeth.push([[x - tw, cy + h / 2 + 2], [x + tw, cy + h / 2 + 2], [x, cy + h / 2 - len]]);
  }
  return { dark, teeth };
}

/** Builds the three paper layers: far pavilion, flanking towers, near pillars. */
function buildPavilion(rng, W, H) {
  const base = H * 0.8;
  const far = [];
  const cx = W / 2;
  far.push(rect(cx - W * 0.47, base - 22, W * 0.94, 26));
  let y = base - 22;
  // wide eaves so the roofs clear a performer's head and shoulders
  const tiers = [
    { bw: W * 0.7, bh: H * 0.12, rw: W * 0.64, rh: H * 0.075 },
    { bw: W * 0.52, bh: H * 0.1, rw: W * 0.55, rh: H * 0.065 },
    { bw: W * 0.38, bh: H * 0.09, rw: W * 0.46, rh: H * 0.06 },
    { bw: W * 0.26, bh: H * 0.08, rw: W * 0.36, rh: H * 0.055 },
  ];
  for (const tier of tiers) {
    far.push(rect(cx - tier.bw / 2, y - tier.bh, tier.bw, tier.bh));
    y -= tier.bh;
    far.push(roof(cx, y, tier.rw, tier.rh, 16));
    y -= tier.rh * 0.75;
  }
  // bone parts fill pale so they read against the sky
  const crownBones = tusks(cx, y + H * 0.02, H * 0.14);
  const jaws = mouth(cx, base - H * 0.3, W * 0.3, H * 0.13);
  const farBones = [...jaws.teeth];
  // colonnade of bone pillars under the lowest roof
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const x0 = cx + side * W * (0.2 + i * 0.07);
      farBones.push(bone(x0, base - H * 0.3, x0 + side * 4, base - H * 0.1, 7));
    }
  }
  // window lattice cut-outs are drawn as darker bars on the far layer
  const lattice = [jaws.dark];
  for (let i = 0; i < 9; i++) lattice.push(rect(cx - W * 0.28 + i * W * 0.07, base - 22 - H * 0.1, 5, H * 0.085));

  const mid = [];
  for (const side of [-1, 1]) {
    const tx = cx + side * W * 0.4;
    mid.push(rect(tx - W * 0.07, base - H * 0.46, W * 0.14, H * 0.46));
    mid.push(roof(tx, base - H * 0.46, W * 0.13, H * 0.05, 10));
    mid.push(roof(tx, base - H * 0.53, W * 0.1, H * 0.045, 8));
    mid.push(rect(tx - 3, base - H * 0.6, 6, H * 0.06));
    // hanging banners
    mid.push(rect(tx - W * 0.018 + side * W * 0.06, base - H * 0.42, W * 0.036, H * 0.2));
  }
  // low fence
  for (let i = 0; i < 16; i++) mid.push(rect(W * 0.02 + i * W * 0.062, base - H * 0.045, 6, H * 0.045));
  mid.push(rect(0, base - H * 0.05, W, 7));
  // bone pile banked against the shrine floor
  const midBones = [];
  for (let i = 0; i < 14; i++) {
    const x = W * 0.04 + i * W * 0.068 + rng.normal() * 10;
    const py = base - H * 0.012 + rng.normal() * 6;
    midBones.push(ellipse(x, py, rng.range(26, 58), rng.range(7, 14), rng.range(-0.25, 0.25), 14));
    if (rng.chance(0.55)) {
      const len = rng.range(30, 70);
      const a = rng.range(-0.4, 0.4);
      midBones.push(bone(x - Math.cos(a) * len * 0.5, py - Math.sin(a) * len * 0.5 - 10, x + Math.cos(a) * len * 0.5, py + Math.sin(a) * len * 0.5 - 10, rng.range(3, 5.5)));
    }
  }

  const near = [];
  for (const side of [-1, 1]) {
    const px = side < 0 ? 0 : W - W * 0.09;
    near.push(rect(px, H * 0.05, W * 0.09, H * 0.95));
    near.push(rect(side < 0 ? 0 : W - W * 0.2, H * 0.09, W * 0.2, 14));
    near.push(rect(side < 0 ? 0 : W - W * 0.17, H * 0.12, W * 0.17, 10));
  }
  // paper tags hanging from the top beam
  const tags = [];
  for (let i = 0; i < 7; i++) {
    const x = W * 0.1 + i * W * 0.13 + rng.normal() * 8;
    tags.push({ x, len: H * rng.range(0.05, 0.12), w: rng.range(14, 22), sway: rng.range(0, TAU) });
  }

  const tear = (polys, amp) => polys.map((p) => tornOutline(p, rng, amp, 12));
  return {
    base,
    layers: [
      { polys: tear(far, 1.1), backBones: tear(crownBones, 1), bones: tear(farBones, 1), lattice: tear(lattice, 0.8), color: '#3a070c', bone: '#cdbca6', edge: 0.6, start: 0.38, dur: 0.55, sway: 0.004 },
      { polys: tear(mid, 1.3), bones: tear(midBones, 1.2), color: '#1b0406', bone: '#8d7f72', edge: 0.42, start: 0.55, dur: 0.5, sway: 0.006 },
      { polys: tear(near, 4), color: C.char, edge: 0.3, start: 0.72, dur: 0.45, sway: 0.0 },
    ],
    tags,
  };
}

function crescent(curve, w, uMax, steps = 28) {
  // curve(u) -> [x, y, nx, ny]; returns a filled crescent polygon tapering at the ends
  const top = [];
  const bot = [];
  for (let i = 0; i <= steps; i++) {
    const u = (i / steps) * uMax;
    const [x, y, nx, ny] = curve(u);
    const th = w * Math.sin(Math.PI * Math.min(1, u)) * 0.5 + 0.4;
    top.push([x + nx * th, y + ny * th]);
    bot.push([x - nx * th * 0.35, y - ny * th * 0.35]);
  }
  return top.concat(bot.reverse());
}

function quad(p0, p1, p2) {
  return (u) => {
    const a = 1 - u;
    const x = a * a * p0[0] + 2 * a * u * p1[0] + u * u * p2[0];
    const y = a * a * p0[1] + 2 * a * u * p1[1] + u * u * p2[1];
    const tx = 2 * a * (p1[0] - p0[0]) + 2 * u * (p2[0] - p1[0]);
    const ty = 2 * a * (p1[1] - p0[1]) + 2 * u * (p2[1] - p1[1]);
    const l = Math.hypot(tx, ty) || 1;
    return [x, y, -ty / l, tx / l];
  };
}

export default {
  id: 'malevolent-shrine',
  domain: 'sukuna',
  title: 'MALEVOLENT SHRINE',
  palette: C,

  init(rng, { W, H, low }) {
    // Waterline sits a bit above centre; the shrine stands on it and mirrors
    // into it. Built against a virtual height so its proportions survive any
    // stage shape, while sky, ink, slashes and ash use the real frame.
    const floorY = H * 0.56;
    const Hv = floorY / 0.8;
    // wide enough that the roofs and tusks reach past the performer rather than
    // hiding behind them
    const sceneW = Math.min(W * 0.95, Math.max(Hv * 1.1, W * 0.62));
    const pav = buildPavilion(rng.fork('pavilion'), sceneW, Hv);
    pav.sceneW = sceneW;
    pav.ox = (W - sceneW) / 2;
    const inkRng = rng.fork('ink');
    const blobs = Array.from({ length: low ? 14 : 26 }, () => {
      const x = W / 2 + inkRng.normal() * W * 0.3;
      const y = pav.base + inkRng.normal() * H * 0.02;
      const rx = inkRng.range(30, 95);
      return { x, y, rx, ry: rx * inkRng.range(0.09, 0.17), at: 0.22 + (Math.abs(x - W / 2) / W) * 0.9 + inkRng.range(0, 0.18) };
    });
    const slashRng = rng.fork('slash');
    const nSlash = low ? 5 : 8;
    const slashes = Array.from({ length: nSlash }, (_, i) => {
      const t0 = 1.35 + i * (4.0 / nSlash) + slashRng.range(-0.08, 0.08);
      const fromLeft = slashRng.chance(0.5);
      const y0 = slashRng.range(0.05, 0.8) * H;
      const y2 = Math.min(H * 0.95, Math.max(H * 0.04, y0 + slashRng.range(-0.35, 0.35) * H));
      const p0 = [fromLeft ? -40 : W + 40, y0];
      const p2 = [fromLeft ? W + 40 : -40, y2];
      const bulge = slashRng.range(0.12, 0.3) * H * slashRng.sign();
      const p1 = [W / 2 + slashRng.normal() * W * 0.1, (y0 + y2) / 2 + bulge];
      return { t0, p0, p1, p2, w: slashRng.range(10, 24), tear: tornOutline(crescent(quad(p0, p1, p2), slashRng.range(16, 30), 1, 24), slashRng, 3, 18) };
    });
    const ashRng = rng.fork('ash');
    const ash = Array.from({ length: low ? 70 : 170 }, () => ({
      x: ashRng.range(0, W),
      y: ashRng.range(H * 0.3, H * 1.05),
      vx: ashRng.normal() * 12,
      vy: ashRng.range(-55, -18),
      s: ashRng.range(1.2, 3.6),
      born: ashRng.range(0.6, 5.2),
      life: ashRng.range(1.6, 3.4),
      rot: ashRng.range(0, TAU),
      warm: ashRng.chance(0.3),
      front: ashRng.chance(0.18),
      wob: ashRng.range(0, TAU),
    }));
    const sparks = Array.from({ length: low ? 16 : 34 }, () => ({ ang: rng.range(-Math.PI, 0), sp: rng.range(80, 260), s: rng.range(1, 2.6), life: rng.range(0.4, 1.0) }));
    const speckRng = rng.fork('speck');
    const specks = Array.from({ length: 110 }, () => ({ x: speckRng.range(-0.5, 0.5), y: speckRng.range(-0.5, 0.5), r: speckRng.range(0.6, 2.4) }));
    const fibers = Array.from({ length: 22 }, () => ({ x: speckRng.range(-0.5, 0.5), y: speckRng.range(-0.5, 0.5), l: speckRng.range(0.04, 0.16), a: speckRng.range(0, TAU) }));
    return { pav, blobs, slashes, ash, sparks, specks, fibers };
  },

  charge(g, f, p, sec) {
    if (!f.a) return;
    const [x, y] = f.a.mid;
    const flick = 0.88 + 0.12 * Math.sin(sec * 7.0);
    glow(g, x, y, (14 + 26 * p) * flick, C.ember, 0.55 + 0.35 * p);
    glow(g, x, y, (5 + 9 * p) * flick, C.emberHi, 0.9);
    g.save();
    g.strokeStyle = rgba(C.ember, 0.9);
    g.lineWidth = 2;
    g.lineCap = 'round';
    g.beginPath();
    g.arc(x, y, 40 + f.a.size * 0.08, -Math.PI / 2, -Math.PI / 2 + TAU * p);
    g.stroke();
    g.restore();
  },

  /**
   * Three paper layers unfolding from the floor line, plus the tags and the
   * lantern glow. Called twice: once upright, once flipped into the water.
   */
  structure(g, s, f, fold, world) {
    const reducedStretch = f.reduced ? 1.6 : 1;
    const { t, H } = f;
    const SW = s.pav.sceneW;
    g.save();
    g.translate(s.pav.ox, 0);
    s.pav.layers.forEach((layer, i) => {
      const up = range01(t, layer.start * reducedStretch, (layer.start + layer.dur) * reducedStretch);
      const k = (f.reduced ? ease.inOutSine(up) : ease.outBack(up)) * (i === 2 ? fold : clamp01(fold * 1.15 - i * 0.08));
      if (k <= 0.001) return;
      g.save();
      g.translate(SW / 2, s.pav.base);
      g.transform(1, 0, Math.sin(t * 0.7 + i) * layer.sway, 1, 0, 0);
      g.scale(1, k);
      g.translate(-SW / 2, -s.pav.base);
      if (layer.backBones) {
        g.fillStyle = layer.bone;
        for (const poly of layer.backBones) {
          polygon(g, poly);
          g.fill();
        }
      }
      g.fillStyle = layer.color;
      for (const poly of layer.polys) {
        polygon(g, poly);
        g.fill();
      }
      if (layer.bones) {
        g.fillStyle = layer.bone;
        for (const poly of layer.bones) {
          polygon(g, poly);
          g.fill();
        }
      }
      if (layer.lattice) {
        g.fillStyle = '#1c0507';
        for (const poly of layer.lattice) {
          polygon(g, poly);
          g.fill();
        }
      }
      // edge glow on the eaves, or the architecture vanishes into the dark sky
      if (layer.edge) {
        g.save();
        g.strokeStyle = rgba(C.ember, layer.edge);
        g.lineWidth = i === 0 ? 2.2 : 1.4;
        if (!f.low) {
          g.shadowColor = rgba(C.emberHi, 0.9);
          g.shadowBlur = 14;
        }
        for (const poly of layer.polys) {
          polygon(g, poly);
          g.stroke();
        }
        g.restore();
      }
      g.restore();
    });

    // tags come in on the mid layer's timing
    const tagK = range01(t, 0.8, 1.3) * fold;
    if (tagK > 0) {
      g.save();
      g.fillStyle = rgba(C.paper, 0.75 * tagK);
      for (const tag of s.pav.tags) {
        const sway = Math.sin(t * 1.6 + tag.sway) * 0.06;
        g.save();
        g.translate(tag.x, H * 0.1);
        g.rotate(sway);
        g.fillRect(-tag.w / 2, 0, tag.w, tag.len * tagK);
        g.fillStyle = rgba(C.oxblood, 0.8 * tagK);
        g.fillRect(-tag.w / 2 + 3, tag.len * 0.25 * tagK, tag.w - 6, 3);
        g.fillStyle = rgba(C.paper, 0.75 * tagK);
        g.restore();
      }
      g.restore();
    }

    // Lanterns glow slowly (no strobe).
    if (world > 0.2) {
      for (const side of [-1, 1]) {
        for (const yy of [0.34, 0.2]) glow(g, SW / 2 + side * SW * 0.4, s.pav.base - H * yy, 34, C.ember, 0.4 * world * (0.75 + 0.25 * Math.sin(t * 1.1 + side + yy * 9)));
      }
    }
    g.restore();

  },

  render(g, s, f) {
    const { W, H, t, ph } = f;
    const mid = f.a ? f.a.mid : [W / 2, H * 0.55];
    const world = ph.world;
    const fold = 1 - ease.inOut(ph.dissolve);

    f.room.draw(g, {});
    // A loaded clip replaces the painted sky, water and shrine. Slashes, ash
    // and hand effects still draw live on top.
    const clipped = world > 0 && f.clip && drawClipCover(g, f.clip, W, H);
    if (world > 0 && !clipped) {
      g.save();
      g.globalAlpha = world;
      const bg = g.createLinearGradient(0, 0, 0, H);
      // a glowing backdrop so the paper layers read as cut-out silhouettes
      bg.addColorStop(0, '#2b0406');
      bg.addColorStop(0.18, '#7d150a');
      bg.addColorStop(0.36, '#c23c10');
      bg.addColorStop(0.52, '#4d0d07');
      bg.addColorStop(0.58, '#0b0406');
      bg.addColorStop(1, '#04080a');
      g.fillStyle = bg;
      g.fillRect(0, 0, W, H);
      glow(g, W / 2, s.pav.base - H * 0.22, W * 0.8, '#ff7a2a', 0.42 * (0.85 + 0.15 * Math.sin(t * 1.3)));
      // mist sitting on the water, which hides the seam between the two halves
      const mist = g.createLinearGradient(0, s.pav.base - H * 0.06, 0, s.pav.base + H * 0.07);
      mist.addColorStop(0, 'rgba(10,14,16,0)');
      mist.addColorStop(0.5, 'rgba(120,160,170,0.22)');
      mist.addColorStop(1, 'rgba(10,14,16,0)');
      g.fillStyle = mist;
      g.fillRect(0, s.pav.base - H * 0.06, W, H * 0.13);
      g.restore();
    }

    // The whole world creeps toward the camera for the length of the cast, so
    // the sustained phase never freezes.
    const base = s.pav.base;
    const push = 1 + 0.07 * ease.outCubic(clamp01(t / 6.5));
    if (!clipped) {
    g.save();
    g.translate(W / 2, base);
    g.scale(push, push);
    g.translate(-W / 2, -base);
    if (world > 0) {
      g.save();
      g.globalAlpha = world;
      const water = g.createLinearGradient(0, base, 0, H);
      water.addColorStop(0, '#0a1416');
      water.addColorStop(0.45, '#0d2a2f');
      water.addColorStop(1, '#061013');
      g.fillStyle = water;
      g.fillRect(0, base, W, H - base);
      // tiles running away from the camera
      g.strokeStyle = rgba('#5fe6ff', 0.14);
      g.lineWidth = 1;
      g.beginPath();
      for (let i = 1; i < 9; i++) {
        const y = base + ((H - base) * i * i) / 81;
        g.moveTo(0, y);
        g.lineTo(W, y);
      }
      for (let i = -6; i <= 6; i++) {
        g.moveTo(W / 2 + i * W * 0.08, base);
        g.lineTo(W / 2 + i * W * 0.42, H);
      }
      g.stroke();
      glow(g, W / 2, H, W * 0.8, '#2fd9ff', 0.22 * world);
      g.restore();

      // the reflection: flipped, dimmed, and cooled by the water
      g.save();
      g.beginPath();
      g.rect(0, base, W, H - base);
      g.clip();
      g.globalAlpha = 0.4 * world;
      g.translate(0, base * 2);
      g.scale(1, -1);
      this.structure(g, s, f, fold, world);
      g.restore();
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = rgba('#1d7f94', 0.1 * world);
      g.fillRect(0, base, W, H - base);
      g.restore();
    }

    this.structure(g, s, f, fold, world);
    g.restore();
    }

    // Slashes and the gashes they leave, behind the performer. They play
    // quieter over a clip backdrop, which brings its own smoke and embers; at
    // full strength they bury the architecture they are meant to cut across.
    const quiet = clipped ? 0.45 : 1;
    for (const sl of s.slashes) {
      const tt = t - sl.t0;
      if (tt < 0) continue;
      const tearA = clamp01(tt / 0.12) * (1 - range01(tt, 1.6, 3.4)) * fold * quiet;
      if (tearA > 0) {
        g.save();
        g.globalAlpha = tearA;
        polygon(g, sl.tear);
        const gr = g.createLinearGradient(sl.p0[0], sl.p0[1], sl.p2[0], sl.p2[1]);
        gr.addColorStop(0, '#2a0405');
        gr.addColorStop(0.5, '#7a1208');
        gr.addColorStop(1, '#2a0405');
        g.fillStyle = gr;
        g.fill();
        g.strokeStyle = rgba(C.emberHi, 0.55);
        g.lineWidth = 1.2;
        g.stroke();
        g.restore();
      }
      const sweep = clamp01(tt / (f.reduced ? 0.35 : 0.13));
      const fade = 1 - range01(tt, 0.18, f.reduced ? 1.4 : 0.9);
      if (fade > 0 && sweep > 0) {
        const poly = crescent(quad(sl.p0, sl.p1, sl.p2), sl.w, sweep);
        g.save();
        g.globalAlpha = fade * (f.reduced ? 0.7 : 1) * quiet;
        g.shadowColor = 'rgba(255,60,40,0.9)';
        g.shadowBlur = f.low ? 0 : 18;
        g.fillStyle = C.crimson;
        polygon(g, poly);
        g.fill();
        g.shadowBlur = 0;
        g.fillStyle = rgba('#ffd9c2', 0.85);
        polygon(g, crescent(quad(sl.p0, sl.p1, sl.p2), sl.w * 0.32, sweep));
        g.fill();
        g.restore();
      }
    }

    // ink spilling out across the floor from under the performer
    const spread = f.reduced ? 1.5 : 1;
    g.save();
    g.fillStyle = C.ink;
    for (const b of s.blobs) {
      const grow = ease.outCubic(range01(t, b.at * spread, b.at * spread + 0.45)) * (1 - ease.inOut(range01(ph.dissolve, 0, 0.85)));
      if (grow <= 0) continue;
      g.beginPath();
      g.ellipse(b.x, b.y, b.rx * grow, b.ry * grow, 0, 0, TAU);
      g.fill();
    }
    g.fillStyle = rgba(C.emberHi, 0.06 * world);
    for (const b of s.blobs) g.fillRect(b.x - b.rx * 0.4, b.y - b.ry * 0.2, b.rx * 0.5 * world, 1.2);
    g.restore();

    this.ashLayer(g, s, f, false);

    // The performer (or the camera portal when segmentation is off).
    if (f.particles) f.particles(g);
    if (f.person.available) {
      f.person.draw(g, { rim: 'rgba(255,96,48,0.85)', rimBlur: f.low ? 0 : 18, grade: '#8a1410', gradeAlpha: 0.16 * world });
    } else if (world > 0) {
      f.portalRoom(g, { cx: W / 2, cy: H * 0.46, rx: W * 0.4, ry: H * 0.31, feather: 26, edge: 'torn', alpha: 1, grade: '#8a1410', gradeAlpha: 0.2 * world });
    }

    this.ashLayer(g, s, f, true);

    // ember at the two-hand midpoint for the first 0.6 s, with rising sparks
    if (t < 0.6) {
      const k = 1 - range01(t, 0.35, 0.6);
      glow(g, mid[0], mid[1], 30 + 60 * ease.outCubic(range01(t, 0, 0.25)), C.ember, 0.75 * k);
      glow(g, mid[0], mid[1], 12, C.emberHi, 0.95 * k);
      g.save();
      g.fillStyle = C.emberHi;
      for (const sp of s.sparks) {
        const tt = t;
        if (tt > sp.life) continue;
        g.globalAlpha = (1 - tt / sp.life) * k;
        g.fillRect(mid[0] + Math.cos(sp.ang) * sp.sp * tt, mid[1] + Math.sin(sp.ang) * sp.sp * tt + 90 * tt * tt, sp.s, sp.s);
      }
      g.restore();
    }

  },

  ashLayer(g, s, f, front) {
    const { t, W, H } = f;
    // a clip backdrop brings its own embers, so dial this right down
    const quiet = f.clip ? 0.3 : 1;
    g.save();
    let i = 0;
    for (const a of s.ash) {
      if (a.front !== front) continue;
      // and thin the field by half
      if (f.clip && i++ % 2) continue;
      const tt = t - a.born;
      if (tt < 0 || tt > a.life) continue;
      const life = tt / a.life;
      const alpha = Math.sin(Math.PI * life) * (front ? 0.45 : 0.8) * (1 - f.ph.dissolve) * quiet;
      if (alpha <= 0) continue;
      const x = a.x + a.vx * tt + Math.sin(a.wob + tt * 2.2) * 10;
      const y = a.y + a.vy * tt;
      g.globalAlpha = alpha;
      g.fillStyle = a.warm ? C.emberHi : C.ash;
      g.save();
      g.translate(x, y);
      g.rotate(a.rot + tt * 1.5);
      g.fillRect(-a.s, -a.s * 0.5, a.s * 2, a.s);
      g.restore();
    }
    g.restore();
  },

  title(g, s, f) {
    const { W, H, t } = f;
    const t0 = f.reduced ? 2.05 : 1.75;
    if (t < t0) return;
    const out = 1 - ease.inOut(range01(t, 5.5, 6.1));
    if (out <= 0) return;
    const k = clamp01((t - t0) / (f.reduced ? 0.6 : 0.16));
    const scale = f.reduced ? 1 : 1.16 - 0.16 * ease.outCubic(k);
    const pw = W * 0.8;
    const phh = 128;
    g.save();
    g.translate(W / 2, H * 0.835);
    g.rotate(-0.045);
    g.scale(scale, scale);
    g.globalAlpha = out * (f.reduced ? k : clamp01(k * 3));
    // paper panel with fibres
    g.fillStyle = C.paper;
    g.shadowColor = 'rgba(0,0,0,0.6)';
    g.shadowBlur = f.low ? 0 : 20;
    g.fillRect(-pw / 2, -phh / 2, pw, phh);
    g.shadowBlur = 0;
    g.strokeStyle = 'rgba(120,90,70,0.18)';
    g.lineWidth = 1;
    for (const fb of s.fibers) {
      g.beginPath();
      g.moveTo(fb.x * pw, fb.y * phh);
      g.lineTo(fb.x * pw + Math.cos(fb.a) * fb.l * pw, fb.y * phh + Math.sin(fb.a) * fb.l * phh);
      g.stroke();
    }
    g.fillStyle = C.oxblood;
    const size = fitFont(g, 'MALEVOLENT SHRINE', FONTS.condensed, 400, 70, pw - 48, 0.04);
    g.textBaseline = 'middle';
    drawTracked(g, 'MALEVOLENT SHRINE', 0, -6, size * 0.04, 'center');
    // stamp erosion: paper-coloured specks over the ink
    g.fillStyle = C.paper;
    for (const sp of s.specks) {
      g.beginPath();
      g.arc(sp.x * (pw - 60), sp.y * size * 1.1 - 6, sp.r, 0, TAU);
      g.fill();
    }
    g.font = `500 13px ${FONTS.mono}`;
    g.fillStyle = rgba(C.oxDeep, 0.85);
    drawTracked(g, 'expansion hrd-02 · filed in ink · @hollynst', 0, phh / 2 - 18, 1.2, 'center');
    g.restore();
  },
};
