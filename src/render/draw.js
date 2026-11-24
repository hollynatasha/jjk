// Canvas helpers shared by the domains. All procedural, no image assets, so
// the export canvas never gets tainted.

export const TAU = Math.PI * 2;

export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const range01 = (t, a, b) => clamp01((t - a) / (b - a));

export const ease = {
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inCubic: (t) => t * t * t,
  outQuart: (t) => 1 - Math.pow(1 - t, 4),
  outBack: (t) => {
    const c1 = 1.4;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
};

const rgbCache = new Map();
export function hexToRgb(hex) {
  let v = rgbCache.get(hex);
  if (!v) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    rgbCache.set(hex, v);
  }
  return v;
}

export function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a < 0 ? 0 : a > 1 ? 1 : +a.toFixed(4)})`;
}

export function glow(g, x, y, r, color, alpha = 1) {
  if (r <= 0 || alpha <= 0) return;
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, rgba(color, alpha));
  gr.addColorStop(0.4, rgba(color, alpha * 0.45));
  gr.addColorStop(1, rgba(color, 0));
  g.fillStyle = gr;
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
}

/**
 * Cheap bloom: draw sharp, then draw a downscaled blurred copy over it with
 * 'lighter'. Blurring the small copy is cheaper than blurring full size, and
 * softer. `f` is the frame object, for its scratch canvases; no canvas filter
 * support or f.low means one plain pass.
 */
export function withBloom(g, f, draw, { blur = 14, alpha = 0.75, slot = 6, scale = 0.4 } = {}) {
  const probe = f.temp && f.temp(slot);
  if (!probe || f.low || !canvasFilters(g)) {
    draw(g);
    return;
  }
  const w = Math.max(1, Math.round(f.W * scale));
  const h = Math.max(1, Math.round(f.H * scale));
  if (probe.width !== w || probe.height !== h) {
    probe.width = w;
    probe.height = h;
  }
  const pg = probe.getContext('2d');
  pg.setTransform(1, 0, 0, 1, 0, 0);
  pg.clearRect(0, 0, w, h);
  pg.save();
  pg.scale(scale, scale);
  draw(pg);
  pg.restore();
  draw(g);
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = alpha;
  g.filter = `blur(${Math.max(1, blur * scale)}px)`;
  g.drawImage(probe, 0, 0, f.W, f.H);
  g.restore();
  g.filter = 'none';
}

let filterOk = null;
function canvasFilters(g) {
  if (filterOk === null) filterOk = typeof g.filter === 'string';
  return filterOk;
}

/** Builds the mote field once, in init. drawMotes renders it additively, so overlaps burn toward white. */
export function seedMotes(rng, n, { speed = [6, 40], size = [0.8, 3.2], life = [1.2, 4] } = {}) {
  return Array.from({ length: n }, () => ({
    x: rng.range(0, 1),
    y: rng.range(0, 1),
    vx: rng.range(-1, 1) * rng.range(...speed) * 0.3,
    vy: -rng.range(...speed),
    r: rng.range(...size),
    born: rng.range(0, 4),
    life: rng.range(...life),
    ph: rng.range(0, TAU),
  }));
}

export function drawMotes(g, motes, { W, H, t }, color, alpha = 1) {
  g.save();
  g.globalCompositeOperation = 'lighter';
  for (const m of motes) {
    const age = (t - m.born) % (m.life + 0.6);
    if (age < 0) continue;
    const k = Math.sin((age / m.life) * Math.PI);
    if (k <= 0.02) continue;
    const x = (((m.x + (m.vx * age) / W) % 1) + 1) % 1;
    const y = (((m.y + (m.vy * age) / H) % 1) + 1) % 1;
    const wob = Math.sin(t * 1.6 + m.ph) * 3;
    glow(g, x * W + wob, y * H, m.r * 5, color, 0.35 * k * alpha);
    g.fillStyle = rgba(color, 0.9 * k * alpha);
    g.beginPath();
    g.arc(x * W + wob, y * H, m.r, 0, TAU);
    g.fill();
  }
  g.restore();
}

export function polygon(g, pts) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
}

export function polyline(g, pts) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
}

/** Subdivides a closed outline and pushes points along their normals: torn paper. */
export function tornOutline(pts, rng, amp, step = 14) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.round(len / step));
    const nx = -(b[1] - a[1]) / (len || 1);
    const ny = (b[0] - a[0]) / (len || 1);
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const j = (rng.next() - 0.5) * 2 * amp * (k === 0 ? 0.3 : 1);
      out.push([a[0] + (b[0] - a[0]) * t + nx * j, a[1] + (b[1] - a[1]) * t + ny * j]);
    }
  }
  return out;
}

/** A jagged electric arc between two points. */
export function sparkPath(rng, x0, y0, x1, y1, segments = 6, amp = 8) {
  const pts = [[x0, y0]];
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    const j = (rng.next() - 0.5) * 2 * amp * Math.sin(Math.PI * t);
    pts.push([x0 + dx * t + nx * j, y0 + dy * t + ny * j]);
  }
  pts.push([x1, y1]);
  return pts;
}

/** Lays out text glyph by glyph with explicit tracking. Canvas letterSpacing is not everywhere yet. */
export function trackedText(g, text, x, y, tracking, align = 'center') {
  const widths = [...text].map((ch) => g.measureText(ch).width);
  const total = widths.reduce((s, w) => s + w, 0) + tracking * Math.max(0, text.length - 1);
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  const saved = g.textAlign;
  g.textAlign = 'left';
  const chars = [...text];
  const positions = [];
  for (let i = 0; i < chars.length; i++) {
    positions.push(cx);
    cx += widths[i] + tracking;
  }
  g.textAlign = saved;
  return { chars, positions, widths, total, start: positions[0] ?? x };
}

export function drawTracked(g, text, x, y, tracking, align = 'center', alphaFor = null) {
  const layout = trackedText(g, text, x, y, tracking, align);
  const saved = g.textAlign;
  const savedAlpha = g.globalAlpha;
  g.textAlign = 'left';
  layout.chars.forEach((ch, i) => {
    const a = alphaFor ? alphaFor(i, layout.chars.length) : 1;
    if (a <= 0) return;
    g.globalAlpha = savedAlpha * a;
    g.fillText(ch, layout.positions[i], y);
  });
  g.globalAlpha = savedAlpha;
  g.textAlign = saved;
  return layout;
}

// shrinks the font until text fits maxWidth, 12 tries then take what you get
export function fitFont(g, text, family, weight, maxSize, maxWidth, tracking = 0) {
  let size = maxSize;
  for (let i = 0; i < 12; i++) {
    g.font = `${weight} ${size}px ${family}`;
    const w = g.measureText(text).width + tracking * size * (text.length - 1);
    if (w <= maxWidth) break;
    size = Math.floor(size * Math.max(0.6, maxWidth / w) * 0.98);
  }
  g.font = `${weight} ${size}px ${family}`;
  return size;
}

export const FONTS = {
  serif: '"Instrument Serif", "Iowan Old Style", Georgia, serif',
  mono: '"IBM Plex Mono", ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace',
  sans: '"IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif',
  condensed: 'Anton, "Arial Narrow", Impact, sans-serif',
  hand: 'Caveat, "Segoe Print", "Bradley Hand", cursive',
};
