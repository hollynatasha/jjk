// Gojo / Unlimited Void. Original procedural art: a spark between the index
// and middle fingertips, a 200 ms freeze of the room, a thin white ring that
// races out from the hand, then a deep ultramarine "information ocean" of
// parallax rings, invented glyph marks and slow stars behind the performer.

import { TAU, glow, rgba, ease, range01, clamp01, lerp, sparkPath, drawTracked, fitFont, FONTS, polyline } from '../render/draw.js';

const C = {
  deep: '#01030c',
  navy: '#050c38',
  ultra: '#0c1f7a',
  ultraHi: '#1d3bb8',
  ice: '#cfe8ff',
  pale: '#9fd0ff',
  white: '#f4f9ff',
};

const GLYPH_KINDS = ['ring', 'dot', 'hbar', 'vbar', 'hook', 'tick', 'bracket', 'tri', 'cross'];

function makeGlyph(rng) {
  const n = rng.int(2, 4);
  const ops = [];
  for (let i = 0; i < n; i++) {
    ops.push({
      kind: rng.pick(GLYPH_KINDS),
      x: rng.pick([-0.7, 0, 0.7]),
      y: rng.pick([-0.7, 0, 0.7]),
      s: rng.range(0.35, 0.75),
      rot: rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]),
    });
  }
  return ops;
}

function drawGlyph(g, ops, size) {
  for (const o of ops) {
    const x = o.x * size;
    const y = o.y * size;
    const s = o.s * size;
    g.beginPath();
    switch (o.kind) {
      case 'ring':
        g.arc(x, y, s * 0.6, 0, TAU);
        g.stroke();
        break;
      case 'dot':
        g.arc(x, y, Math.max(0.6, s * 0.18), 0, TAU);
        g.fill();
        break;
      case 'hbar':
        g.moveTo(x - s, y);
        g.lineTo(x + s, y);
        g.stroke();
        break;
      case 'vbar':
        g.moveTo(x, y - s);
        g.lineTo(x, y + s);
        g.stroke();
        break;
      case 'hook':
        g.arc(x, y, s * 0.7, o.rot, o.rot + Math.PI / 2);
        g.stroke();
        break;
      case 'tick':
        g.moveTo(x - s * 0.5, y + s * 0.5);
        g.lineTo(x + s * 0.5, y - s * 0.5);
        g.stroke();
        break;
      case 'bracket': {
        const c = Math.cos(o.rot);
        const d = Math.sin(o.rot);
        const p = [[0.5, -1], [-0.5, -1], [-0.5, 1], [0.5, 1]].map(([u, v]) => [x + (u * c - v * d) * s * 0.6, y + (u * d + v * c) * s * 0.6]);
        g.moveTo(p[0][0], p[0][1]);
        for (let i = 1; i < p.length; i++) g.lineTo(p[i][0], p[i][1]);
        g.stroke();
        break;
      }
      case 'tri':
        g.moveTo(x, y - s * 0.6);
        g.lineTo(x + s * 0.55, y + s * 0.4);
        g.lineTo(x - s * 0.55, y + s * 0.4);
        g.closePath();
        g.stroke();
        break;
      case 'cross':
        g.moveTo(x - s * 0.5, y);
        g.lineTo(x + s * 0.5, y);
        g.moveTo(x, y - s * 0.5);
        g.lineTo(x, y + s * 0.5);
        g.stroke();
        break;
      default:
        break;
    }
  }
}

const FREEZE = [0.25, 0.45];

export default {
  id: 'unlimited-void',
  domain: 'gojo',
  title: 'UNLIMITED VOID',
  palette: C,

  init(rng, { W, H, low }) {
    const nStars = low ? 220 : 560;
    const nRings = low ? 22 : 40;
    const nGlyphs = low ? 30 : 72;
    const stars = Array.from({ length: nStars }, () => ({
      x: rng.range(-0.1, 1.1) * W,
      y: rng.range(-0.1, 1.1) * H,
      d: rng.range(0.15, 1),
      s: rng.range(0.4, 1.7),
      ph: rng.range(0, TAU),
      sp: rng.range(0.15, 0.5),
    }));
    const rings = Array.from({ length: nRings }, (_, i) => ({
      ox: rng.normal() * 0.05,
      oy: rng.normal() * 0.04,
      r: lerp(40, 1500, Math.pow(i / nRings, 1.6)) * rng.range(0.85, 1.15),
      tilt: rng.range(0.22, 0.95),
      rot: rng.range(0, TAU),
      spin: rng.range(-0.05, 0.05),
      w: rng.range(0.5, 2.1),
      a: rng.range(0.1, 0.42),
      dash: rng.chance(0.32) ? [rng.range(2, 8), rng.range(6, 24)] : null,
      d: rng.range(0.25, 1),
    }));
    const glyphs = Array.from({ length: nGlyphs }, () => ({
      x: rng.range(0, 1) * W,
      y: rng.range(0, 1) * H,
      d: rng.range(0.2, 1),
      size: rng.range(4, 11),
      rot: rng.range(0, TAU),
      spin: rng.range(-0.12, 0.12),
      vx: rng.normal() * 5,
      vy: rng.range(-12, -2),
      a: rng.range(0.35, 0.9),
      ops: makeGlyph(rng),
    }));
    const rays = Array.from({ length: low ? 14 : 28 }, () => ({ ang: rng.range(0, TAU), len: rng.range(0.55, 1), w: rng.range(0.012, 0.04), a: rng.range(0.25, 1) }));
    const currents = Array.from({ length: low ? 6 : 14 }, () => ({
      y: rng.range(0.56, 0.98),
      amp: rng.range(6, 22),
      freq: rng.range(0.006, 0.016),
      ph: rng.range(0, TAU),
      sp: rng.range(0.2, 0.6),
      a: rng.range(0.08, 0.22),
    }));
    return { stars, rings, glyphs, rays, currents, sparkSeed: rng.int(1, 1e9) };
  },

  /** Pre-trigger charging cue at the fingertips. */
  charge(g, f, p, sec) {
    const a = f.a;
    if (!a) return;
    const [t8, t12] = a.tips;
    const m = a.tipMid;
    glow(g, t8[0], t8[1], 10 + 16 * p, C.pale, 0.5 + 0.3 * p);
    glow(g, t12[0], t12[1], 10 + 16 * p, C.pale, 0.5 + 0.3 * p);
    g.save();
    g.strokeStyle = rgba(C.ice, 0.9);
    g.lineWidth = 2;
    g.lineCap = 'round';
    g.beginPath();
    g.arc(m[0], m[1], 34 + a.size * 0.05, -Math.PI / 2, -Math.PI / 2 + TAU * p);
    g.stroke();
    if (p > 0.45 && !f.reduced) {
      // a faint, slowly changing filament between the two tips
      const step = Math.floor(sec * 8);
      const pts = sparkPath(makeLocalRng(step), t8[0], t8[1], t12[0], t12[1], 5, 5);
      g.strokeStyle = rgba(C.white, 0.35 + 0.4 * (p - 0.45));
      g.lineWidth = 1.2;
      polyline(g, pts);
      g.stroke();
    }
    g.restore();
  },

  render(g, s, f) {
    const { W, H, t, ph } = f;
    const anchor = f.a ? f.a.tipMid : [W / 2, H / 2];
    const start = f.a0 ? f.a0.tipMid : anchor;
    const reduced = f.reduced;
    const ringStart = FREEZE[1];
    const ringDur = reduced ? 1.35 : 0.8;
    const ringP = range01(t, ringStart, ringStart + ringDur);
    const maxR = Math.hypot(Math.max(start[0], W - start[0]), Math.max(start[1], H - start[1])) * 1.05;
    const rOpen = (reduced ? ease.inOutSine(ringP) : ease.outCubic(ringP)) * maxR;
    const dis = ph.dissolve;
    const closing = dis > 0;
    const worldR = closing ? maxR * (1 - ease.inOut(dis)) : rOpen;
    const worldC = closing ? anchor : start;
    const worldFull = ringP >= 1 && !closing;

    // 1. The room: live, frozen for ~200 ms, then live again outside the ring.
    if (!worldFull) {
      const frozen = t >= FREEZE[0] && t < FREEZE[1];
      f.room.draw(g, { frozen });
      if (frozen) {
        g.save();
        g.globalCompositeOperation = 'saturation';
        g.fillStyle = 'rgba(128,128,128,0.65)';
        g.fillRect(0, 0, W, H);
        g.globalCompositeOperation = 'source-over';
        g.fillStyle = 'rgba(160,200,255,0.08)';
        g.fillRect(0, 0, W, H);
        g.restore();
      }
    }

    // 2. The world, revealed inside the ring.
    if (worldR > 1) {
      g.save();
      if (!worldFull) {
        g.beginPath();
        g.arc(worldC[0], worldC[1], worldR, 0, TAU);
        g.clip();
      }
      this.world(g, s, f, anchor, start);
      if (f.person.available) {
        f.person.silhouette(g, { delayMs: 420, color: '#6fa8ff', alpha: 0.26, dx: 12, dy: -6, scale: 1.015 });
        f.person.draw(g, { rim: 'rgba(175,225,255,0.95)', rimBlur: f.low ? 0 : 22, grade: '#2a4fd6', gradeAlpha: 0.14 });
      } else {
        f.portalRoom(g, { cx: W / 2, cy: H * 0.43, rx: W * 0.42, ry: H * 0.3, feather: 70, edge: 'soft', alpha: 1, grade: '#1d3bb8', gradeAlpha: 0.18 });
        g.strokeStyle = rgba(C.ice, 0.55);
        g.lineWidth = 1.5;
        g.beginPath();
        g.ellipse(W / 2, H * 0.43, W * 0.42, H * 0.3, 0, 0, TAU);
        g.stroke();
      }
      this.foreground(g, s, f, anchor, start);
      g.restore();
    }

    // 3. The ring itself.
    if (ringP > 0 && ringP < 1 && !closing) {
      g.save();
      g.strokeStyle = rgba(C.white, reduced ? 0.55 : 0.95);
      g.lineWidth = reduced ? 1.5 : 2.4;
      g.shadowColor = 'rgba(200,230,255,0.9)';
      g.shadowBlur = f.low ? 0 : 16;
      g.beginPath();
      g.arc(start[0], start[1], Math.max(1, rOpen), 0, TAU);
      g.stroke();
      g.restore();
    }
    if (closing && worldR > 2) {
      g.save();
      g.strokeStyle = rgba(C.ice, 0.5 * (1 - dis));
      g.lineWidth = 1.2;
      g.beginPath();
      g.arc(worldC[0], worldC[1], worldR, 0, TAU);
      g.stroke();
      g.restore();
    }

    // 4. Spark jumping between the fingertips (0-0.25 s).
    if (t < 0.32 && f.a) {
      const [t8, t12] = f.a.tips;
      const k = 1 - range01(t, 0.22, 0.32);
      const step = Math.floor(t * 18);
      const pts = sparkPath(makeLocalRng(s.sparkSeed + step), t8[0], t8[1], t12[0], t12[1], 7, 9);
      g.save();
      glow(g, f.a.tipMid[0], f.a.tipMid[1], 46, C.pale, 0.55 * k);
      g.strokeStyle = rgba(C.white, 0.95 * k);
      g.lineWidth = 2;
      g.lineJoin = 'round';
      g.shadowColor = 'rgba(160,210,255,1)';
      g.shadowBlur = f.low ? 0 : 12;
      polyline(g, pts);
      g.stroke();
      g.restore();
    }

    this.title(g, f);
  },

  world(g, s, f, anchor, start) {
    const { W, H, t, ph } = f;
    const dx = anchor[0] - start[0];
    const dy = anchor[1] - start[1];
    const vp = [W * 0.5 + dx * 0.12, H * 0.38 + dy * 0.08];
    const fade = ph.world > 0 ? 0.25 + 0.75 * ph.world : 0.25;
    const bg = g.createRadialGradient(vp[0], vp[1], 0, vp[0], vp[1], H * 0.95);
    bg.addColorStop(0, C.ultraHi);
    bg.addColorStop(0.18, C.ultra);
    bg.addColorStop(0.55, C.navy);
    bg.addColorStop(1, C.deep);
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);

    // far stars, parallax with the hand
    g.fillStyle = C.ice;
    for (const st of s.stars) {
      if (st.d >= 0.55) continue;
      const a = (0.25 + 0.5 * (0.5 + 0.5 * Math.sin(st.ph + t * st.sp * TAU))) * fade;
      g.globalAlpha = a;
      g.fillRect(st.x + dx * st.d * 0.25, st.y + dy * st.d * 0.25, st.s, st.s);
    }
    g.globalAlpha = 1;

    // radiant halo behind the performer, turning very slowly
    const hc = f.person.center || [W / 2, H * 0.36];
    const hr = H * 0.42;
    glow(g, hc[0], hc[1], hr, '#6f9dff', 0.32 * fade);
    g.save();
    g.translate(hc[0], hc[1]);
    g.rotate(t * 0.05);
    for (const r of s.rays) {
      g.fillStyle = rgba(C.ice, 0.05 * r.a * fade);
      g.beginPath();
      g.moveTo(0, 0);
      g.arc(0, 0, hr * r.len, r.ang - r.w, r.ang + r.w);
      g.closePath();
      g.fill();
    }
    g.restore();

    // parallax rings receding to a vanishing point near the hand
    const open = 0.55 + 0.45 * ease.outCubic(ph.rupture);
    g.save();
    for (const r of s.rings) {
      const cx = vp[0] + r.ox * W + dx * r.d * 0.2;
      const cy = vp[1] + r.oy * H + dy * r.d * 0.2;
      const rx = r.r * open * (1 + 0.02 * Math.sin(t * 0.6 + r.rot));
      g.strokeStyle = rgba(C.ice, r.a * fade);
      g.lineWidth = r.w;
      g.setLineDash(r.dash || []);
      g.beginPath();
      g.ellipse(cx, cy, rx, rx * r.tilt, r.rot + r.spin * t, 0, TAU);
      g.stroke();
    }
    g.setLineDash([]);
    g.restore();

    // slow currents along the lower half
    g.save();
    g.lineWidth = 1;
    for (const c of s.currents) {
      g.strokeStyle = rgba(C.pale, c.a * fade);
      g.setLineDash([2, 9]);
      g.lineDashOffset = -t * 40 * c.sp;
      g.beginPath();
      const y0 = c.y * H;
      for (let x = -20; x <= W + 20; x += 24) {
        const y = y0 + Math.sin(x * c.freq + c.ph + t * c.sp) * c.amp;
        if (x === -20) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
    g.setLineDash([]);
    g.restore();

    // invented glyph marks drifting in depth
    g.save();
    g.lineWidth = 1;
    for (const gl of s.glyphs) {
      if (gl.d > 0.8) continue;
      this.glyph(g, gl, t, dx, dy, fade, W, H);
    }
    g.restore();

    // near stars
    g.fillStyle = C.white;
    for (const st of s.stars) {
      if (st.d < 0.55) continue;
      const a = (0.35 + 0.5 * (0.5 + 0.5 * Math.sin(st.ph + t * st.sp * TAU))) * fade;
      g.globalAlpha = a;
      g.fillRect(st.x + dx * st.d * 0.45, st.y + dy * st.d * 0.45, st.s * 1.2, st.s * 1.2);
    }
    g.globalAlpha = 1;
  },

  glyph(g, gl, t, dx, dy, fade, W, H) {
    let x = gl.x + gl.vx * t + dx * gl.d * 0.35;
    let y = gl.y + gl.vy * t + dy * gl.d * 0.35;
    x = ((x % W) + W) % W;
    y = ((y % H) + H) % H;
    const size = gl.size * (0.6 + gl.d);
    g.save();
    g.translate(x, y);
    g.rotate(gl.rot + gl.spin * t);
    g.strokeStyle = rgba(C.ice, gl.a * fade * (0.4 + 0.6 * gl.d));
    g.fillStyle = g.strokeStyle;
    drawGlyph(g, gl.ops, size);
    g.restore();
  },

  foreground(g, s, f, anchor, start) {
    const { t, ph, W, H } = f;
    const dx = anchor[0] - start[0];
    const dy = anchor[1] - start[1];
    const fade = 0.25 + 0.75 * ph.world;
    g.save();
    g.lineWidth = 1.1;
    // a few near glyphs pass in front, kept faint so the face stays clear
    for (const gl of s.glyphs) {
      if (gl.d <= 0.8) continue;
      this.glyph(g, gl, t, dx, dy, fade * 0.7, W, H);
    }
    g.restore();
  },

  title(g, f) {
    const { W, H, t } = f;
    const t0 = f.reduced ? 1.9 : 1.55;
    if (t < t0) return;
    const out = 1 - ease.inOut(range01(t, 5.45, 6.2));
    if (out <= 0) return;
    g.save();
    const size = fitFont(g, 'UNLIMITED VOID', FONTS.serif, 400, 74, W * 0.84, 0.32);
    g.fillStyle = C.white;
    g.textBaseline = 'alphabetic';
    g.shadowColor = 'rgba(150,200,255,0.85)';
    g.shadowBlur = f.low ? 0 : 20;
    drawTracked(g, 'UNLIMITED VOID', W / 2, H * 0.865, size * 0.32, 'center', (i) => clamp01((t - t0 - i * 0.07) / 0.4) * out);
    g.shadowBlur = 0;
    g.font = `500 15px ${FONTS.mono}`;
    g.fillStyle = rgba(C.ice, 0.75 * out * clamp01((t - t0 - 0.8) / 0.6));
    drawTracked(g, 'domain permit hrd-01 · granted by the department', W / 2, H * 0.865 + 34, 1.5, 'center');
    g.restore();
  },
};

// Tiny deterministic generator for animation jitter that must not consume the cast rng.
function makeLocalRng(seed) {
  let a = seed >>> 0 || 1;
  return {
    next() {
      a ^= a << 13;
      a ^= a >>> 17;
      a ^= a << 5;
      return ((a >>> 0) % 100000) / 100000;
    },
  };
}
