// A small procedural hand in the same 21-landmark layout MediaPipe returns, so
// the matcher gets deterministic test fixtures and the pose cards can be drawn
// from geometry instead of borrowed images. Plain kinematics, bone lengths and
// joint angles, nothing learned.

import { add, mul, sub, cross, norm, dot, rotateAxis, deg, mean } from '../core/vec.js';

export const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];

export const FINGER_CHAINS = {
  thumb: [1, 2, 3, 4],
  index: [5, 6, 7, 8],
  middle: [9, 10, 11, 12],
  ring: [13, 14, 15, 16],
  pinky: [17, 18, 19, 20],
};

export const PALM_LEN = 0.085; // metres, wrist to middle-finger knuckle (adult-ish)

// Knuckle anchors in the palm plane, in palm lengths: [toward thumb, along fingers].
const ANCHORS = {
  thumb: [0.3, 0.24],
  index: [0.34, 0.95],
  middle: [0.09, 1.0],
  ring: [-0.15, 0.93],
  pinky: [-0.36, 0.83],
};
const BONES = {
  thumb: [0.42, 0.33, 0.29],
  index: [0.46, 0.27, 0.22],
  middle: [0.51, 0.31, 0.24],
  ring: [0.47, 0.29, 0.23],
  pinky: [0.36, 0.22, 0.2],
};
const SPLAY = { index: 7, middle: 1, ring: -5, pinky: -12 };
const THUMB_BASE = 48;

const E_LAT = [1, 0, 0]; // toward the thumb side
const E_UP = [0, 1, 0]; // wrist toward fingers
const E_NRM = [0, 0, 1]; // out of the palm (E_LAT x E_UP)

/**
 * Builds a right hand in its local frame (lateral, up, palm-normal) from a
 * pose. Angles in degrees, flexion bends toward the palm.
 */
export function buildLocalHand(pose) {
  const p = new Array(21);
  p[0] = [0, 0, 0];
  const L = PALM_LEN;

  // Thumb: base swings out toward the thumb side, then opposes toward the palm.
  {
    const t = pose.thumb;
    const a = ANCHORS.thumb;
    p[1] = [a[0] * L, a[1] * L, 0.04 * L];
    let d = rotateAxis(E_UP, E_NRM, -deg(THUMB_BASE + (t.cmcAbd || 0)));
    d = rotateAxis(d, cross(d, E_NRM), deg(t.cmcFlex || 0));
    const across = norm([-0.7, 0, 0.7]);
    p[2] = add(p[1], mul(d, BONES.thumb[0] * L));
    d = rotateAxis(d, cross(d, across), deg(t.mcp || 0));
    p[3] = add(p[2], mul(d, BONES.thumb[1] * L));
    d = rotateAxis(d, cross(d, across), deg(t.ip || 0));
    p[4] = add(p[3], mul(d, BONES.thumb[2] * L));
  }

  for (const name of ['index', 'middle', 'ring', 'pinky']) {
    const f = pose[name];
    const [i0, i1, i2, i3] = FINGER_CHAINS[name];
    const a = ANCHORS[name];
    const lift = (pose.lift && pose.lift[name]) || 0;
    p[i0] = [a[0] * L, a[1] * L, 0];
    let d = rotateAxis(E_UP, E_NRM, -deg((SPLAY[name] || 0) + (f.abd || 0)));
    const axis = cross(d, E_NRM);
    const b = BONES[name];
    d = rotateAxis(d, axis, deg(f.mcp || 0));
    p[i1] = add(add(p[i0], mul(d, b[0] * L)), [0, 0, lift * L * 0.6]);
    d = rotateAxis(d, axis, deg(f.pip || 0));
    p[i2] = add(add(p[i1], mul(d, b[1] * L)), [0, 0, lift * L * 0.3]);
    d = rotateAxis(d, axis, deg(f.dip || 0));
    p[i3] = add(add(p[i2], mul(d, b[2] * L)), [0, 0, lift * L * 0.1]);
  }
  return p;
}

/**
 * Places a hand in camera space. `u` points from wrist toward the fingers,
 * `n` out of the palm. Camera axes follow MediaPipe: x right, y down, z away.
 * A left hand is just the right-hand construction mirrored.
 */
export function placeHand(local, { chirality = 'R', wrist, u, n, scale = 1 }) {
  const uu = norm(u);
  let nn = sub(n, mul(uu, dot(n, uu)));
  nn = norm(nn);
  const rightLat = cross(uu, nn);
  const lat = chirality === 'R' ? rightLat : mul(rightLat, -1);
  return local.map(([x, y, z]) =>
    add(wrist, add(add(mul(lat, x * scale), mul(uu, y * scale)), mul(nn, z * scale))),
  );
}

/** Rotates camera-space points around a pivot by yaw (y), pitch (x), roll (z) degrees. */
export function rotatePoints(points, pivot, { yaw = 0, pitch = 0, roll = 0 }) {
  return points.map((pt) => {
    let v = sub(pt, pivot);
    if (roll) v = rotateAxis(v, [0, 0, 1], deg(roll));
    if (pitch) v = rotateAxis(v, [1, 0, 0], deg(pitch));
    if (yaw) v = rotateAxis(v, [0, 1, 0], deg(yaw));
    return add(v, pivot);
  });
}

/**
 * Converts camera-space points into the shape HandLandmarker returns:
 * normalized image landmarks, hand-centred world landmarks (metres), and a
 * handedness label. MediaPipe labels assume a mirrored selfie image, so a
 * physical right hand in a raw (unmirrored) frame is labelled "Left".
 */
export function projectHand(points, { chirality, width = 640, height = 480, focal = 620, score = 0.97 }) {
  const wz = points[0][2];
  const landmarks = points.map((q) => ({
    x: 0.5 + (focal * q[0]) / q[2] / width,
    y: 0.5 + (focal * q[1]) / q[2] / height,
    z: ((q[2] - wz) * focal) / wz / width,
    visibility: 0,
  }));
  const c = mean(points);
  const world = points.map((q) => ({ x: q[0] - c[0], y: q[1] - c[1], z: q[2] - c[2] }));
  return { landmarks, world, handedness: chirality === 'R' ? 'Left' : 'Right', score };
}
