// Higuruma / Deadly Sentencing. The courtroom premise is official; everything
// drawn here is original: an amber line shoots from the hands, folds into a
// perspective courtroom frame, and the room becomes an administrative
// tribunal of floating paper strips, oversized numbered stamps, witness lights,
// a faceless balance and Holly's R&D permit. A giant rubber stamp approves it,
// then the tribunal crumbles back into the live room. No judge character, no
// anime courtroom design, no dialogue.

import { TAU, glow, rgba, ease, range01, clamp01, lerp, polygon, fitFont, FONTS, drawTracked } from '../render/draw.js';

const C = {
  parchment: '#e9dfc4',
  parchDim: '#b9ad8e',
  black: '#0b0a08',
  wall: '#14110c',
  side: '#0d0b08',
  brass: '#b08d57',
  brassHi: '#e2c07a',
  red: '#d7261e',
  amber: '#ffcf7a',
};

const STRIP_TEXT = ['§ 4.1(b) domain use', 'FORM DP-7 · rev 3', 'clause 12: vibes', 'HRD-0001', 'request: expand', 'see annex Q', 'approved? pending', 'filed by: holly', 'reviewed by: holly', 'budget: none', 'headcount: 1', 'motion to proceed'];
const PERMIT_LINES = ['Applicant: Holly', 'Department: R&D (headcount 1)', 'Request: expand one domain', 'Risk assessment: acceptable vibes', 'Witnesses: also Holly'];
const IMPACT = 4.15;

export default {
  id: 'deadly-sentencing',
  domain: 'higuruma',
  title: 'DEADLY SENTENCING',
  palette: C,

  init(rng, { W, H, low }) {
    const back = { x: W * 0.19, y: H * 0.17, w: W * 0.62, h: H * 0.42 };
    const stripRng = rng.fork('strips');
    const strips = Array.from({ length: low ? 12 : 26 }, () => ({
      x: stripRng.range(0, W),
      y: stripRng.range(0, H),
      d: stripRng.range(0.3, 1),
      w: stripRng.range(80, 220),
      h: stripRng.range(12, 24),
      rot: stripRng.range(-0.6, 0.6),
      vr: stripRng.range(-0.25, 0.25),
      vx: stripRng.range(-14, 14),
      vy: stripRng.range(-22, -6),
      text: stripRng.pick(STRIP_TEXT),
      front: stripRng.chance(0.2),
    }));
    const stampRng = rng.fork('stamps');
    const stamps = Array.from({ length: low ? 4 : 7 }, (_, i) => ({
      x: stampRng.range(0.08, 0.92) * W,
      y: stampRng.range(0.12, 0.7) * H,
      r: stampRng.range(46, 92),
      round: stampRng.chance(0.55),
      n: String(stampRng.int(1, 99)).padStart(2, '0'),
      rot: stampRng.range(-0.4, 0.4),
      vr: stampRng.range(-0.06, 0.06),
      bob: stampRng.range(0, TAU),
      i,
    }));
    const lights = [0.22, 0.5, 0.78].map((x, i) => ({ x: x * W, ph: rng.range(0, TAU), sp: rng.range(0.35, 0.6), w: rng.range(0.16, 0.24) * W, i }));
    // Crumble fragments: a jittered triangle grid over the whole stage.
    const fragRng = rng.fork('frag');
    const cols = low ? 4 : 6;
    const rows = low ? 6 : 10;
    const gx = (c) => (c / cols) * W;
    const gy = (r) => (r / rows) * H;
    const pts = [];
    for (let r = 0; r <= rows; r++) {
      pts.push([]);
      for (let c = 0; c <= cols; c++) {
        const edge = r === 0 || c === 0 || r === rows || c === cols;
        pts[r].push([gx(c) + (edge ? 0 : fragRng.normal() * W * 0.03), gy(r) + (edge ? 0 : fragRng.normal() * H * 0.015)]);
      }
    }
    const frags = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const a = pts[r][c];
        const b = pts[r][c + 1];
        const cc = pts[r + 1][c + 1];
        const d = pts[r + 1][c];
        for (const tri of fragRng.chance(0.5) ? [[a, b, cc], [a, cc, d]] : [[a, b, d], [b, cc, d]]) {
          const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3;
          const cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
          frags.push({ tri, cx, cy, delay: (1 - cy / H) * 0.25 + fragRng.range(0, 0.3), vx: fragRng.normal() * 60, vr: fragRng.normal() * 2.2 });
        }
      }
    }
    const speckRng = rng.fork('speck');
    const specks = Array.from({ length: 70 }, () => ({ x: speckRng.range(-0.5, 0.5), y: speckRng.range(-0.5, 0.5), r: speckRng.range(0.6, 2.2) }));
    const permit = { x: W * 0.05, y: H * 0.14, w: W * 0.42, h: 200, rot: -0.05 };
    return { back, strips, stamps, lights, frags, specks, permit, shake: rng.range(0, TAU) };
  },

  charge(g, f, p, sec) {
    if (!f.a) return;
    const [x, y] = f.a.mid;
    const L = 30 + 90 * p;
    g.save();
    g.strokeStyle = rgba(C.amber, 0.95);
    g.lineWidth = 2;
    g.shadowColor = 'rgba(255,200,110,0.9)';
    g.shadowBlur = f.low ? 0 : 10;
    g.beginPath();
    g.moveTo(x - L, y);
    g.lineTo(x + L, y);
    g.stroke();
    g.shadowBlur = 0;
    g.strokeStyle = rgba(C.brassHi, 0.9);
    g.beginPath();
    g.arc(x, y, 44 + f.a.size * 0.08, -Math.PI / 2, -Math.PI / 2 + TAU * p);
    g.stroke();
    g.restore();
  },

  render(g, s, f) {
    const { W, H, t, ph } = f;
    const mid = f.a0 ? f.a0.mid : [W / 2, H * 0.55];
    const crumble = ph.dissolve;

    // Impact shake (never in reduced motion).
    const shake = !f.reduced && t > IMPACT && t < IMPACT + 0.22 ? (1 - (t - IMPACT) / 0.22) * 4 : 0;
    g.save();
    if (shake) g.translate(Math.sin(t * 90 + s.shake) * shake, Math.cos(t * 70) * shake);

    f.room.draw(g, {});

    if (crumble > 0) {
      // Render the tribunal once into a buffer, then let it fall apart in pieces.
      const buf = f.temp(0);
      const bg = buf.getContext('2d');
      bg.setTransform(1, 0, 0, 1, 0, 0);
      bg.clearRect(0, 0, W, H);
      this.tribunal(bg, s, f, 1);
      this.permitLayer(bg, s, f);
      const k = f.reduced ? ease.inOutSine(crumble) : crumble;
      for (const fr of s.frags) {
        const q = clamp01((k - fr.delay) / 0.55);
        if (q >= 1) continue;
        const fall = f.reduced ? 0 : 900 * q * q;
        const alpha = f.reduced ? 1 - q : 1 - ease.inCubic(q);
        if (alpha <= 0) continue;
        g.save();
        g.globalAlpha = alpha;
        g.translate(fr.cx + fr.vx * q, fr.cy + fall);
        g.rotate(fr.vr * q);
        g.translate(-fr.cx, -fr.cy);
        polygon(g, fr.tri);
        g.clip();
        const xs = fr.tri.map((p) => p[0]);
        const ys = fr.tri.map((p) => p[1]);
        const x0 = Math.max(0, Math.floor(Math.min(...xs)) - 2);
        const y0 = Math.max(0, Math.floor(Math.min(...ys)) - 2);
        const x1 = Math.min(W, Math.ceil(Math.max(...xs)) + 2);
        const y1 = Math.min(H, Math.ceil(Math.max(...ys)) + 2);
        if (x1 > x0 && y1 > y0) g.drawImage(buf, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
        g.restore();
      }
    } else {
      this.tribunal(g, s, f, ph.inWorld);
      this.permitLayer(g, s, f);
    }

    if (f.person.available) {
      f.person.draw(g, { rim: 'rgba(226,192,122,0.8)', rimBlur: f.low ? 0 : 16, grade: '#6b4a1c', gradeAlpha: 0.12 * ph.world });
    } else if (ph.world > 0) {
      f.portalRoom(g, { cx: W / 2, cy: H * 0.5, rx: W * 0.36, ry: H * 0.3, feather: 10, edge: 'rect', alpha: 1, grade: '#6b4a1c', gradeAlpha: 0.16 * ph.world });
      g.strokeStyle = rgba(C.brass, 0.8 * ph.world);
      g.lineWidth = 3;
      g.strokeRect(W / 2 - W * 0.36, H * 0.5 - H * 0.3, W * 0.72, H * 0.6);
    }

    // front paper strips (few, faint)
    if (ph.world > 0 && crumble < 1) this.strips(g, s, f, true);

    this.line(g, s, f, mid);
    this.stamp(g, s, f);
    this.title(g, f);
    g.restore();
  },

  /** The amber line that shoots from the hands and folds into the courtroom frame. */
  line(g, s, f, mid) {
    const { t, W, H } = f;
    const b = s.back;
    const slow = f.reduced ? 1.5 : 1;
    if (t > 1.3 * slow) return;
    const shoot = ease.outCubic(range01(t, 0, 0.25));
    const move = ease.inOut(range01(t, 0.25, 0.55 * slow));
    const fold = ease.inOut(range01(t, 0.5 * slow, 0.85 * slow));
    const close = ease.inOut(range01(t, 0.8 * slow, 1.05 * slow));
    const fade = 1 - range01(t, 1.05 * slow, 1.3 * slow);
    const half = (b.w / 2) * shoot;
    const cx = lerp(mid[0], b.x + b.w / 2, move);
    const cy = lerp(mid[1], b.y + b.h, move);
    g.save();
    g.strokeStyle = rgba(C.amber, 0.95 * fade);
    g.lineWidth = 2.4;
    g.shadowColor = 'rgba(255,200,110,0.9)';
    g.shadowBlur = f.low ? 0 : 14;
    g.lineJoin = 'round';
    g.beginPath();
    const sideH = b.h * fold;
    g.moveTo(cx - half, cy - sideH);
    g.lineTo(cx - half, cy);
    g.lineTo(cx + half, cy);
    g.lineTo(cx + half, cy - sideH);
    if (close > 0) {
      g.moveTo(cx - half, cy - sideH);
      g.lineTo(cx - half + half * close, cy - sideH);
      g.moveTo(cx + half, cy - sideH);
      g.lineTo(cx + half - half * close, cy - sideH);
    }
    g.stroke();
    g.restore();
  },

  tribunal(g, s, f, reveal) {
    const { W, H, t } = f;
    const b = s.back;
    const slow = f.reduced ? 1.5 : 1;
    const extrude = ease.inOut(range01(t, 0.85 * slow, 1.25 * slow));
    const A = reveal * extrude;
    if (A <= 0) return;
    g.save();
    g.globalAlpha = A;
    const bx0 = b.x;
    const by0 = b.y;
    const bx1 = b.x + b.w;
    const by1 = b.y + b.h;
    const L = (p, q) => [lerp(p[0], q[0], extrude), lerp(p[1], q[1], extrude)];
    const c0 = L([bx0, by0], [0, 0]);
    const c1 = L([bx1, by0], [W, 0]);
    const c2 = L([bx1, by1], [W, H]);
    const c3 = L([bx0, by1], [0, H]);
    g.fillStyle = '#070605';
    polygon(g, [c0, c1, [bx1, by0], [bx0, by0]]);
    g.fill();
    g.fillStyle = C.side;
    polygon(g, [c0, [bx0, by0], [bx0, by1], c3]);
    g.fill();
    polygon(g, [c1, c2, [bx1, by1], [bx1, by0]]);
    g.fill();
    g.fillStyle = '#0a0806';
    polygon(g, [c3, [bx0, by1], [bx1, by1], c2]);
    g.fill();
    g.fillStyle = C.wall;
    g.fillRect(bx0, by0, b.w, b.h);
    // wainscoting and panels on the back wall
    g.strokeStyle = rgba(C.parchment, 0.12);
    g.lineWidth = 1;
    for (let i = 1; i < 6; i++) {
      g.beginPath();
      g.moveTo(bx0 + (b.w * i) / 6, by0 + b.h * 0.55);
      g.lineTo(bx0 + (b.w * i) / 6, by1);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(bx0, by0 + b.h * 0.55);
    g.lineTo(bx1, by0 + b.h * 0.55);
    g.stroke();
    // perspective floor grid in brass
    g.strokeStyle = rgba(C.brass, 0.32);
    for (let i = 0; i <= 8; i++) {
      const x = lerp(bx0, bx1, i / 8);
      const xf = lerp(0, W, i / 8);
      g.beginPath();
      g.moveTo(x, by1);
      g.lineTo(lerp(x, xf, extrude), lerp(by1, H, extrude));
      g.stroke();
    }
    for (let j = 1; j <= 5; j++) {
      const q = Math.pow(j / 5, 1.8);
      const y = lerp(by1, H, q * extrude);
      const xl = lerp(bx0, 0, q * extrude);
      const xr = lerp(bx1, W, q * extrude);
      g.beginPath();
      g.moveTo(xl, y);
      g.lineTo(xr, y);
      g.stroke();
    }
    // frame edges
    g.strokeStyle = rgba(C.amber, 0.55);
    g.lineWidth = 2;
    g.strokeRect(bx0, by0, b.w, b.h);
    g.beginPath();
    for (const [p, q] of [[[bx0, by0], c0], [[bx1, by0], c1], [[bx1, by1], c2], [[bx0, by1], c3]]) {
      g.moveTo(p[0], p[1]);
      g.lineTo(q[0], q[1]);
    }
    g.stroke();

    // shifting witness lights
    for (const l of s.lights) {
      const ang = Math.sin(t * l.sp + l.ph) * 0.28;
      const ax = l.x;
      const ay = -20;
      const len = H * 1.05;
      const bx = ax + Math.sin(ang) * len;
      const byy = ay + Math.cos(ang) * len;
      const gr = g.createLinearGradient(ax, ay, bx, byy);
      gr.addColorStop(0, rgba(C.amber, 0.2));
      gr.addColorStop(1, rgba(C.amber, 0));
      g.fillStyle = gr;
      polygon(g, [[ax - 6, ay], [ax + 6, ay], [bx + l.w / 2, byy], [bx - l.w / 2, byy]]);
      g.fill();
    }

    this.stamps(g, s, f);
    this.balance(g, s, f);
    this.strips(g, s, f, false);
    g.restore();
  },

  stamps(g, s, f) {
    const { t } = f;
    g.save();
    for (const st of s.stamps) {
      const y = st.y + Math.sin(t * 0.7 + st.bob) * 8;
      g.save();
      g.translate(st.x, y);
      g.rotate(st.rot + st.vr * t);
      g.strokeStyle = rgba(C.brass, 0.28);
      g.fillStyle = rgba(C.brass, 0.22);
      g.lineWidth = 3;
      if (st.round) {
        g.beginPath();
        g.arc(0, 0, st.r, 0, TAU);
        g.stroke();
        g.beginPath();
        g.arc(0, 0, st.r * 0.78, 0, TAU);
        g.stroke();
      } else {
        g.strokeRect(-st.r, -st.r * 0.6, st.r * 2, st.r * 1.2);
      }
      g.font = `700 ${Math.round(st.r * 0.7)}px ${FONTS.mono}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(st.n, 0, 2);
      g.restore();
    }
    g.restore();
  },

  balance(g, s, f) {
    const { W, H, t } = f;
    const cx = W / 2;
    const top = H * 0.065;
    const beam = 120;
    // undecided until the stamp lands, then it settles on the approving side
    const decided = ease.outBack(range01(t, IMPACT, IMPACT + 0.6));
    const tilt = lerp(Math.sin(t * 1.3) * 0.14, -0.22, decided);
    g.save();
    g.strokeStyle = rgba(C.brassHi, 0.85);
    g.fillStyle = rgba(C.brassHi, 0.85);
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(cx, top - 26);
    g.lineTo(cx, top + 56);
    g.stroke();
    g.beginPath();
    g.moveTo(cx - 22, top + 58);
    g.lineTo(cx + 22, top + 58);
    g.stroke();
    g.translate(cx, top);
    g.rotate(tilt);
    g.beginPath();
    g.moveTo(-beam, 0);
    g.lineTo(beam, 0);
    g.stroke();
    for (const side of [-1, 1]) {
      g.save();
      g.translate(side * beam, 0);
      g.rotate(-tilt);
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(-26, 52);
      g.moveTo(0, 0);
      g.lineTo(26, 52);
      g.stroke();
      g.beginPath();
      g.ellipse(0, 54, 32, 8, 0, 0, Math.PI);
      g.fill();
      g.restore();
    }
    g.beginPath();
    g.arc(0, 0, 5, 0, TAU);
    g.fill();
    g.restore();
  },

  strips(g, s, f, front) {
    const { t, W, H } = f;
    g.save();
    g.font = `500 10px ${FONTS.mono}`;
    g.textBaseline = 'middle';
    for (const st of s.strips) {
      if (st.front !== front) continue;
      let x = st.x + st.vx * t;
      let y = st.y + st.vy * t;
      x = ((x % (W + 200)) + W + 200) % (W + 200) - 100;
      y = ((y % (H + 200)) + H + 200) % (H + 200) - 100;
      g.save();
      g.translate(x, y);
      g.rotate(st.rot + st.vr * t);
      g.globalAlpha = (front ? 0.5 : 0.85) * (0.4 + 0.6 * st.d);
      g.fillStyle = C.parchment;
      g.fillRect(-st.w / 2, -st.h / 2, st.w, st.h);
      g.fillStyle = rgba(C.black, 0.7);
      g.fillText(st.text, -st.w / 2 + 6, 0);
      g.restore();
    }
    g.restore();
  },

  permitLayer(g, s, f) {
    const { t, ph } = f;
    const p = s.permit;
    const appear = ease.outCubic(range01(t, 1.35, 1.9)) * (ph.inWorld > 0 ? 1 : 0);
    if (appear <= 0) return;
    const bob = Math.sin(t * 1.2) * 4;
    g.save();
    g.globalAlpha = appear;
    g.translate(p.x + p.w / 2, p.y + p.h / 2 + bob + (1 - appear) * 30);
    g.rotate(p.rot);
    g.shadowColor = 'rgba(0,0,0,0.6)';
    g.shadowBlur = f.low ? 0 : 18;
    g.fillStyle = C.parchment;
    g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    g.shadowBlur = 0;
    g.strokeStyle = rgba(C.black, 0.5);
    g.lineWidth = 1;
    g.strokeRect(-p.w / 2 + 6, -p.h / 2 + 6, p.w - 12, p.h - 12);
    g.fillStyle = C.black;
    g.textBaseline = 'top';
    g.font = `700 13px ${FONTS.mono}`;
    g.fillText('R&D DOMAIN PERMIT', -p.w / 2 + 16, -p.h / 2 + 16);
    g.font = `500 10px ${FONTS.mono}`;
    g.fillText('form dp-7 · no. hrd-0004', -p.w / 2 + 16, -p.h / 2 + 34);
    g.font = `400 12px ${FONTS.sans}`;
    PERMIT_LINES.forEach((line, i) => g.fillText(line, -p.w / 2 + 16, -p.h / 2 + 58 + i * 19));
    g.font = `500 11px ${FONTS.mono}`;
    g.fillText('decision:', -p.w / 2 + 16, p.h / 2 - 26);
    g.strokeStyle = rgba(C.black, 0.6);
    g.beginPath();
    g.moveTo(-p.w / 2 + 84, p.h / 2 - 15);
    g.lineTo(p.w / 2 - 18, p.h / 2 - 15);
    g.stroke();
    // the imprint, once the stamp has landed
    if (t >= IMPACT) this.imprint(g, s, f, p);
    g.restore();
  },

  imprint(g, s, f, p) {
    const k = clamp01((f.t - IMPACT) / 0.08);
    g.save();
    g.globalAlpha *= 0.92 * k;
    g.rotate(-0.12);
    g.translate(18, 22);
    g.strokeStyle = C.red;
    g.fillStyle = C.red;
    g.lineWidth = 3.5;
    const w = p.w * 0.84;
    const h = 92;
    g.beginPath();
    g.rect(-w / 2, -h / 2, w, h);
    g.stroke();
    g.lineWidth = 1.5;
    g.strokeRect(-w / 2 + 6, -h / 2 + 6, w - 12, h - 12);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    fitFont(g, 'APPROVED', FONTS.mono, 700, 42, w - 34, 0.08);
    drawTracked(g, 'APPROVED', 0, -12, 3, 'center');
    g.font = `700 13px ${FONTS.mono}`;
    drawTracked(g, 'BY ONE EMPLOYEE', 0, 24, 2.5, 'center');
    g.fillStyle = C.parchment;
    for (const sp of s.specks) {
      g.beginPath();
      g.arc(sp.x * w, sp.y * h, sp.r, 0, TAU);
      g.fill();
    }
    g.restore();
  },

  /** The giant original rubber stamp: descends, slams, lifts. */
  stamp(g, s, f) {
    const { t, H } = f;
    const p = s.permit;
    const down0 = f.reduced ? 3.4 : 3.75;
    if (t < down0 || t > 5.0) return;
    const target = [p.x + p.w / 2 + 18, p.y + p.h / 2 + 18];
    const descend = range01(t, down0, IMPACT);
    const lift = range01(t, IMPACT + 0.14, 4.85);
    const e = f.reduced ? ease.inOutSine(descend) : ease.inCubic(descend);
    const y = lerp(-320, target[1], e) - (f.reduced ? lerp(0, 380, ease.inOutSine(lift)) : lerp(0, 420, ease.outCubic(lift)));
    const squash = !f.reduced && t > IMPACT && t < IMPACT + 0.14 ? 0.9 : 1;
    const alpha = 1 - range01(t, 4.6, 4.95);
    g.save();
    g.globalAlpha = alpha;
    g.translate(target[0], y);
    g.rotate(-0.12);
    g.scale(1, squash);
    // rubber + base block
    g.fillStyle = '#7d1712';
    g.fillRect(-150, -18, 300, 18);
    g.fillStyle = '#2b2016';
    g.fillRect(-160, -78, 320, 60);
    g.fillStyle = C.brass;
    g.fillRect(-160, -84, 320, 8);
    // neck + knob
    g.fillStyle = '#3b2b1d';
    g.fillRect(-28, -190, 56, 108);
    g.beginPath();
    g.ellipse(0, -205, 70, 42, 0, 0, TAU);
    g.fill();
    g.fillStyle = rgba(C.brassHi, 0.4);
    g.beginPath();
    g.ellipse(-18, -218, 30, 12, -0.3, 0, TAU);
    g.fill();
    g.fillStyle = rgba(C.parchment, 0.65);
    g.font = `700 16px ${FONTS.mono}`;
    g.textAlign = 'center';
    g.fillText('HRD OFFICIAL', 0, -44);
    g.restore();
    if (!f.reduced && t >= IMPACT && t < IMPACT + 0.35) {
      // dust puff on impact
      const q = (t - IMPACT) / 0.35;
      glow(g, target[0], target[1], 120 + 160 * q, C.parchment, 0.25 * (1 - q));
    }
  },

  title(g, f) {
    const { W, H, t } = f;
    const t0 = f.reduced ? 2.0 : 1.6;
    if (t < t0) return;
    const out = 1 - ease.inOut(range01(t, 5.55, 6.2));
    if (out <= 0) return;
    const text = 'DEADLY SENTENCING';
    const n = Math.min(text.length, Math.floor((t - t0) / 0.035));
    const y = H * 0.875;
    g.save();
    g.globalAlpha = out;
    g.fillStyle = rgba(C.black, 0.92);
    g.fillRect(0, y - 52, W, 76);
    g.strokeStyle = rgba(C.brass, 0.7);
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, y - 52);
    g.lineTo(W, y - 52);
    g.moveTo(0, y + 24);
    g.lineTo(W, y + 24);
    g.stroke();
    const size = fitFont(g, text, FONTS.mono, 700, 46, W * 0.86, 0.06);
    g.fillStyle = C.parchment;
    g.textBaseline = 'alphabetic';
    const layout = drawTracked(g, text, W / 2, y, size * 0.06, 'center', (i) => (i < n ? 1 : 0));
    // a slow cursor block (1 Hz, eased, never strobing)
    const cursorX = n < text.length ? layout.positions[n] : layout.positions[text.length - 1] + layout.widths[text.length - 1] + 6;
    g.globalAlpha = out * (0.35 + 0.35 * Math.sin(t * TAU * 0.6));
    g.fillRect(cursorX, y - size * 0.8, size * 0.5, size * 0.9);
    g.restore();
  },
};
