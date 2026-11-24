import React from 'react';
import * as THREE from 'three';
import {
  cordGeometry,
  deadTreeGeometry,
  fangGeometry,
  finialGeometry,
  hornGeometry,
  islandGeometry,
  lanternGeometry,
  pagodaRoof,
  rngFrom,
  shardsGeometry,
  skullGeometry,
  skullHollowGeometry,
} from './geometry';

// One set of geometry serves both the building and its mirrored reflection.
// Only the palette and the clipping plane differ.

/** world-space layout, in the units the composition camera is framed for */
export const LAYOUT = {
  waterY: 0,
  islandR: 232,
  plateauY: 24,
  bodyHalfX: 112,
  bodyHalfZ: 50,
  bodyTop: 134,
  mouthHalfX: 90,
  mouthBottom: 27,
  mouthTop: 113,
  facadeZ: 44,
  pillarX: 132,
  pillarZ: 60,
  pillarTop: 150,
  beamTopY: 150,
  beamMidY: 122,
  roofY: 158,
  roofHalfX: 244,
  roofHalfZ: 138,
  neckTop: 252,
  roof2Y: 252,
  roof2HalfX: 148,
  roof2HalfZ: 88,
  ridge2Y: 295,
  topY: 338,
} as const;

const MAIN_ROOF = pagodaRoof({
  halfX: LAYOUT.roofHalfX,
  halfZ: LAYOUT.roofHalfZ,
  height: 62,
  droop: 17,
  cornerLift: 32,
  ridgeFrac: 0.16,
});
const UPPER_ROOF = pagodaRoof({
  halfX: LAYOUT.roof2HalfX,
  halfZ: LAYOUT.roof2HalfZ,
  height: 43,
  droop: 12,
  cornerLift: 21,
  ridgeFrac: 0.18,
});

const BOX = new THREE.BoxGeometry(1, 1, 1);
const ISLAND = islandGeometry(LAYOUT.islandR, LAYOUT.plateauY);
const SHARDS = shardsGeometry(LAYOUT.islandR, LAYOUT.plateauY - 8, 44, 7781);
const SKULL = skullGeometry();
const SKULL_HOLLOW = skullHollowGeometry();
const BIG_HORN = hornGeometry(88, 2.05, 32, 26);
const MID_HORN = hornGeometry(62, 2.0, 25, 21);
const SMALL_HORN = hornGeometry(42, 1.9, 19, 16);
const FINIAL = finialGeometry(42);
const LANTERN = lanternGeometry(8.5);
const CORD = cordGeometry(24, 1.1);
const FANG = fangGeometry(1, 1);
const THROAT_TUNNEL = new THREE.CylinderGeometry(2.5, 168, 230, 44, 26, true);
const TREES = [0, 1, 2, 3, 4, 5].map((i) => deadTreeGeometry(1301 + i * 977, 150 + (i % 3) * 32));

// where the superellipse perimeter puts a roof corner
const roofPoint = (halfX: number, halfZ: number, th: number, n = 2.9) => {
  const c = Math.cos(th);
  const s = Math.sin(th);
  const e = 2 / n;
  return [
    Math.sign(c) * Math.pow(Math.abs(c), e) * halfX,
    Math.sign(s) * Math.pow(Math.abs(s), e) * halfZ,
  ] as const;
};

const eaveY = (droop: number, cornerLift: number, th: number) =>
  -droop + cornerLift * Math.pow(1 - Math.abs(Math.cos(2 * th)), 1.7);

const TEAL = new THREE.Color('#0d8496');
const TEAL_LIGHT = new THREE.Color('#58f2f4');

// pull a colour toward the cold teal and dim it
const chill = (hex: string, cold: boolean, mix = 0.78, dim = 0.85) => {
  const c = new THREE.Color(hex);
  if (cold) {
    c.lerp(TEAL, mix);
    c.multiplyScalar(dim);
  }
  return c;
};

const chillEmissive = (hex: string, cold: boolean, mix = 0.88, dim = 1.15) => {
  const c = new THREE.Color(hex);
  if (cold) {
    c.lerp(TEAL_LIGHT, mix);
    c.multiplyScalar(dim);
  }
  return c;
};

export type Palette = Record<string, THREE.Material>;

const ABOVE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const BELOW = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);

// cold builds the teal reflection set, clipped below the waterline; the warm
// set clips above it, so the building emerges through the water rather than
// squashing against it.
export const makePalette = (cold: boolean): Palette => {
  const clip = [cold ? BELOW : ABOVE];
  const std = (o: THREE.MeshStandardMaterialParameters) =>
    new THREE.MeshStandardMaterial({
      side: THREE.DoubleSide,
      clippingPlanes: clip,
      clipShadows: true,
      ...o,
    });
  // self-lit so the reflection keeps its shape under mirrored normals
  const selfLit = cold ? 1.05 : 0;

  const out: Palette = {
    slate: std({
      color: chill('#120910', cold),
      roughness: 0.78,
      metalness: 0.18,
      emissive: chillEmissive('#1a0e15', cold),
      emissiveIntensity: selfLit * 0.9,
    }),
    slateUp: std({
      color: chill('#1d0f18', cold),
      roughness: 0.7,
      metalness: 0.2,
      emissive: chillEmissive('#1d0f18', cold),
      emissiveIntensity: selfLit * 0.9,
    }),
    gold: std({
      color: chill('#9d6a1c', cold, 0.5, 0.5),
      roughness: 0.36,
      metalness: 0.95,
      emissive: chillEmissive('#c98a2a', cold),
      emissiveIntensity: cold ? 0.55 : 0.22,
    }),
    lacquer: std({
      color: chill('#73090f', cold),
      roughness: 0.38,
      metalness: 0.28,
      emissive: chillEmissive('#3c0407', cold),
      emissiveIntensity: cold ? 0.7 : 0.2,
    }),
    lacquerDark: std({
      color: chill('#3b060b', cold),
      roughness: 0.46,
      metalness: 0.22,
      emissive: chillEmissive('#230306', cold),
      emissiveIntensity: cold ? 0.6 : 0.12,
    }),
    bone: std({
      color: chill('#7d7461', cold, 0.7, 0.42),
      roughness: 0.64,
      metalness: 0.05,
      emissive: chillEmissive('#3b3528', cold),
      emissiveIntensity: cold ? 0.7 : 0.05,
    }),
    boneDim: std({
      color: chill('#6b6353', cold, 0.74, 0.38),
      roughness: 0.72,
      metalness: 0.04,
      emissive: chillEmissive('#2a261c', cold),
      emissiveIntensity: cold ? 0.65 : 0.04,
    }),
    hollow: std({
      color: '#07060a',
      roughness: 0.95,
      emissive: chillEmissive('#000000', cold),
      emissiveIntensity: 0,
    }),
    rock: std({
      color: chill('#060409', cold, 0.78, 0.4),
      roughness: 0.96,
      metalness: 0.05,
      flatShading: true,
      emissive: chillEmissive('#07171c', cold, 0.92, 0.7),
      emissiveIntensity: cold ? 0.55 : 0.1,
    }),
    horn: std({
      color: chill('#07050c', cold, 0.74, 0.42),
      roughness: 0.34,
      metalness: 0.55,
      emissive: chillEmissive('#0a1c24', cold, 0.92, 0.6),
      emissiveIntensity: cold ? 0.5 : 0.07,
    }),
    lantern: std({
      color: chill('#9ebfcc', cold, 0.4, 0.6),
      roughness: 0.4,
      emissive: chillEmissive('#79cfea', cold, 0.4, 0.7),
      emissiveIntensity: cold ? 0.4 : 0.16,
    }),
    trunk: std({
      color: chill('#040308', cold, 0.76, 0.36),
      roughness: 0.9,
      emissive: chillEmissive('#06161c', cold, 0.92, 0.6),
      emissiveIntensity: cold ? 0.45 : 0.03,
    }),
  };
  // a reflection reads darker than what it mirrors, and rock covers the most
  // area, so it gets held back hardest
  if (cold) {
    const weight: Record<string, number> = {
      rock: 0.1,
      trunk: 0.14,
      horn: 0.2,
      bone: 0.26,
      slate: 0.5,
      slateUp: 0.5,
      lacquer: 0.72,
      lacquerDark: 0.5,
      gold: 1.0,
      lantern: 0.8,
      hollow: 0,
    };
    for (const [key, m] of Object.entries(out)) {
      const sm = m as THREE.MeshStandardMaterial;
      const w = weight[key] ?? 0.35;
      sm.emissiveIntensity *= w;
      sm.color.multiplyScalar(0.3 + 0.55 * w);
    }
  }
  return out;
};

/** fang rows across the mouth: big and few, upper row points down */
const FANG_ROWS = (() => {
  const upper: { x: number; w: number; h: number; tip: number }[] = [];
  const lower: { x: number; w: number; h: number; tip: number }[] = [];
  const jitter = rngFrom(3313);
  const nU = 6;
  for (let i = 0; i < nU; i++) {
    const t = (i + 0.5) / nU;
    const x = (t - 0.5) * 2 * (LAYOUT.mouthHalfX - 10) + (jitter() - 0.5) * 6;
    const edge = Math.pow(Math.abs(t - 0.5) * 2, 1.3);
    upper.push({ x, w: 8.5 + (1 - edge) * 1.5 + edge * 3, h: 28 + edge * 22 + jitter() * 7, tip: (jitter() - 0.5) * 0.26 });
  }
  const nL = 5;
  for (let i = 0; i < nL; i++) {
    const t = (i + 0.5) / nL;
    const x = (t - 0.5) * 2 * (LAYOUT.mouthHalfX - 16) + (jitter() - 0.5) * 6;
    const edge = Math.pow(Math.abs(t - 0.5) * 2, 1.3);
    lower.push({ x, w: 8.5 + (1 - edge) * 1.5 + edge * 3, h: 24 + edge * 18 + jitter() * 6, tip: (jitter() - 0.5) * 0.26 });
  }
  return { upper, lower };
})();

const SKULLS = (() => {
  const rnd = rngFrom(9091);
  const out: { p: [number, number, number]; s: number; r: number }[] = [];
  for (let i = 0; i < 38; i++) {
    const a = rnd() * Math.PI * 2;
    const rel = 0.4 + rnd() * 0.68;
    const r = LAYOUT.islandR * rel;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r * 0.95 + 26 + (rnd() - 0.5) * 48;
    if (Math.abs(x) < 142 && z > -104 && z < 116) continue;
    // the ones out past the plateau tumble down the flank toward the water
    const drop = Math.pow(Math.max(0, rel - 0.9), 1.3) * 130;
    out.push({
      p: [x, LAYOUT.plateauY + 7 - drop + rnd() * 5, z],
      s: 0.36 + Math.pow(rnd(), 2.0) * 0.6,
      r: (rnd() - 0.5) * 1.4,
    });
  }
  return out;
})();

const TREE_SPOTS = (() => {
  const rnd = rngFrom(4242);
  const out: { p: [number, number, number]; s: number; g: number }[] = [];
  const xs = [-262, -208, -174, 178, 216, 268];
  xs.forEach((x, i) => {
    out.push({
      p: [x, LAYOUT.plateauY - 4, -72 + rnd() * 90],
      s: 0.82 + rnd() * 0.5,
      g: i,
    });
  });
  return out;
})();

/** horn crown positions, biggest at the main roof corners */
const HORNS = (() => {
  const out: { p: [number, number, number]; a: number; geo: THREE.BufferGeometry; tilt: number }[] =
    [];
  const push = (
    halfX: number,
    halfZ: number,
    baseY: number,
    droop: number,
    lift: number,
    th: number,
    geo: THREE.BufferGeometry,
    inset: number,
    tilt: number,
  ) => {
    const [x, z] = roofPoint(halfX * inset, halfZ * inset, th);
    const y = baseY + eaveY(droop, lift, th) + 4;
    out.push({ p: [x, y, z], a: Math.atan2(-z, x), geo, tilt });
  };
  const deg = (d: number) => (d * Math.PI) / 180;
  for (const th of [45, 135, 225, 315]) {
    push(LAYOUT.roofHalfX, LAYOUT.roofHalfZ, LAYOUT.roofY, 17, 32, deg(th), BIG_HORN, 1.0, 0.34);
  }
  for (const th of [72, 108, 252, 288]) {
    push(LAYOUT.roofHalfX, LAYOUT.roofHalfZ, LAYOUT.roofY, 17, 32, deg(th), MID_HORN, 0.95, 0.5);
  }
  for (const th of [45, 135, 225, 315]) {
    push(
      LAYOUT.roof2HalfX,
      LAYOUT.roof2HalfZ,
      LAYOUT.roof2Y,
      12,
      21,
      deg(th),
      SMALL_HORN,
      1.0,
      0.28,
    );
  }
  return out;
})();

const CLIP_VERT_PARS = '#include <clipping_planes_pars_vertex>';
const CLIP_VERT = '#include <clipping_planes_vertex>';
const CLIP_FRAG_PARS = '#include <clipping_planes_pars_fragment>';
const CLIP_FRAG = '#include <clipping_planes_fragment>';

/**
 * The gullet behind the fangs: dark at the lip, burning deep inside, ribbed.
 * v = 0 at the opening.
 */
const throatMaterial = (cold: boolean) =>
  new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    clipping: true,
    clippingPlanes: [cold ? BELOW : ABOVE],
    uniforms: { uPulse: { value: 1 }, uCold: { value: cold ? 1 : 0 } },
    vertexShader: `
      ${CLIP_VERT_PARS}
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        ${CLIP_VERT}
      }
    `,
    fragmentShader: `
      ${CLIP_FRAG_PARS}
      uniform float uPulse;
      uniform float uCold;
      varying vec2 vUv;
      void main() {
        ${CLIP_FRAG}
        float d = clamp(vUv.y, 0.0, 1.0);
        float glow = pow(d, 1.35);
        vec3 col = mix(vec3(0.020, 0.001, 0.003), vec3(1.25, 0.085, 0.022), glow);
        col += vec3(1.0, 0.30, 0.06) * pow(d, 5.0) * (0.6 + 0.9 * uPulse);
        float rib = 0.5 + 0.5 * sin(d * 31.0 + sin(vUv.x * 19.0) * 2.6 + sin(d * 7.0) * 3.0);
        float fold = 0.5 + 0.5 * sin(vUv.x * 52.0 + d * 11.0);
        col *= 0.74 + 0.3 * rib * (0.5 + 0.7 * fold);
        col *= smoothstep(0.0, 0.09, d);
        float lum = dot(col, vec3(0.30, 0.59, 0.11));
        col = mix(col, vec3(0.10, 0.78, 0.92) * lum * 0.8, uCold);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

/** additive radial glow, for lamplight and the throat */
const glowMaterial = (color: string, strength: number, cold: boolean) =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    clipping: true,
    clippingPlanes: [cold ? BELOW : ABOVE],
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uStrength: { value: strength },
      uFall: { value: 2.6 },
    },
    vertexShader: `
      ${CLIP_VERT_PARS}
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        ${CLIP_VERT}
      }
    `,
    fragmentShader: `
      ${CLIP_FRAG_PARS}
      uniform vec3 uColor;
      uniform float uStrength;
      uniform float uFall;
      varying vec2 vUv;
      void main() {
        ${CLIP_FRAG}
        float d = length(vUv - 0.5) * 2.0;
        float a = pow(max(0.0, 1.0 - d), uFall);
        gl_FragColor = vec4(uColor * uStrength * a, a);
      }
    `,
  });

export const Shrine: React.FC<{
  cold?: boolean;
  /** 0..1 reveal, drives how hot the lamps and throat burn */
  lit: number;
  flicker: number;
}> = ({ cold = false, lit, flicker }) => {
  const mat = React.useMemo(() => makePalette(cold), [cold]);
  const throatMat = React.useMemo(() => throatMaterial(cold), [cold]);
  const glows = React.useMemo(
    () => ({
      throat: glowMaterial('#ff2a0c', 1.0, cold),
      lamp: glowMaterial('#6fc0e4', 0.55, cold),
      warm: glowMaterial('#ff6a1e', 0.4, cold),
    }),
    [cold],
  );
  const dim = cold ? 0.4 : 1;
  glows.throat.uniforms.uStrength.value = (0.7 + flicker * 0.45) * lit * dim;
  glows.lamp.uniforms.uStrength.value = (0.4 + flicker * 0.14) * lit * dim;
  glows.warm.uniforms.uStrength.value = 0.34 * lit * dim;
  throatMat.uniforms.uPulse.value = (0.45 + flicker * 0.55) * lit;

  const L = LAYOUT;
  const jambHalf = (L.bodyHalfX - L.mouthHalfX) / 2;
  const jambX = (L.bodyHalfX + L.mouthHalfX) / 2;

  return (
    <group>
      {/* island: black rock, skulls scattered on it, dead trees */}
      <mesh geometry={ISLAND} material={mat.rock} />
      <mesh geometry={SHARDS} material={mat.rock} />
      {SKULLS.map((s, i) => (
        <group key={`sk${i}`} position={s.p} rotation={[0, s.r, (s.r % 0.4) - 0.2]} scale={s.s}>
          <mesh geometry={SKULL} material={mat.bone} />
          <mesh geometry={SKULL_HOLLOW} material={mat.hollow} />
        </group>
      ))}
      {TREE_SPOTS.map((t, i) => (
        <mesh
          key={`tr${i}`}
          geometry={TREES[t.g]}
          material={mat.trunk}
          position={t.p}
          scale={t.s}
          rotation={[0, i * 1.3, 0]}
        />
      ))}

      {/* facade: jambs, lintel, sill around the mouth */}
      <mesh
        geometry={BOX}
        material={mat.lacquerDark}
        position={[-jambX, (6 + L.bodyTop) / 2, 0]}
        scale={[jambHalf * 2, L.bodyTop - 6, L.bodyHalfZ * 2]}
      />
      <mesh
        geometry={BOX}
        material={mat.lacquerDark}
        position={[jambX, (6 + L.bodyTop) / 2, 0]}
        scale={[jambHalf * 2, L.bodyTop - 6, L.bodyHalfZ * 2]}
      />
      <mesh
        geometry={BOX}
        material={mat.lacquerDark}
        position={[0, (L.mouthTop + L.bodyTop) / 2, 0]}
        scale={[L.mouthHalfX * 2, L.bodyTop - L.mouthTop, L.bodyHalfZ * 2]}
      />
      <mesh
        geometry={BOX}
        material={mat.lacquerDark}
        position={[0, (6 + L.mouthBottom) / 2, 0]}
        scale={[L.mouthHalfX * 2, L.mouthBottom - 6, L.bodyHalfZ * 2]}
      />

      {/* the mouth: throat tunnel set back behind the fangs */}
      <mesh
        geometry={THROAT_TUNNEL}
        material={throatMat}
        position={[0, (L.mouthBottom + L.mouthTop) / 2, L.facadeZ - 162]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[1, 1, 0.66]}
      />
      <mesh
        position={[0, (L.mouthBottom + L.mouthTop) / 2, L.facadeZ - 238]}
        material={glows.throat}
      >
        <planeGeometry args={[96, 96]} />
      </mesh>
      {FANG_ROWS.upper.map((f, i) => (
        <mesh
          key={`fu${i}`}
          geometry={FANG}
          material={mat.bone}
          position={[f.x, L.mouthTop - 1, L.facadeZ - 14]}
          rotation={[0, 0, f.tip]}
          scale={[f.w, -f.h, f.w]}
        />
      ))}
      {FANG_ROWS.lower.map((f, i) => (
        <mesh
          key={`fl${i}`}
          geometry={FANG}
          material={mat.boneDim}
          position={[f.x, L.mouthBottom + 1, L.facadeZ - 14]}
          rotation={[0, 0, f.tip]}
          scale={[f.w, f.h, f.w]}
        />
      ))}

      {/* lacquer pillars and cross beams, torii style */}
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <mesh
            key={`p${sx}${sz}`}
            geometry={BOX}
            material={mat.lacquer}
            position={[sx * L.pillarX, L.pillarTop / 2 + 1, sz * L.pillarZ]}
            scale={[21, L.pillarTop - 2, 21]}
          />
        )),
      )}
      {[-1, 1].map((sz) => (
        <group key={`b${sz}`}>
          <mesh
            geometry={BOX}
            material={mat.lacquer}
            position={[0, L.beamTopY, sz * L.pillarZ]}
            scale={[354, 16, 24]}
          />
          <mesh
            geometry={BOX}
            material={mat.lacquerDark}
            position={[0, L.beamMidY, sz * L.pillarZ]}
            scale={[314, 13, 19]}
          />
        </group>
      ))}
      {/* gold caps where the beams cross the pillars */}
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <mesh
            key={`g${sx}${sz}`}
            geometry={BOX}
            material={mat.gold}
            position={[sx * L.pillarX, L.beamMidY - 10, sz * L.pillarZ]}
            scale={[24, 5, 24]}
          />
        )),
      )}

      {/* two pagoda roofs with the neck between them */}
      <group position={[0, L.roofY, 0]}>
        <mesh geometry={MAIN_ROOF.geometry} material={mat.slate} />
        <mesh geometry={MAIN_ROOF.ridges} material={mat.slateUp} />
        <mesh geometry={MAIN_ROOF.trim} material={mat.gold} />
      </group>
      <mesh
        geometry={BOX}
        material={mat.lacquerDark}
        position={[0, (218 + L.neckTop) / 2, 0]}
        scale={[126, L.neckTop - 218, 86]}
      />
      <group position={[0, L.roof2Y, 0]}>
        <mesh geometry={UPPER_ROOF.geometry} material={mat.slateUp} />
        <mesh geometry={UPPER_ROOF.ridges} material={mat.slate} />
        <mesh geometry={UPPER_ROOF.trim} material={mat.gold} />
      </group>
      <mesh geometry={FINIAL} material={mat.gold} position={[0, L.ridge2Y - 2, 0]} />

      {HORNS.map((h, i) => (
        <group key={`h${i}`} position={h.p} rotation={[0, h.a, 0]}>
          <group rotation={[0, 0, h.tilt]} scale={[-1, 1, 1]}>
            <mesh geometry={h.geo} material={mat.horn} />
          </group>
        </group>
      ))}

      {/* lanterns, two pairs hung at different heights */}
      {[-1, 1].map((sx) => (
        <group key={`l${sx}`} position={[sx * 180, L.beamMidY - 46, 70]}>
          <mesh geometry={CORD} material={mat.trunk} position={[0, 22, 0]} />
          <mesh geometry={LANTERN} material={mat.lantern} />
          <mesh material={glows.lamp}>
            <planeGeometry args={[150, 150]} />
          </mesh>
        </group>
      ))}
      {[-1, 1].map((sx) => (
        <group key={`l2${sx}`} position={[sx * 232, L.beamMidY - 72, 24]}>
          <mesh geometry={CORD} material={mat.trunk} position={[0, 20, 0]} scale={[1, 0.8, 1]} />
          <mesh geometry={LANTERN} material={mat.lantern} scale={0.78} />
          <mesh material={glows.lamp}>
            <planeGeometry args={[110, 110]} />
          </mesh>
        </group>
      ))}

      {/* warm haze: big plane behind the building, small one out front */}
      <mesh material={glows.warm} position={[0, 120, -210]}>
        <planeGeometry args={[900, 620]} />
      </mesh>
      <mesh material={glows.warm} position={[0, 44, 120]}>
        <planeGeometry args={[420, 220]} />
      </mesh>
    </group>
  );
};

