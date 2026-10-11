// Sukuna / Malevolent Shrine. Original paper-cut art, not a trace of the
// anime's shrine: the two-hand midpoint becomes an ember, black ink spills
// across the floor, a three-layer paper pavilion unfolds behind the
// performer, and crimson slash arcs cross around them leaving torn-paper gashes
// and drifting ash. Oxblood, ember orange and charcoal. No gore.

import { TAU, glow, rgba, ease, range01, clamp01, lerp, polygon, tornOutline, fitFont, FONTS, drawTracked } from '../render/draw.js';

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

/** Builds the three paper layers: far pavilion, flanking towers, near pillars. */
function buildPavilion(rng, W, H) {
  const base = H * 0.8;
  const far = [];
  const cx = W / 2;
  far.push(rect(cx - W * 0.47, base - 22, W * 0.94, 26));
  let y = base - 22;
  // Tall, wide-eaved tiers so the roofs reach past a performer's head and shoulders.
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
  far.push([[cx - 5, y + 6], [cx + 5, y + 6], [cx + 2, y - H * 0.06], [cx - 2, y - H * 0.06]]);
  // window lattice cut-outs are drawn as darker bars on the far layer
  const lattice = [];
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
      { polys: tear(far, 3.2), lattice: tear(lattice, 1.5), color: '#4a0b10', start: 0.38, dur: 0.55, sway: 0.004 },
      { polys: tear(mid, 2.6), color: '#220608', start: 0.55, dur: 0.5, sway: 0.006 },
      { polys: tear(near, 4), color: C.char, start: 0.72, dur: 0.45, sway: 0.0 },
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
    const pav = buildPavilion(rng.fork('pavilion'), W, H);
    const inkRng = rng.fork('ink');
    const blobs = Array.from({ length: low ? 26 : 46 }, () => {
      const x = W / 2 + inkRng.normal() * W * 0.33;
      const y = H * 0.86 + inkRng.normal() * H * 0.045;
      const rx = inkRng.range(40, 150);
      return { x, y, rx, ry: rx * inkRng.range(0.22, 0.34), at: 0.22 + (Math.abs(x - W / 2) / W) * 0.9 + inkRng.range(0, 0.18) };
    });
    const slashRng = rng.fork('slash');
    const nSlash = low ? 7 : 12;
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

  render(g, s, f) {
    const { W, H, t, ph } = f;
    const mid = f.a ? f.a.mid : [W / 2, H * 0.55];
    const world = ph.world;
    const fold = 1 - ease.inOut(ph.dissolve);

    f.room.draw(g, {});
    if (world > 0) {
      g.save();
      g.globalAlpha = world;
      const bg = g.createLinearGradient(0, 0, 0, H);
      // a glowing backdrop so the paper layers read as cut-out silhouettes
      bg.addColorStop(0, '#1a0405');
      bg.addColorStop(0.35, '#5a1208');
      bg.addColorStop(0.62, '#b8360f');
      bg.addColorStop(0.8, '#3a0b07');
      bg.addColorStop(1, '#080303');
      g.fillStyle = bg;
      g.fillRect(0, 0, W, H);
      glow(g, W / 2, s.pav.base - H * 0.3, W * 0.95, '#ff7a2a', 0.38 * (0.85 + 0.15 * Math.sin(t * 1.3)));
      g.restore();
    }

    // Paper pavilion: three layers unfold upward from the floor line, staggered.
    const reducedStretch = f.reduced ? 1.6 : 1;
    s.pav.layers.forEach((layer, i) => {
      const up = range01(t, layer.start * reducedStretch, (layer.start + layer.dur) * reducedStretch);
      const k = (f.reduced ? ease.inOutSine(up) : ease.outBack(up)) * (i === 2 ? fold : clamp01(fold * 1.15 - i * 0.08));
      if (k <= 0.001) return;
      g.save();
      g.translate(W / 2, s.pav.base);
      g.transform(1, 0, Math.sin(t * 0.7 + i) * layer.sway, 1, 0, 0);
      g.scale(1, k);
      g.translate(-W / 2, -s.pav.base);
      g.fillStyle = layer.color;
      for (const poly of layer.polys) {
        polygon(g, poly);
        g.fill();
      }
      if (layer.lattice) {
        g.fillStyle = '#1c0507';
        for (const poly of layer.lattice) {
          polygon(g, poly);
          g.fill();
        }
      }
      // paper edge highlight on the far layer
      if (i === 0) {
        g.strokeStyle = rgba(C.emberHi, 0.22);
        g.lineWidth = 1;
        for (const poly of layer.polys) {
          polygon(g, poly);
          g.stroke();
        }
      }
      g.restore();
    });

    // Hanging paper tags (mid layer timing).
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
        for (const yy of [0.34, 0.2]) glow(g, W / 2 + side * W * 0.4, s.pav.base - H * yy, 34, C.ember, 0.4 * world * (0.75 + 0.25 * Math.sin(t * 1.1 + side + yy * 9)));
      }
    }

    // Slashes and the torn gashes they leave, behind the performer.
    for (const sl of s.slashes) {
      const tt = t - sl.t0;
      if (tt < 0) continue;
      const tearA = clamp01(tt / 0.12) * (1 - range01(tt, 1.6, 3.4)) * fold;
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
        g.globalAlpha = fade * (f.reduced ? 0.7 : 1);
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

    // Ink spilling across the floor, spreading outward from under the performer.
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
    if (f.person.available) {
      f.person.draw(g, { rim: 'rgba(255,96,48,0.85)', rimBlur: f.low ? 0 : 18, grade: '#8a1410', gradeAlpha: 0.16 * world });
    } else if (world > 0) {
      f.portalRoom(g, { cx: W / 2, cy: H * 0.46, rx: W * 0.4, ry: H * 0.31, feather: 26, edge: 'torn', alpha: 1, grade: '#8a1410', gradeAlpha: 0.2 * world });
    }

    this.ashLayer(g, s, f, true);

    // Ember at the two-hand midpoint (0-0.4 s) with rising sparks.
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

    this.title(g, s, f);
  },

  ashLayer(g, s, f, front) {
    const { t, W, H } = f;
    g.save();
    for (const a of s.ash) {
      if (a.front !== front) continue;
      const tt = t - a.born;
      if (tt < 0 || tt > a.life) continue;
      const life = tt / a.life;
      const alpha = Math.sin(Math.PI * life) * (front ? 0.45 : 0.8) * (1 - f.ph.dissolve);
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
    drawTracked(g, 'permit hrd-02 · filed in ink', 0, phh / 2 - 18, 1.2, 'center');
    g.restore();
  },
};
