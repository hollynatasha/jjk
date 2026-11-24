import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// All the shrine geometry, built at module level out of three's own
// primitives so a render never needs an external model or texture.

/** xorshift32. deterministic, so every frame builds identical geometry */
export const rngFrom = (seed: number) => {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
};

// sine-sum displacement, for roughing up rock and bark
const wobble = (x: number, y: number, z: number, seed = 0) =>
  (Math.sin(x * 0.09 + seed) * Math.cos(z * 0.11 - seed) +
    0.62 * Math.sin(x * 0.21 - y * 0.17 + seed * 1.7) +
    0.44 * Math.cos(z * 0.26 + y * 0.13 + seed * 2.3)) /
  2.06;

const merge = (parts: THREE.BufferGeometry[]) => {
  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('failed to merge shrine geometry');
  merged.computeVertexNormals();
  return merged;
};

// --- pagoda roof ---

/** point on a rounded square, so the eave corners read as curves */
const superPerimeter = (th: number, halfX: number, halfZ: number, n = 2.9) => {
  const c = Math.cos(th);
  const s = Math.sin(th);
  const e = 2 / n;
  return [
    Math.sign(c) * Math.pow(Math.abs(c), e) * halfX,
    Math.sign(s) * Math.pow(Math.abs(s), e) * halfZ,
  ] as const;
};

export type RoofSpec = {
  halfX: number;
  halfZ: number;
  height: number;
  /** how far the eave hangs below the roof's base plane */
  droop: number;
  /** how high the four corners sweep above the eave */
  cornerLift: number;
  /** ridge size as a fraction of the eave */
  ridgeFrac: number;
  rings?: number;
  segments?: number;
};

// concentric rounded-square rings from the eave in to the ridge, corners lifted
export const pagodaRoof = (spec: RoofSpec) => {
  const { halfX, halfZ, height, droop, cornerLift, ridgeFrac } = spec;
  const rings = spec.rings ?? 12;
  const segs = spec.segments ?? 120;
  const pos: number[] = [];
  const idx: number[] = [];
  const eave: THREE.Vector3[] = [];

  for (let i = 0; i <= rings; i++) {
    const v = i / rings;
    const sc = 1 - (1 - ridgeFrac) * v;
    for (let j = 0; j <= segs; j++) {
      const u = j / segs;
      const th = u * Math.PI * 2;
      const corner = 1 - Math.abs(Math.cos(2 * th));
      const eaveY = -droop + cornerLift * Math.pow(corner, 1.7);
      const y = eaveY + (height - eaveY) * Math.pow(v, 1.7);
      const [x, z] = superPerimeter(th, halfX * sc, halfZ * sc);
      pos.push(x, y, z);
      if (i === 0 && j < segs) eave.push(new THREE.Vector3(x, y, z));
    }
  }
  const row = segs + 1;
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segs; j++) {
      const a = i * row + j;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setIndex(idx);
  geometry.computeVertexNormals();

  // gold band along the eave edge
  const trim = new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(eave, true, 'catmullrom', 0.3),
    segs,
    Math.max(1.2, halfX * 0.0105),
    8,
    true,
  );

  // hip ridges corner to ridge, plus the flat cap on top
  const hips: THREE.BufferGeometry[] = [];
  const r = Math.max(1.6, halfX * 0.017);
  for (const thDeg of [45, 135, 225, 315]) {
    const th = (thDeg * Math.PI) / 180;
    const corner = 1 - Math.abs(Math.cos(2 * th));
    const e0 = -droop + cornerLift * Math.pow(corner, 1.7);
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 14; k++) {
      const v = k / 14;
      const sc = 1 - (1 - ridgeFrac) * v;
      const [x, z] = superPerimeter(th, halfX * sc, halfZ * sc);
      pts.push(new THREE.Vector3(x, e0 + (height - e0) * Math.pow(v, 1.7) + r * 0.8, z));
    }
    hips.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 18, r, 6, false));
  }
  const capCurve: THREE.Vector3[] = [];
  for (let k = 0; k <= 48; k++) {
    const th = (k / 48) * Math.PI * 2;
    const [x, z] = superPerimeter(th, halfX * ridgeFrac, halfZ * ridgeFrac);
    capCurve.push(new THREE.Vector3(x, height + r * 0.8, z));
  }
  hips.push(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(capCurve, true), 56, r * 1.25, 6, true),
  );
  const ridges = mergeGeometries(hips, false);
  if (!ridges) throw new Error('failed to merge roof ridges');
  ridges.computeVertexNormals();

  return { geometry, trim, ridges, eave };
};

// --- crescent horns ---

/**
 * Swept arc, thickness tapering to a point, extruded into a solid blade.
 * Base sits at the origin, tip curves up and toward -x.
 */
export const hornGeometry = (R: number, arc: number, thick: number, depth: number) => {
  const N = 30;
  const a0 = -0.16;
  const outer: THREE.Vector2[] = [];
  const inner: THREE.Vector2[] = [];
  for (let i = 0; i <= N; i++) {
    const s = i / N;
    const a = a0 + arc * s;
    const w = thick * (Math.pow(1 - s, 0.85) + 0.035);
    outer.push(new THREE.Vector2(Math.cos(a) * (R + w * 0.5), Math.sin(a) * (R + w * 0.5)));
    inner.push(new THREE.Vector2(Math.cos(a) * (R - w * 0.5), Math.sin(a) * (R - w * 0.5)));
  }
  const shape = new THREE.Shape(outer.concat(inner.reverse()));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSize: depth * 0.22,
    bevelThickness: depth * 0.22,
    bevelSegments: 2,
    curveSegments: 4,
  });
  g.translate(-Math.cos(a0) * R, -Math.sin(a0) * R, -depth / 2);
  g.computeVertexNormals();
  return g;
};

// --- island ---

/** noisy squashed ball with a flat plateau on top */
export const islandGeometry = (R: number, plateauY: number) => {
  const g = new THREE.IcosahedronGeometry(R, 4);
  const p = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const d =
      1 +
      0.3 * wobble(v.x, v.y, v.z) +
      0.13 * wobble(v.x * 2.7, v.y * 2.7, v.z * 2.7, 3.1);
    v.normalize().multiplyScalar(R * d);
    v.y *= 0.6;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  // flat footing so the facade is not swallowed by rock, but left broken
  // enough that the plateau does not read as a plate
  const cap = R * 0.6 * 0.3;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y <= cap) continue;
    const x = p.getX(i);
    const z = p.getZ(i);
    p.setY(i, cap + (y - cap) * 0.06 + wobble(x * 3.1, 0, z * 3.1, 5.7) * R * 0.035);
  }
  g.translate(0, plateauY - cap, 0);
  g.computeVertexNormals();
  return g;
};

/**
 * Shards around the island rim. The wedge in front of the building is kept
 * clear so nothing stands over the mouth.
 */
export const shardsGeometry = (R: number, baseY: number, count: number, seed: number) => {
  const rnd = rngFrom(seed);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rnd() * 0.6;
    let r = R * (0.6 + rnd() * 0.48);
    let x = Math.cos(a) * r;
    let z = Math.sin(a) * r * 0.72;
    if (Math.abs(x) < R * 0.68 && z > R * 0.1) {
      x = x < 0 ? -R * 0.72 - rnd() * R * 0.3 : R * 0.72 + rnd() * R * 0.3;
      z *= 0.5;
    }
    const h = R * (0.16 + rnd() * 0.42);
    const rad = R * (0.035 + rnd() * 0.075);
    const g = new THREE.ConeGeometry(rad, h, 5, 1);
    g.rotateZ((rnd() - 0.5) * 0.8);
    g.rotateX((rnd() - 0.5) * 0.4);
    g.rotateY(rnd() * Math.PI);
    g.translate(x, baseY + h * 0.3, z);
    parts.push(g);
  }
  return merge(parts);
};

// --- skull ---

/** bone shell of a skull, facing +z */
export const skullGeometry = () => {
  const cran = new THREE.SphereGeometry(10, 16, 13);
  cran.scale(1, 0.97, 1.1);
  const face = new THREE.SphereGeometry(7.6, 14, 11);
  face.scale(1, 0.84, 0.72);
  face.translate(0, -6.4, 6.6);
  const jaw = new THREE.BoxGeometry(11.6, 4.8, 7.4);
  jaw.translate(0, -11.4, 5.4);
  const cheekL = new THREE.BoxGeometry(3.4, 6, 4);
  cheekL.translate(-7.2, -4.6, 5.4);
  const cheekR = cheekL.clone();
  cheekR.translate(14.4, 0, 0);
  return merge([cran, face, jaw, cheekL, cheekR]);
};

// eyes, nose, teeth. drawn as solid shapes in the near-black hollow material
export const skullHollowGeometry = () => {
  const parts: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    const e = new THREE.SphereGeometry(3.6, 12, 10);
    e.scale(1, 1.15, 0.85);
    e.translate(sx * 4.5, -4.1, 9.9);
    parts.push(e);
  }
  const nose = new THREE.ConeGeometry(2, 4.6, 6);
  nose.rotateX(Math.PI);
  nose.translate(0, -8.2, 10.4);
  parts.push(nose);
  for (let i = 0; i < 5; i++) {
    const t = new THREE.BoxGeometry(0.9, 3.2, 1.2);
    t.translate(-4 + i * 2, -9.6, 9.4);
    parts.push(t);
  }
  return merge(parts);
};

// --- dead trees ---

/** bare gnarled tree, branches merged into one silhouette */
export const deadTreeGeometry = (seed: number, height: number) => {
  const rnd = rngFrom(seed);
  const parts: THREE.BufferGeometry[] = [];
  const up = new THREE.Vector3(0, 0, 1);
  const side = new THREE.Vector3(1, 0, 0);
  const grow = (
    from: THREE.Vector3,
    dir: THREE.Vector3,
    len: number,
    rad: number,
    depth: number,
  ) => {
    const end = from.clone().add(dir.clone().multiplyScalar(len));
    const mid = from
      .clone()
      .add(dir.clone().multiplyScalar(len * 0.5))
      .add(new THREE.Vector3((rnd() - 0.5) * len * 0.34, 0, (rnd() - 0.5) * len * 0.34));
    parts.push(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3([from, mid, end]),
        5,
        Math.max(0.5, rad),
        6,
        false,
      ),
    );
    if (depth <= 0) return;
    const n = depth >= 3 ? 3 : rnd() > 0.4 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const d = dir.clone();
      d.applyAxisAngle(up, (rnd() - 0.5) * 1.7);
      d.applyAxisAngle(side, (rnd() - 0.5) * 1.7);
      d.y = Math.max(d.y, 0.05);
      d.normalize();
      grow(end, d, len * (0.56 + rnd() * 0.22), rad * 0.58, depth - 1);
    }
  };
  grow(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3((rnd() - 0.5) * 0.34, 1, (rnd() - 0.5) * 0.34).normalize(),
    height * 0.44,
    height * 0.032,
    4,
  );
  return merge(parts);
};

// --- fittings ---

/** lathed finial for the top ridge, h is the full height */
export const finialGeometry = (h: number) => {
  const pts: THREE.Vector2[] = [
    [0.26, 0],
    [0.3, 0.06],
    [0.16, 0.1],
    [0.2, 0.2],
    [0.1, 0.26],
    [0.26, 0.34],
    [0.12, 0.44],
    [0.14, 0.56],
    [0.05, 0.62],
    [0.1, 0.72],
    [0.03, 0.86],
    [0.0, 1.0],
  ].map(([r, y]) => new THREE.Vector2(r * h, y * h));
  const g = new THREE.LatheGeometry(pts, 14);
  g.computeVertexNormals();
  return g;
};

/** octagonal lantern, r is the body radius */
export const lanternGeometry = (r: number) => {
  const body = new THREE.CylinderGeometry(r, r * 0.92, r * 2.1, 8, 1);
  const top = new THREE.ConeGeometry(r * 1.25, r * 0.7, 8);
  top.translate(0, r * 1.4, 0);
  const bot = new THREE.ConeGeometry(r * 1.15, r * 0.55, 8);
  bot.rotateX(Math.PI);
  bot.translate(0, -r * 1.33, 0);
  return merge([body, top, bot]);
};

// spans y = 0..len upward from the origin
export const cordGeometry = (len: number, r: number) => {
  const g = new THREE.CylinderGeometry(r, r, len, 5);
  g.translate(0, len / 2, 0);
  return g;
};

/** one fang, pointing up from its base at the origin */
export const fangGeometry = (r: number, h: number) => {
  const g = new THREE.ConeGeometry(r, h, 7, 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const t = (v.y + h / 2) / h;
    v.x *= 1 - 0.12 * t;
    v.z += Math.pow(t, 2) * r * 0.5;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.translate(0, h / 2, 0);
  g.computeVertexNormals();
  return g;
};
