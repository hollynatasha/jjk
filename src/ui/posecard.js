// Pose-card line drawings, built from the same procedural hand the tests use.
// Nothing traced from anime frames. Everything is drawn in the front-camera
// (mirrored, selfie) view, and flipped mirrors it for the other hand.

import { SIGN_SCENES, scenePoints } from '../handmodel/poses.js';
import { DOMAINS, domainById } from '../domains/catalog.js';

const INK = '#17130f';
const PAPER = '#f3eddb';
const PENCIL = '#c2412b';
const SEGMENTS = [
  [1, 2, 'thumb'], [2, 3, 'thumb'], [3, 4, 'thumb'],
  [5, 6, 'index'], [6, 7, 'index'], [7, 8, 'index'],
  [9, 10, 'middle'], [10, 11, 'middle'], [11, 12, 'middle'],
  [13, 14, 'ring'], [14, 15, 'ring'], [15, 16, 'ring'],
  [17, 18, 'pinky'], [18, 19, 'pinky'], [19, 20, 'pinky'],
];
const WIDTH = { thumb: 0.22, index: 0.18, middle: 0.185, ring: 0.175, pinky: 0.155 };

const NOTES = {
  gojo: { at: (H) => mid(H[0].pts[6], H[0].pts[10]), text: 'middle over index', must: [[0, 8], [0, 12]] },
  sukuna: { at: (H) => mid(H[0].pts[12], H[1].pts[12]), text: 'tips meet in a peak', must: [[0, 12], [1, 12], [0, 16], [1, 16]] },
  megumi: { at: (H) => mid(H[0].pts[10], H[1].pts[10]), text: 'knuckles form a mountain', must: [[0, 4], [1, 4]] },
};
// A slight top-down view where a flat hand would otherwise be seen edge-on.
const DRAW_PITCH = { gojo: 0, sukuna: -8, megumi: -14 };

const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
const f1 = (n) => Math.round(n * 10) / 10;
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len3 = (a) => Math.hypot(a[0], a[1], a[2]) || 1;
const addScaled = (p, d, s) => [p[0] + d[0] * s, p[1] + d[1] * s, p[2] + d[2] * s];

/** Projected, fitted hand geometry for a sign. */
export function poseGeometry(domainId, variant = 'friendly', flipped = false, box = { x: 0, y: 0, w: 300, h: 300, pad: 36 }) {
  const scene = SIGN_SCENES[domainId][variant === 'canonical' ? 'canonical' : 'friendly'];
  const hands = scenePoints(scene, { pitch: DRAW_PITCH[domainId] || 0 }).map(({ chirality, pts }) => {
    // Widen the wrist (the landmark is a single point) and add a forearm stub,
    // in 3D, so the outline reads as a hand rather than a wedge.
    const L = len3(sub3(pts[9], pts[0]));
    const lat = sub3(pts[5], pts[17]);
    const latN = lat.map((c) => c / len3(lat));
    const up = sub3(pts[9], pts[0]).map((c) => c / L);
    const wristA = addScaled(pts[0], latN, 0.24 * L);
    const wristB = addScaled(pts[0], latN, -0.27 * L);
    const arm = addScaled(pts[0], up, -0.55 * L);
    const proj = ([x, y, z]) => [((flipped ? 1 : -1) * x) / z, y / z, z];
    return { chirality, pts: pts.map(proj), wristA: proj(wristA), wristB: proj(wristB), arm: [...proj(arm).slice(0, 2), pts[0][2] + 0.004] };
  });
  const all = hands.flatMap((hh) => [...hh.pts, hh.arm, hh.wristA, hh.wristB]);
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const s = Math.min((box.w - box.pad * 2) / (maxX - minX), (box.h - box.pad * 2) / (maxY - minY));
  const ox = box.x + box.w / 2 - ((minX + maxX) / 2) * s;
  const oy = box.y + box.h / 2 - ((minY + maxY) / 2) * s;
  const map = (p) => [p[0] * s + ox, p[1] * s + oy, p[2]];
  for (const hh of hands) {
    hh.pts = hh.pts.map(map);
    hh.arm = map(hh.arm);
    hh.wristA = map(hh.wristA);
    hh.wristB = map(hh.wristB);
    // Palm length as if facing the lens, so edge-on palms keep sensible finger widths.
    hh.palmLen = (s * 0.085) / hh.pts[0][2];
  }
  return hands;
}

// Just the drawing, no card around it.
export function handLineArt(hands, { lw = 1.6, ink = INK, paper = PAPER } = {}) {
  const parts = [];
  hands.forEach((hh) => {
    const L = Math.max(hh.palmLen, 30);
    const palm = [hh.wristB, 17, 13, 9, 5, 1, hh.wristA].map((i) => (Array.isArray(i) ? i : hh.pts[i]));
    parts.push({ z: palm.reduce((sum, p) => sum + p[2], 0) / palm.length + 0.002, kind: 'palm', pts: palm });
    parts.push({ z: hh.arm[2] + 0.01, kind: 'seg', a: hh.arm, b: hh.pts[0], w: L * 0.46 });
    for (const [a, b, name] of SEGMENTS) {
      const pa = hh.pts[a];
      const pb = hh.pts[b];
      const taper = b % 4 === 0 ? 0.88 : 1;
      parts.push({ z: (pa[2] + pb[2]) / 2, kind: 'seg', a: pa, b: pb, w: L * WIDTH[name] * taper });
    }
  });
  parts.sort((p, q) => q.z - p.z);
  const out = [];
  for (const p of parts) {
    if (p.kind === 'palm') {
      out.push(`<polygon points="${p.pts.map((q) => `${f1(q[0])},${f1(q[1])}`).join(' ')}" fill="${paper}" stroke="${ink}" stroke-width="${lw * 2}" stroke-linejoin="round"/>`);
    } else {
      const c = `x1="${f1(p.a[0])}" y1="${f1(p.a[1])}" x2="${f1(p.b[0])}" y2="${f1(p.b[1])}" stroke-linecap="round"`;
      out.push(`<line ${c} stroke="${ink}" stroke-width="${f1(p.w + lw * 2)}"/>`);
      out.push(`<line ${c} stroke="${paper}" stroke-width="${f1(p.w)}"/>`);
    }
  }
  return out.join('');
}

function arrow(from, to, label, { size = 14, anchor = 'start' } = {}) {
  const cx = (from[0] + to[0]) / 2 + (to[1] - from[1]) * 0.18;
  const cy = (from[1] + to[1]) / 2 - (to[0] - from[0]) * 0.18;
  const ang = Math.atan2(to[1] - cy, to[0] - cx);
  const hx = (a) => f1(to[0] - Math.cos(ang + a) * 9);
  const hy = (a) => f1(to[1] - Math.sin(ang + a) * 9);
  return (
    `<path d="M${f1(from[0])},${f1(from[1])} Q${f1(cx)},${f1(cy)} ${f1(to[0])},${f1(to[1])}" fill="none" stroke="${PENCIL}" stroke-width="1.6" stroke-linecap="round"/>` +
    `<path d="M${hx(0.45)},${hy(0.45)} L${f1(to[0])},${f1(to[1])} L${hx(-0.45)},${hy(-0.45)}" fill="none" stroke="${PENCIL}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<text x="${f1(from[0])}" y="${f1(from[1] - 4)}" font-family="Caveat, 'Segoe Print', cursive" font-size="${size}" fill="${PENCIL}" text-anchor="${anchor}">${label}</text>`
  );
}

// Square drawing for a card: the hands plus the pencil annotations.
export function poseSVG(domainId, { variant = 'friendly', flipped = false, size = 300, annotate = true, title = null, ghost = false } = {}) {
  const d = domainById(domainId);
  const hands = poseGeometry(domainId, variant === 'custom' ? 'friendly' : variant, flipped, { x: 0, y: 0, w: size, h: size, pad: size * 0.15 });
  const body = ghost ? handLineArt(hands, { lw: size / 170, ink: '#efe9d6', paper: 'rgba(0,0,0,0.35)' }) : handLineArt(hands, { lw: size / 190 });
  if (ghost) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="Translucent guide: ${d.character} hand sign, front-camera view">${body}</svg>`;
  }
  const notes = [];
  if (annotate) {
    const note = NOTES[domainId];
    const k = size / 300;
    for (const [hi, li] of note.must) {
      const hh = hands[hi];
      if (!hh) continue;
      const p = hh.pts[li];
      notes.push(`<circle cx="${f1(p[0])}" cy="${f1(p[1])}" r="${f1(hh.palmLen * 0.2)}" fill="none" stroke="${PENCIL}" stroke-width="1.4" stroke-dasharray="3 3"/>`);
    }
    const target = note.at(hands);
    const leftSide = target[0] > size / 2;
    const from = [leftSide ? size * 0.05 : size * 0.95, size * 0.11];
    notes.push(arrow(from, [target[0], target[1]], note.text, { size: 16 * k, anchor: leftSide ? 'start' : 'end' }));
    if (hands.length === 2) {
      const a = hands[0].pts[0];
      const b = hands[1].pts[0];
      const y = Math.min(size * 0.84, Math.max(a[1], b[1]) + hands[0].palmLen * 0.18);
      notes.push(`<path d="M${f1(a[0])},${f1(y)} L${f1(b[0])},${f1(y)} M${f1(a[0])},${f1(y - 5)} L${f1(a[0])},${f1(y + 5)} M${f1(b[0])},${f1(y - 5)} L${f1(b[0])},${f1(y + 5)}" stroke="${PENCIL}" stroke-width="1.3"/>`);
      const gap = d.wristGap.replace(/^About /, '≈ ').replace(/\.$/, '');
      const gx = Math.min(size * 0.8, Math.max(size * 0.2, (a[0] + b[0]) / 2));
      notes.push(`<text x="${f1(gx)}" y="${f1(y + 17 * k)}" font-family="Caveat, cursive" font-size="${f1(15 * k)}" fill="${PENCIL}" text-anchor="middle">wrist gap ${gap.toLowerCase()}</text>`);
    }
    notes.push(`<text x="${f1(size * 0.04)}" y="${f1(size * 0.965)}" font-family="'IBM Plex Mono', monospace" font-size="${f1(10 * k)}" fill="${INK}" opacity="0.7">${d.hands === 1 ? 'one hand' : 'two hands'} · front-camera view${flipped ? ' · flipped' : ''}</text>`);
  }
  const label = title || `${d.character}: ${d.domainName} hand sign, ${variant === 'canonical' ? 'researched' : 'camera-friendly'} pose${flipped ? ', mirrored' : ''}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="${label}"><rect width="${size}" height="${size}" fill="${PAPER}"/>${body}${notes.join('')}</svg>`;
}

// Standalone printable card. This is what generated the files in src/assets/pose-cards.
export function poseCardFile(domainId) {
  const d = domainById(domainId);
  const W = 600;
  const H = 860;
  const drawing = poseSVG(domainId, { size: 520 }).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const status = d.researchStatus === 'fan-made' ? 'FAN-MADE TRIGGER' : 'CAMERA-FRIENDLY APPROXIMATION';
  const lines = [
    `Hands: ${d.hands === 1 ? 'one' : 'two'} · View: front camera (mirrored)`,
    `Wrist gap: ${d.wristGap}`,
    `Keep visible: ${d.mustSee}`,
  ];
  const steps = d.steps.map((s, i) => `${i + 1}. ${s}`);
  let y = 666;
  const text = [...lines, ...steps].map((l) => {
    const t = `<text x="40" y="${y}" font-family="'IBM Plex Sans', system-ui, sans-serif" font-size="14" fill="${INK}">${esc(l)}</text>`;
    y += 22;
    return t;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(`${d.character} / ${d.domainName} pose card`)}">
<rect width="${W}" height="${H}" fill="${PAPER}"/>
<rect x="14" y="14" width="${W - 28}" height="${H - 28}" fill="none" stroke="${INK}" stroke-width="1.5"/>
<text x="40" y="62" font-family="'Instrument Serif', Georgia, serif" font-size="38" fill="${INK}">${esc(d.character)} / ${esc(d.domainName)}</text>
<text x="40" y="88" font-family="'IBM Plex Mono', monospace" font-size="12" fill="${INK}" opacity="0.75">Holly's R&amp;D Department · pose card · by @hollynst</text>
<g transform="translate(40,104)"><rect width="520" height="520" fill="${PAPER}"/>${drawing}</g>
<g transform="translate(${W - 280},${612}) rotate(-4)"><rect width="240" height="34" fill="${PAPER}" stroke="${PENCIL}" stroke-width="2"/><text x="120" y="23" text-anchor="middle" font-family="'IBM Plex Mono', monospace" font-size="12" font-weight="700" fill="${PENCIL}">${status}</text></g>
${text.join('\n')}
<text x="40" y="${H - 34}" font-family="'IBM Plex Mono', monospace" font-size="10" fill="${INK}" opacity="0.7">Official reference: ${esc(d.officialRef.url)}</text>
</svg>
`;
}

export { DOMAINS };
