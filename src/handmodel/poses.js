// Joint-angle descriptions of the four taught signs, their camera-friendly
// variants and a set of neutral poses. Used by unit-test fixtures, by the
// simulation stand-in, and to draw the original pose-card line art.

import { buildLocalHand, placeHand, rotatePoints, projectHand } from './synthetic.js';
import { norm, mean } from '../core/vec.js';

const F = (mcp, pip, dip, abd = 0) => ({ mcp, pip, dip, abd });
const T = (cmcFlex, cmcAbd, mcp, ip) => ({ cmcFlex, cmcAbd, mcp, ip });

const curled = F(88, 100, 55);

export const HAND_POSES = {
  open: { thumb: T(8, 18, 6, 6), index: F(4, 4, 2, 4), middle: F(3, 3, 2, 0), ring: F(4, 4, 2, -3), pinky: F(5, 5, 3, -6) },
  flat: { thumb: T(4, -4, 4, 2), index: F(2, 2, 1, -4), middle: F(2, 2, 1, 0), ring: F(2, 2, 1, 3), pinky: F(3, 3, 2, 6) },
  fist: { thumb: T(45, -5, 40, 35), index: curled, middle: F(90, 102, 55), ring: F(90, 102, 55), pinky: F(88, 98, 50) },
  relaxed: { thumb: T(22, 8, 18, 15), index: F(22, 30, 15), middle: F(28, 36, 18), ring: F(32, 40, 20), pinky: F(34, 42, 22) },
  point: { thumb: T(40, -5, 35, 30), index: F(4, 3, 2), middle: F(88, 100, 55), ring: F(90, 100, 55), pinky: F(86, 96, 50) },
  peace: { thumb: T(40, -5, 35, 30), index: F(4, 3, 2, 10), middle: F(4, 3, 2, -8), ring: curled, pinky: F(86, 96, 50) },
  thumbsUp: { thumb: T(0, 30, 0, 0), index: curled, middle: F(90, 102, 55), ring: F(90, 102, 55), pinky: F(88, 98, 50) },
  ok: { thumb: T(35, 10, 25, 25), index: F(40, 55, 35), middle: F(6, 4, 2), ring: F(8, 6, 3, -3), pinky: F(10, 8, 4, -6) },
  // Gojo: index up, middle hooked over it, ring + pinky folded under the thumb.
  gojoCross: { thumb: T(48, -8, 40, 30), index: F(6, 6, 4, -9), middle: F(10, 10, 6, 17), ring: curled, pinky: F(86, 96, 50), lift: { middle: -0.1 } },
  gojoFriendly: { thumb: T(48, -8, 40, 30), index: F(5, 5, 3, -5), middle: F(8, 8, 5, 12), ring: curled, pinky: F(86, 96, 50), lift: { middle: -0.06 } },
  // Sukuna: index + pinky folded down, middle + ring raised into a peak.
  sukunaSeal: { thumb: T(4, 6, 4, 4), index: F(78, 100, 45), middle: F(4, 3, 2, -2), ring: F(4, 3, 2, 3), pinky: F(78, 96, 45) },
  // Megumi: fingers interlaced and bent at the middle knuckles, thumbs up.
  megumiInterlace: { thumb: T(0, 32, 2, 2), index: F(28, 68, 22, 4), middle: F(30, 70, 22, 1), ring: F(30, 70, 22, -2), pinky: F(30, 68, 22, -5) },
  megumiFriendly: { thumb: T(0, 34, 2, 2), index: F(18, 42, 14, 5), middle: F(18, 44, 14, 1), ring: F(18, 44, 14, -3), pinky: F(18, 42, 14, -6) },
};

const UP = [0, -1, 0];
const TO_CAMERA = [0, 0, -1];
const h = (chirality, pose, wrist, u, n) => ({ chirality, pose, wrist, u: norm(u), n: norm(n) });

/** Camera-space scenes (metres, x right, y down, z away). Raw, unmirrored frame:
 * the performer's right hand sits on the image's left. */
export const SIGN_SCENES = {
  gojo: {
    canonical: [h('R', 'gojoCross', [-0.055, 0.035, 0.48], [0.05, -1, 0], [0.18, 0, -1])],
    friendly: [h('R', 'gojoFriendly', [-0.06, 0.04, 0.5], UP, TO_CAMERA)],
  },
  sukuna: {
    canonical: [
      h('R', 'sukunaSeal', [-0.016, 0.07, 0.48], [0.13, -1, 0], [1, 0, 0]),
      h('L', 'sukunaSeal', [0.016, 0.07, 0.48], [-0.13, -1, 0], [-1, 0, 0]),
    ],
    friendly: [
      h('R', 'sukunaSeal', [-0.03, 0.07, 0.48], [0.16, -1, 0], [0.87, 0, -0.5]),
      h('L', 'sukunaSeal', [0.03, 0.07, 0.48], [-0.16, -1, 0], [-0.87, 0, -0.5]),
    ],
  },
  megumi: {
    canonical: [
      h('R', 'megumiInterlace', [-0.035, 0.075, 0.48], [0.5, -0.86, 0], [1, 0, 0]),
      h('L', 'megumiInterlace', [0.035, 0.075, 0.49], [-0.5, -0.86, 0], [-1, 0, 0]),
    ],
    friendly: [
      h('R', 'megumiFriendly', [-0.05, 0.075, 0.48], [0.42, -0.9, 0], [0.9, 0, -0.42]),
      h('L', 'megumiFriendly', [0.05, 0.075, 0.48], [-0.42, -0.9, 0], [-0.9, 0, -0.42]),
    ],
  },
  higuruma: {
    // Fan-made: upright oath palm + flat gavel hand below it.
    canonical: [
      h('R', 'flat', [-0.05, 0.0, 0.5], UP, TO_CAMERA),
      h('L', 'flat', [0.07, 0.085, 0.5], [-1, 0, 0], [0, 1, 0]),
    ],
    friendly: [
      h('R', 'flat', [-0.055, 0.0, 0.5], UP, TO_CAMERA),
      h('L', 'flat', [0.075, 0.09, 0.5], [-1, 0, 0], [0, 1, 0]),
    ],
  },
};

/** Poses Holly might hold between signs. Used as negatives in tests. */
export const NEUTRAL_SCENES = {
  openR: [h('R', 'open', [-0.06, 0.03, 0.5], UP, TO_CAMERA)],
  openL: [h('L', 'open', [0.06, 0.03, 0.5], UP, TO_CAMERA)],
  fistR: [h('R', 'fist', [-0.06, 0.05, 0.5], UP, TO_CAMERA)],
  pointR: [h('R', 'point', [-0.05, 0.04, 0.5], UP, TO_CAMERA)],
  peaceR: [h('R', 'peace', [-0.05, 0.04, 0.5], UP, TO_CAMERA)],
  thumbsUpR: [h('R', 'thumbsUp', [-0.05, 0.06, 0.5], UP, [1, 0, 0])],
  okR: [h('R', 'ok', [-0.05, 0.04, 0.5], UP, TO_CAMERA)],
  relaxedBoth: [
    h('R', 'relaxed', [-0.09, 0.13, 0.5], [0.2, -1, 0.3], [0.4, 0, -1]),
    h('L', 'relaxed', [0.09, 0.13, 0.5], [-0.2, -1, 0.3], [-0.4, 0, -1]),
  ],
  openBoth: [
    h('R', 'open', [-0.12, 0.02, 0.52], UP, TO_CAMERA),
    h('L', 'open', [0.12, 0.02, 0.52], UP, TO_CAMERA),
  ],
  fistBoth: [
    h('R', 'fist', [-0.1, 0.06, 0.5], UP, TO_CAMERA),
    h('L', 'fist', [0.1, 0.06, 0.5], UP, TO_CAMERA),
  ],
  prayerBoth: [
    h('R', 'flat', [-0.012, 0.07, 0.48], [0.05, -1, 0], [1, 0, 0]),
    h('L', 'flat', [0.012, 0.07, 0.48], [-0.05, -1, 0], [-1, 0, 0]),
  ],
};

const VIEW = {
  center: { yaw: 0, dist: 1 },
  left: { yaw: -16, dist: 1 },
  right: { yaw: 16, dist: 1 },
  near: { yaw: 0, dist: 0.82 },
  far: { yaw: 0, dist: 1.22 },
  mid: { yaw: 0, dist: 1.06 },
};

function jitterPose(pose, rng, sd) {
  const out = {};
  for (const [k, v] of Object.entries(pose)) {
    if (k === 'lift') {
      out.lift = v;
      continue;
    }
    const j = {};
    for (const [jk, jv] of Object.entries(v)) j[jk] = jv + rng.normal() * sd;
    out[k] = j;
  }
  return out;
}

/** Camera-space points for each hand in a scene, before projection. */
export function scenePoints(scene, { rng = null, view = 'center', noise = 1, yaw = 0, roll = 0, pitch = 0, scale = 1 } = {}) {
  const v = VIEW[view] || VIEW.center;
  const jy = rng ? rng.normal() * 3 * noise : 0;
  const jp = rng ? rng.normal() * 3 * noise : 0;
  const jr = rng ? rng.normal() * 4 * noise : 0;
  const shift = rng ? [rng.normal() * 0.012 * noise, rng.normal() * 0.01 * noise, 0] : [0, 0, 0];
  const distMul = v.dist * (rng ? 1 + rng.normal() * 0.03 * noise : 1);
  const hands = scene.map((hand) => {
    const pose = rng ? jitterPose(HAND_POSES[hand.pose], rng, 4 * noise) : HAND_POSES[hand.pose];
    return { chirality: hand.chirality, pts: placeHand(buildLocalHand(pose), { ...hand, scale }) };
  });
  const pivot = mean(hands.flatMap((x) => x.pts));
  return hands.map(({ chirality, pts }) => {
    let q = rotatePoints(pts, pivot, { yaw: v.yaw + jy + yaw, pitch: jp + pitch, roll: jr + roll });
    q = q.map(([x, y, z]) => [x + shift[0], y + shift[1], z]);
    // Move the scene along the viewing ray to emulate distance.
    q = q.map(([x, y, z]) => [x * distMul, y * distMul, z * distMul]);
    return { chirality, pts: q };
  });
}

/**
 * A HandLandmarker-shaped frame for a scene. Output hand order is shuffled by
 * the rng to mimic MediaPipe's unstable ordering.
 */
export function sceneFrame(scene, opts = {}) {
  // `rng` drives the pose/view jitter of one attempt; `noiseRng` (defaults to
  // rng) drives per-frame landmark noise, so several frames of one capture
  // share a pose but not their noise.
  const { rng = null, width = 640, height = 480, landmarkNoise = 0.0022, worldNoise = 0.0012 } = opts;
  const noiseRng = opts.noiseRng || rng;
  const hands = scenePoints(scene, opts).map(({ chirality, pts }) => {
    const out = projectHand(pts, { chirality, width, height, score: noiseRng ? 0.9 + noiseRng.next() * 0.09 : 0.97 });
    if (noiseRng) {
      for (const l of out.landmarks) {
        l.x += noiseRng.normal() * landmarkNoise;
        l.y += noiseRng.normal() * landmarkNoise;
        l.z += noiseRng.normal() * landmarkNoise;
      }
      for (const w of out.world) {
        w.x += noiseRng.normal() * worldNoise;
        w.y += noiseRng.normal() * worldNoise;
        w.z += noiseRng.normal() * worldNoise;
      }
    }
    return out;
  });
  if (noiseRng && hands.length === 2 && noiseRng.next() < 0.5) hands.reverse();
  return { width, height, hands };
}

export const CAPTURE_VIEWS = ['center', 'center', 'center', 'left', 'left', 'left', 'right', 'right', 'right', 'near', 'far', 'mid'];
