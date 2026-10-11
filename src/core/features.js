// Landmark-derived feature vectors. Nothing here sees pixels: the input is the
// 21 landmarks per hand that HandLandmarker returns, and the output is a short
// numeric vector. Only these vectors are ever stored.
//
// Per hand (67 values, reflection-canonicalised into a right-hand frame):
//   30  fingertip + PIP/IP positions in a palm frame (origin wrist, +y toward the
//       middle knuckle, normalised by palm width)
//   15  joint flexion angles (3 per finger)
//    5  fingertip to palm-centre distances
//    7  key fingertip separations
//    4  finger spread angles
//    6  camera-space orientation: wrist->middle-knuckle axis + palm normal
// Two hands add 10 layout values (wrist spacing, offsets, fingertip contact,
// relative tilt and depth) computed in raw image space.
//
// We never compute a "fingers crossed" flag. A 2D landmark model fills in a
// fully hidden fingertip with a guess, so crossing is left to the learned
// templates rather than inferred as a fact.

import { sub, cross, norm, dot, len, mean, angleBetween } from './vec.js';

export const FEATURE_VERSION = 3;
export const HAND_DIM = 67;
export const PAIR_DIM = 10;
export const dimFor = (count) => (count === 2 ? HAND_DIM * 2 + PAIR_DIM : count === 1 ? HAND_DIM : 0);

const TIPS = [4, 8, 12, 16, 20];
const POSITION_POINTS = [4, 8, 12, 16, 20, 3, 6, 10, 14, 18];
const CHAINS = [
  [0, 1, 2, 3, 4],
  [0, 5, 6, 7, 8],
  [0, 9, 10, 11, 12],
  [0, 13, 14, 15, 16],
  [0, 17, 18, 19, 20],
];
const SEPARATIONS = [[4, 8], [8, 12], [12, 16], [16, 20], [4, 12], [4, 20], [8, 20]];
const PALM_POINTS = [0, 5, 9, 13, 17];

// Block weights applied inside the distance, so stored vectors stay raw.
const HAND_WEIGHTS = (() => {
  const w = [];
  const push = (n, v) => {
    for (let i = 0; i < n; i++) w.push(v);
  };
  push(30, 1.0); // positions
  push(15, 1.6); // flexion angles
  push(5, 0.8); // tip-to-palm
  push(7, 0.8); // separations
  push(4, 1.2); // spreads
  push(6, 0.9); // orientation
  return w;
})();
const PAIR_WEIGHTS = [1.3, 1.3, 1.3, 1.3, 1.3, 1.1, 1.1, 1.1, 0.9, 0.9];

export const WEIGHTS = {
  1: Float32Array.from(HAND_WEIGHTS),
  2: Float32Array.from([...HAND_WEIGHTS, ...HAND_WEIGHTS, ...PAIR_WEIGHTS]),
};

/**
 * MediaPipe's handedness label assumes a mirrored selfie image. The app always
 * feeds raw, unmirrored camera frames, so "Left" means the performer's right
 * hand. Training and live matching use the same rule, which is what matters.
 */
export function chiralityFromLabel(label) {
  return label === 'Left' ? 'R' : 'L';
}

function pixelPoints(landmarks, W, H) {
  return landmarks.map((l) => [l.x * W, l.y * H, l.z * W]);
}

function worldPoints(world) {
  return world.map((l) => [l.x, l.y, l.z]);
}

/** Per-hand block. `role` 'L' reflects the hand so every hand reads as a right hand. */
export function handBlock(hand, W, H, role) {
  const imgRaw = pixelPoints(hand.landmarks, W, H);
  const hasWorld = Array.isArray(hand.world) && hand.world.length === 21;
  const src = hasWorld ? worldPoints(hand.world) : imgRaw;
  const reflect = role === 'L';
  const P = reflect ? src.map(([x, y, z]) => [-x, y, z]) : src;
  const I = reflect ? imgRaw.map(([x, y, z]) => [-x, y, z]) : imgRaw;

  const w0 = P[0];
  const yAx = norm(sub(P[9], w0));
  const xr = sub(P[5], P[17]);
  const xAx = norm(sub(xr, yAx.map((c) => c * dot(xr, yAx))));
  const zAx = cross(xAx, yAx);
  const palmW = len(sub(P[5], P[17]));
  const palmL = len(sub(P[9], w0));
  const S = Math.max(palmW, 0.6 * palmL, 1e-9);

  const out = new Float32Array(HAND_DIM);
  let k = 0;
  for (const i of POSITION_POINTS) {
    const d = sub(P[i], w0);
    out[k++] = dot(d, xAx) / S;
    out[k++] = dot(d, yAx) / S;
    out[k++] = dot(d, zAx) / S;
  }
  for (const c of CHAINS) {
    for (let j = 1; j <= 3; j++) {
      out[k++] = angleBetween(sub(P[c[j]], P[c[j - 1]]), sub(P[c[j + 1]], P[c[j]])) / Math.PI;
    }
  }
  const C = mean(PALM_POINTS.map((i) => P[i]));
  for (const t of TIPS) out[k++] = len(sub(P[t], C)) / S;
  for (const [a, b] of SEPARATIONS) out[k++] = len(sub(P[a], P[b])) / S;
  out[k++] = angleBetween(sub(P[8], P[5]), sub(P[12], P[9])) / Math.PI;
  out[k++] = angleBetween(sub(P[12], P[9]), sub(P[16], P[13])) / Math.PI;
  out[k++] = angleBetween(sub(P[16], P[13]), sub(P[20], P[17])) / Math.PI;
  out[k++] = angleBetween(sub(P[4], P[2]), sub(P[8], P[5])) / Math.PI;
  const up3 = norm(sub(I[9], I[0]));
  out[k++] = up3[0];
  out[k++] = up3[1];
  out[k++] = up3[2];
  out[k++] = zAx[0];
  out[k++] = zAx[1];
  out[k++] = zAx[2];

  // Raw (unreflected) image-space info for layout features and feedback.
  const palmPx = len(sub(imgRaw[5], imgRaw[17])) || 1;
  const palmLenPx = len(sub(imgRaw[9], imgRaw[0])) || 1;
  const xs = imgRaw.map((p) => p[0]);
  const ys = imgRaw.map((p) => p[1]);
  return {
    vec: out,
    palmPx: Math.max(palmPx, 0.6 * palmLenPx),
    wrist: [imgRaw[0][0], imgRaw[0][1]],
    center: (() => {
      const c = mean(PALM_POINTS.map((i) => imgRaw[i]));
      return [c[0], c[1]];
    })(),
    tips: TIPS.map((t) => [imgRaw[t][0], imgRaw[t][1]]),
    up2: (() => {
      const u = sub(imgRaw[9], imgRaw[0]);
      const l = Math.hypot(u[0], u[1]) || 1;
      return [u[0] / l, u[1] / l];
    })(),
    box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
  };
}

const d2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function pairBlock(a, b) {
  const s = (a.palmPx + b.palmPx) / 2;
  const out = new Float32Array(PAIR_DIM);
  out[0] = (b.wrist[0] - a.wrist[0]) / s;
  out[1] = (b.wrist[1] - a.wrist[1]) / s;
  out[2] = (b.center[0] - a.center[0]) / s;
  out[3] = (b.center[1] - a.center[1]) / s;
  out[4] = d2(a.wrist, b.wrist) / s;
  let tt = Infinity;
  for (const p of a.tips) for (const q of b.tips) tt = Math.min(tt, d2(p, q));
  out[5] = tt / s;
  out[6] = Math.min(...a.tips.map((p) => d2(p, b.center))) / s;
  out[7] = Math.min(...b.tips.map((p) => d2(p, a.center))) / s;
  out[8] = a.up2[0] * b.up2[0] + a.up2[1] * b.up2[1];
  out[9] = Math.log(b.palmPx / a.palmPx);
  return out;
}

function boxIoU(a, b) {
  const ix = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
  const iy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const inter = ix * iy;
  const area = (r) => Math.max(0, r[2] - r[0]) * Math.max(0, r[3] - r[1]);
  const u = area(a) + area(b) - inter;
  return u > 0 ? inter / u : 0;
}

function concat(...arrs) {
  const n = arrs.reduce((s, a) => s + a.length, 0);
  const out = new Float32Array(n);
  let o = 0;
  for (const a of arrs) {
    out.set(a, o);
    o += a.length;
  }
  return out;
}

/**
 * Features for one tracking frame.
 * Returns { count, variants, chirality?, info }.
 *  - one hand: a single variant; chirality comes from the handedness label
 *    and feeds the handedness gate.
 *  - two hands: two variants, one per hand-to-role assignment, so a label or
 *    ordering swap from the tracker still matches the taught template.
 */
export function extractFrameFeatures(frame) {
  const W = frame.width || 640;
  const H = frame.height || 480;
  let hands = (frame.hands || []).filter((x) => x && x.landmarks && x.landmarks.length === 21);
  if (hands.length > 2) hands = hands.slice().sort((p, q) => (q.score || 0) - (p.score || 0)).slice(0, 2);
  const count = hands.length;
  if (count === 0) return { count: 0, variants: [], info: { minScore: 0 } };

  if (count === 1) {
    const hand = hands[0];
    const chirality = chiralityFromLabel(hand.handedness);
    const blk = handBlock(hand, W, H, chirality);
    return {
      count: 1,
      variants: [blk.vec],
      chirality,
      chiralityScore: hand.score ?? 1,
      info: { minScore: hand.score ?? 1, palmPx: blk.palmPx, palmFrac: blk.palmPx / W, wrists: [blk.wrist], centers: [blk.center], boxes: [blk.box], overlap: 0, W, H },
    };
  }

  // Order by raw image x so "A" is stable regardless of tracker output order.
  const ordered = hands.slice().sort((p, q) => p.landmarks[0].x - q.landmarks[0].x);
  const [A, B] = ordered;
  const a1 = handBlock(A, W, H, 'R');
  const b1 = handBlock(B, W, H, 'L');
  const a2 = handBlock(B, W, H, 'R');
  const b2 = handBlock(A, W, H, 'L');
  const v1 = concat(a1.vec, b1.vec, pairBlock(a1, b1));
  const v2 = concat(a2.vec, b2.vec, pairBlock(a2, b2));
  const minScore = Math.min(A.score ?? 1, B.score ?? 1);
  const palmPx = (a1.palmPx + b1.palmPx) / 2;
  // Mean distance between corresponding landmarks: near zero means the
  // tracker returned the same hand twice (a merged detection).
  let dup = 0;
  for (let i = 0; i < 21; i++) dup += Math.hypot((A.landmarks[i].x - B.landmarks[i].x) * W, (A.landmarks[i].y - B.landmarks[i].y) * H);
  return {
    count: 2,
    variants: [v1, v2],
    info: {
      minScore,
      palmPx,
      palmFrac: palmPx / W,
      wrists: [a1.wrist, b1.wrist],
      centers: [a1.center, b1.center],
      boxes: [a1.box, b1.box],
      overlap: boxIoU(a1.box, b1.box),
      wristGap: d2(a1.wrist, b1.wrist) / palmPx,
      sameLabel: !!A.handedness && A.handedness === B.handedness,
      dupDist: dup / 21 / palmPx,
      W,
      H,
    },
  };
}

/** Weighted RMS distance between two raw vectors of the same hand count. */
export function featureDistance(a, b, count) {
  const w = WEIGHTS[count];
  const n = a.length;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const d = (a[i] - b[i]) * w[i];
    s += d * d;
  }
  return Math.sqrt(s / n);
}
