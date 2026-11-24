// Gojo / Unlimited Void. Drawn in code, nothing traced from the anime.
// Order of events: spark between the index and middle tips, 200 ms freeze of
// the room, white ring out from the hand, then the blue space behind the
// performer (parallax rings, glyph marks, slow stars).

import { TAU, glow, rgba, ease, range01, clamp01, lerp, sparkPath, drawTracked, fitFont, FONTS, polyline } from '../render/draw.js';
import { drawClipCover } from '../media/clips.js';

const C = {
  deep: '#01020a',
  navy: '#050c38',
  ultra: '#0c1f7a',
  ultraHi: '#1d3bb8',
  ice: '#cfe8ff',
  pale: '#9fd0ff',
  white: '#f4f9ff',
  // the streak tunnel
  hot: '#ff2f6a',
  violet: '#6a2cff',
  lilac: '#d7c4ff',
  // the eye
  gold: '#f2e39a',
  jade: '#b8f5c8',
  cyan: '#7fdcff',
  iris: '#dfe3e6',
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
    const nGlyphs = low ? 18 : 40;
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
    // glyph columns pouring down the frame
    const streams = Array.from({ length: low ? 7 : 14 }, () => ({
      x: rng.range(0.02, 0.98),
      d: rng.range(0.25, 1),
      sp: rng.range(24, 90),
      gap: rng.range(24, 48),
      size: rng.range(5, 11),
      a: rng.range(0.45, 1),
      off: rng.range(0, 1),
      ops: Array.from({ length: 8 }, () => makeGlyph(rng)),
    }));
    // concentric tick rings behind the performer, reads like a slow dial
    const mandala = Array.from({ length: 3 }, (_, i) => ({
      r: 0.17 + i * 0.08,
      ticks: 24 + i * 18,
      len: rng.range(0.012, 0.026),
      spin: (i % 2 ? -1 : 1) * rng.range(0.03, 0.08),
      a: rng.range(0.22, 0.4),
      w: rng.range(0.8, 1.6),
    }));
    const currents = Array.from({ length: low ? 6 : 14 }, () => ({
      y: rng.range(0.56, 0.98),
      amp: rng.range(6, 22),
      freq: rng.range(0.006, 0.016),
      ph: rng.range(0, TAU),
      sp: rng.range(0.2, 0.6),
      a: rng.range(0.08, 0.22),
    }));
    // the tunnel the domain opens as: streaks racing out of the centre
    const streakRng = rng.fork('streaks');
    const streaks = Array.from({ length: low ? 90 : 190 }, () => ({
      ang: streakRng.range(0, TAU),
      r0: streakRng.range(0, 0.22),
      len: streakRng.range(0.35, 1.15),
      w: streakRng.range(1, 6),
      sp: streakRng.range(0.16, 0.6),
      hue: streakRng.pick(['hot', 'violet', 'lilac', 'white']),
      a: streakRng.range(0.35, 1),
      off: streakRng.range(0, 1),
    }));
    const nebRng = rng.fork('nebula');
    const nebula = Array.from({ length: low ? 10 : 20 }, () => ({
      x: nebRng.range(-0.1, 1.1),
      y: nebRng.range(0.38, 0.62),
      r: nebRng.range(0.07, 0.26),
      a: nebRng.range(0.12, 0.42),
      sp: nebRng.range(-0.012, 0.012),
      warm: nebRng.chance(0.25),
    }));
    const clouds = Array.from({ length: low ? 4 : 8 }, () => ({
      x: nebRng.range(-0.15, 1.15),
      y: nebRng.range(0.3, 0.95),
      r: nebRng.range(0.1, 0.3),
      a: nebRng.range(0.1, 0.3),
      sp: nebRng.range(-0.02, 0.02),
    }));
    const eyeRng = rng.fork('eye');
    const eyeArcs = Array.from({ length: 7 }, (_, i) => ({
      r: 0.82 + i * 0.045 + eyeRng.range(-0.015, 0.015),
      from: eyeRng.range(0, TAU),
      span: eyeRng.range(1.2, 5.6),
      w: eyeRng.range(1.5, 7),
      spin: eyeRng.range(-0.18, 0.18),
      tone: eyeRng.pick(['gold', 'jade', 'cyan', 'white']),
      a: eyeRng.range(0.4, 1),
    }));
    const fibres = Array.from({ length: low ? 40 : 90 }, () => ({
      ang: eyeRng.range(0, TAU),
      r0: eyeRng.range(0.42, 0.56),
      len: eyeRng.range(0.08, 0.3),
      w: eyeRng.range(0.6, 2.4),
      a: eyeRng.range(0.1, 0.5),
    }));
    return { stars, rings, glyphs, rays, currents, streams, mandala, streaks, nebula, clouds, eyeArcs, fibres, sparkSeed: rng.int(1, 1e9) };
  },

  // charging cue at the fingertips, before the trigger
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

    // the room runs live, freezes for ~200 ms, then runs again outside the ring
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

    if (worldR > 1) {
      g.save();
      if (!worldFull) {
        g.beginPath();
        g.arc(worldC[0], worldC[1], worldR, 0, TAU);
        g.clip();
      }
      this.world(g, s, f, anchor, start);
      if (f.particles) f.particles(g);
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

    // spark jumping between the fingertips, 0 to 0.25 s then it fades out
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

  },

  // Two acts on one clock: the streak tunnel first, then the eye opening over
  // it. Radii all come off the short side so it survives both stage shapes.
  world(g, s, f, anchor, start) {
    const { W, H, t, ph } = f;
    const R = Math.min(W, H);
    const dx = anchor[0] - start[0];
    const dy = anchor[1] - start[1];
    const c = (f.person && f.person.center) || [W * 0.5 + dx * 0.12, H * 0.42 + dy * 0.08];
    const fade = ph.world > 0 ? 0.25 + 0.75 * ph.world : 0.25;
    // eye takes over the second half of the sustained phase
    const eye = clamp01((t - 2.9) / 1.5);
    const tunnel = 1 - 0.75 * eye;

    // if a pre-rendered backdrop loaded, it replaces everything below;
    // the person and foreground still draw live over it back in render()
    if (f.clip && drawClipCover(g, f.clip, W, H)) return;

    g.fillStyle = C.deep;
    g.fillRect(0, 0, W, H);
    glow(g, c[0], c[1], R * 0.75, '#1a2a22', 0.3 * fade);

    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const n of s.nebula) {
      const x = (((n.x + n.sp * t) % 1.3) + 1.3) % 1.3 - 0.15;
      glow(g, x * W + dx * 0.1, n.y * H, n.r * R, n.warm ? C.gold : C.cyan, n.a * fade * (0.45 + 0.55 * eye));
    }
    g.restore();

    // the streak tunnel
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'butt';
    for (const st of s.streaks) {
      const travel = ((st.off + t * st.sp) % 1.35) - 0.1;
      const r0 = (st.r0 + travel) * R;
      if (r0 < R * 0.03) continue;
      const r1 = r0 + st.len * R * (0.4 + travel);
      const cos = Math.cos(st.ang);
      const sin = Math.sin(st.ang);
      const a = st.a * fade * tunnel * clamp01(1.25 - travel) * clamp01(travel * 6);
      if (a <= 0.01) continue;
      g.strokeStyle = rgba(C[st.hue] || C.white, a);
      g.lineWidth = st.w * (0.5 + travel);
      g.beginPath();
      g.moveTo(c[0] + cos * r0, c[1] + sin * r0);
      g.lineTo(c[0] + cos * r1, c[1] + sin * r1);
      g.stroke();
    }
    g.restore();

    // the iris mechanism at the centre of the tunnel, before the eye opens
    if (tunnel > 0.3) {
      g.save();
      g.translate(c[0], c[1]);
      g.rotate(t * 0.12);
      for (const m of s.mandala) {
        const r = R * m.r * 0.75;
        g.rotate(t * m.spin);
        g.strokeStyle = rgba(C.lilac, m.a * fade * tunnel);
        g.lineWidth = m.w;
        g.beginPath();
        g.arc(0, 0, r, 0, TAU);
        g.stroke();
        g.beginPath();
        for (let i = 0; i < m.ticks; i++) {
          const a = (i / m.ticks) * TAU;
          g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
          g.lineTo(Math.cos(a) * (r + R * m.len), Math.sin(a) * (r + R * m.len));
        }
        g.stroke();
      }
      g.restore();
    }

    // the eye
    if (eye > 0.001) {
      const k = ease.outCubic(eye);
      const rEye = R * 0.33 * k;
      const rPupil = rEye * 0.44;
      g.save();
      glow(g, c[0], c[1], rEye * 1.9, C.jade, 0.3 * k * fade);
      const ir = g.createRadialGradient(c[0], c[1], rPupil * 0.9, c[0], c[1], rEye);
      ir.addColorStop(0, 'rgba(255,255,255,0.9)');
      ir.addColorStop(0.45, 'rgba(190,196,200,0.5)');
      ir.addColorStop(1, 'rgba(120,130,135,0.12)');
      g.fillStyle = ir;
      g.beginPath();
      g.arc(c[0], c[1], rEye, 0, TAU);
      g.fill();
      // iris fibres
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (const fb of s.fibres) {
        const a = fb.a * k * fade;
        g.strokeStyle = rgba(C.iris, a);
        g.lineWidth = fb.w;
        const r0 = fb.r0 * rEye;
        const r1 = r0 + fb.len * rEye;
        const cos = Math.cos(fb.ang + t * 0.03);
        const sin = Math.sin(fb.ang + t * 0.03);
        g.beginPath();
        g.moveTo(c[0] + cos * r0, c[1] + sin * r0);
        g.lineTo(c[0] + cos * r1, c[1] + sin * r1);
        g.stroke();
      }
      g.restore();
      g.fillStyle = '#000';
      g.beginPath();
      g.arc(c[0], c[1], rPupil, 0, TAU);
      g.fill();
      // ringed arcs
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.lineCap = 'round';
      for (const arc of s.eyeArcs) {
        g.strokeStyle = rgba(C[arc.tone] || C.white, arc.a * k * fade * 0.85);
        g.lineWidth = arc.w;
        const from = arc.from + t * arc.spin;
        g.beginPath();
        g.arc(c[0], c[1], rEye * arc.r, from, from + arc.span);
        g.stroke();
      }
      g.restore();
      g.restore();
    }

    g.save();
    for (const cl of s.clouds) {
      const x = (((cl.x + cl.sp * t) % 1.4) + 1.4) % 1.4 - 0.2;
      glow(g, x * W, cl.y * H, cl.r * R, C.white, cl.a * fade * (0.5 + 0.5 * eye));
    }
    g.restore();

    // the information the domain buries you in, quieter than the tunnel
    g.save();
    g.globalAlpha = 0.3 + 0.2 * tunnel;
    g.lineWidth = 1;
    for (const st of s.streams) {
      const x = st.x * W + dx * st.d * 0.3;
      const scroll = (st.off * H + t * st.sp) % st.gap;
      g.strokeStyle = rgba(C.ice, st.a * fade * (0.35 + 0.65 * st.d) * 0.6);
      g.fillStyle = g.strokeStyle;
      for (let i = 0, y = -st.gap + scroll; y < H + st.gap; i++, y += st.gap) {
        g.save();
        g.translate(x, y + dy * st.d * 0.3);
        drawGlyph(g, st.ops[i % st.ops.length], st.size * (0.6 + st.d));
        g.restore();
      }
    }
    g.restore();

    // far stars, parallax with the hand
    g.fillStyle = C.ice;
    for (const st of s.stars) {
      const a = (0.2 + 0.4 * (0.5 + 0.5 * Math.sin(st.ph + t * st.sp * TAU))) * fade * (1 - 0.5 * eye);
      g.globalAlpha = a;
      g.fillRect(st.x + dx * st.d * 0.25, st.y + dy * st.d * 0.25, st.s, st.s);
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
    drawTracked(g, 'permit hrd-01 · granted by the department · @hollynst', W / 2, H * 0.865 + 34, 1.5, 'center');
    g.restore();
  },
};

// deterministic jitter for the animation. separate generator because it must not
// consume the cast rng, that would shift every later draw.
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
