import { useThree } from '@react-three/fiber';
import { ThreeCanvas } from '@remotion/three';
import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import * as THREE from 'three';
import { LAYOUT, Shrine } from './shrine/Shrine';

// Sukuna / Malevolent Shrine background, in Three.js.
//
// One slow move: the shrine hauls itself up out of black mirror water over most
// of the clip and holds at full height for the last two seconds. The submerged
// part is clipped away at y = 0 rather than squashed, so it really emerges.
//
// Two temperatures. Hot above the waterline: near-black sky, churning crimson
// smoke. Cold teal below it, with shafts rising through the reflection. The
// building burns warm between the two.

const FPS = 30;
const RISE_START = 12;
const RISE_END = 134;
const FADE_IN = 12;
const FADE_OUT = 20;

const ramp = (frame: number, a: number, b: number) =>
  interpolate(frame, [a, b], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

// point-light intensity for a target brightness at a reference distance
const lamp = (brightness: number, refDist: number) => brightness * refDist * refDist;

// --- shared GLSL ------------------------------------------------------------

const NOISE = `
  float hash12(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
      mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x),
      u.y);
  }
  float fbm(vec2 p) {
    float a = 0.5;
    float s = 0.0;
    for (int i = 0; i < 6; i++) {
      s += a * vnoise(p);
      p = p * 2.04 + vec2(1.7, 9.2);
      a *= 0.5;
    }
    return s;
  }
`;

const WORLD_VERT = `
  varying vec3 vPos;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * viewMatrix * vec4(vPos, 1.0);
  }
`;

// --- sky --------------------------------------------------------------------

const skyMaterial = () =>
  new THREE.ShaderMaterial({
    depthWrite: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: WORLD_VERT,
    fragmentShader: `
      uniform float uTime;
      varying vec3 vPos;
      varying vec2 vUv;
      ${NOISE}
      void main() {
        float t = uTime;
        vec2 q = vPos.xy * 0.00052;
        float c1 = fbm(q * 2.1 + vec2(t * 0.020, -t * 0.006));
        float c2 = fbm(q * 4.8 + vec2(-t * 0.033, t * 0.012) + c1 * 0.85);
        float mass = smoothstep(0.46, 1.02, c1 * 0.66 + c2 * 0.46);

        // Dense near the horizon, thinning to black overhead, and nothing
        // at all below the waterline — the water owns that half.
        float h = clamp((vPos.y + 150.0) / 1750.0, 0.0, 1.0);
        mass *= smoothstep(1.05, 0.14, h);
        mass *= smoothstep(-520.0, 60.0, vPos.y);

        float core = pow(smoothstep(0.60, 0.99, c2), 3.0);
        float pulse = 0.5 + 0.5 * sin(t * 2.3 + c1 * 7.0) * sin(t * 0.77 + 2.0);

        vec3 col = vec3(0.004, 0.002, 0.007);
        col = mix(col, vec3(0.040, 0.004, 0.010), smoothstep(0.0, 0.45, mass));
        col += vec3(0.42, 0.022, 0.034) * pow(mass, 2.1) * 1.5;
        col += vec3(1.0, 0.22, 0.06) * core * pow(mass, 1.2) * (0.45 + 1.3 * pulse);

        // the shrine's own heat bouncing off the underside of the cloud
        float bounce = exp(-length(vec2(vPos.x * 0.00105, (vPos.y - 240.0) * 0.00150)) * 2.1);
        col += vec3(0.34, 0.085, 0.028) * bounce * 0.42;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

// --- drifting smoke banks ---------------------------------------------------

const smokeMaterial = (seed: number) =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    uniforms: { uTime: { value: 0 }, uSeed: { value: seed }, uTint: { value: 0 } },
    vertexShader: WORLD_VERT,
    fragmentShader: `
      uniform float uTime;
      uniform float uSeed;
      uniform float uTint;
      varying vec3 vPos;
      varying vec2 vUv;
      ${NOISE}
      void main() {
        float t = uTime;
        vec2 q = vUv * vec2(3.4, 1.7) + vec2(uSeed * 4.1, uSeed * 2.7);
        float n = fbm(q * 2.0 + vec2(-t * 0.030, t * 0.008));
        n = fbm(q * 3.6 + n * 1.1 + vec2(t * 0.016, 0.0));
        float m = smoothstep(0.34, 0.82, n);
        // soft edges so the quad never shows
        float edge = smoothstep(0.0, 0.26, vUv.x) * smoothstep(1.0, 0.74, vUv.x)
                   * smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.7, vUv.y);
        float a = m * edge * 0.72;
        vec3 dark = vec3(0.012, 0.004, 0.010);
        vec3 red = vec3(0.34, 0.028, 0.045);
        vec3 col = mix(dark, red, pow(m, 1.3) * uTint);
        col += vec3(0.7, 0.18, 0.07) * pow(smoothstep(0.62, 0.95, n), 4.0) * uTint;
        gl_FragColor = vec4(col, a);
      }
    `,
  });

// --- water ------------------------------------------------------------------

const waterMaterial = () =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uWarm: { value: 1 } },
    vertexShader: WORLD_VERT,
    fragmentShader: `
      uniform float uTime;
      uniform float uWarm;
      varying vec3 vPos;
      ${NOISE}
      void main() {
        float t = uTime;
        float x = vPos.x;
        float z = vPos.z;

        // Ripple rows. Phase wanders with x so the rows read as water and
        // not as a grating.
        float w1 = sin(z * 0.070 + sin(x * 0.0125 + t * 0.55) * 2.4 + t * 1.25) * 0.5 + 0.5;
        float w2 = sin(z * 0.026 - t * 0.68 + x * 0.0042) * 0.5 + 0.5;
        float w3 = vnoise(vec2(x * 0.004, z * 0.02 - t * 0.25));
        float ripple = w1 * (0.55 + 0.45 * w2) * (0.7 + 0.5 * w3);
        ripple = mix(0.42, ripple, smoothstep(-1100.0, 120.0, z));

        // How deep into the reflection this pixel looks: far from the camera
        // is just below the waterline, near the camera is deep.
        float depth = smoothstep(150.0, 720.0, z);
        float a = mix(0.45, 0.992, pow(depth, 0.95));
        a += (ripple - 0.5) * 0.46 * (1.0 - depth * 0.45);
        a = clamp(a, 0.0, 1.0);

        vec3 col = vec3(0.002, 0.006, 0.009);
        col = mix(col, vec3(0.008, 0.078, 0.092), ripple * 0.6);
        col += vec3(0.045, 0.30, 0.34) * pow(ripple, 9.0) * (0.22 + 0.6 * (1.0 - depth));
        // the red sky catching the far water
        col += vec3(0.16, 0.016, 0.022) * smoothstep(420.0, -320.0, z);
        // warm spill directly under the building
        float spill = exp(-abs(x) * 0.0042) * exp(-abs(z - 90.0) * 0.0042);
        col += vec3(0.56, 0.18, 0.04) * spill * 0.8 * uWarm;
        gl_FragColor = vec4(col, a);
      }
    `,
  });

// --- additive helpers -------------------------------------------------------

const shaftMaterial = (color: string) =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(color) }, uStrength: { value: 1 } },
    vertexShader: WORLD_VERT,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uStrength;
      varying vec2 vUv;
      void main() {
        float across = pow(max(0.0, 1.0 - abs(vUv.x - 0.5) * 2.0), 2.4);
        float along = smoothstep(0.0, 0.55, vUv.y) * (1.0 - pow(vUv.y, 6.0) * 0.5);
        float a = across * along;
        gl_FragColor = vec4(uColor * uStrength * a, a);
      }
    `,
  });

const fogMaterial = (color: string) =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uStrength: { value: 1 },
      uTime: { value: 0 },
      uSeed: { value: 0 },
    },
    vertexShader: WORLD_VERT,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uStrength;
      uniform float uTime;
      uniform float uSeed;
      varying vec2 vUv;
      ${NOISE}
      void main() {
        float n = fbm(vUv * vec2(4.5, 2.2) + vec2(uSeed * 3.3 - uTime * 0.045, uSeed));
        float band = pow(max(0.0, 1.0 - abs(vUv.y - 0.56) * 2.1), 1.7);
        float edge = smoothstep(0.0, 0.22, vUv.x) * smoothstep(1.0, 0.78, vUv.x);
        float a = smoothstep(0.32, 0.82, n) * band * edge;
        gl_FragColor = vec4(uColor * uStrength * a, a);
      }
    `,
  });

const emberMaterial = () =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uStrength: { value: 1 }, uSize: { value: 5.2 } },
    vertexShader: `
      attribute float aLife;
      attribute float aHot;
      uniform float uSize;
      varying float vLife;
      varying float vHot;
      void main() {
        vLife = aLife;
        vHot = aHot;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = uSize * (520.0 / max(1.0, -mv.z)) * (0.45 + 0.9 * aHot);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform float uStrength;
      varying float vLife;
      varying float vHot;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = pow(max(0.0, 1.0 - d), 2.4) * vLife * uStrength;
        vec3 col = mix(vec3(1.0, 0.26, 0.04), vec3(1.0, 0.56, 0.16), vHot * 0.5);
        gl_FragColor = vec4(col * a * 1.8, a);
      }
    `,
  });

// --- embers -----------------------------------------------------------------

const EMBER_N = 190;
const EMBER_SEEDS = (() => {
  let s = 20260101;
  const rnd = () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
  return new Array(EMBER_N).fill(0).map(() => {
    // biased toward the shrine, otherwise they read as a field of stars
    const u = rnd() * 2 - 1;
    return {
      x: Math.sign(u) * Math.pow(Math.abs(u), 1.7) * 560,
      z: (rnd() - 0.5) * 460 + 130,
      speed: 0.07 + rnd() * 0.14,
      phase: rnd(),
      sway: 12 + rnd() * 34,
      hot: rnd(),
      top: 120 + rnd() * 170,
    };
  });
})();

const Embers: React.FC<{ t: number; strength: number }> = ({ t, strength }) => {
  const geo = React.useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(EMBER_N * 3), 3));
    g.setAttribute('aLife', new THREE.Float32BufferAttribute(new Float32Array(EMBER_N), 1));
    g.setAttribute('aHot', new THREE.Float32BufferAttribute(new Float32Array(EMBER_N), 1));
    return g;
  }, []);
  const mat = React.useMemo(emberMaterial, []);
  mat.uniforms.uStrength.value = strength;

  const pos = geo.attributes.position as THREE.BufferAttribute;
  const life = geo.attributes.aLife as THREE.BufferAttribute;
  const hot = geo.attributes.aHot as THREE.BufferAttribute;
  for (let i = 0; i < EMBER_N; i++) {
    const e = EMBER_SEEDS[i];
    const p = (e.phase + t * e.speed) % 1;
    const y = -8 + p * e.top;
    const x = e.x + Math.sin(t * 0.8 + e.phase * 19) * e.sway;
    pos.setXYZ(i, x, y, e.z + Math.cos(t * 0.6 + e.phase * 11) * 12);
    life.setX(i, Math.pow(Math.sin(Math.PI * Math.min(1, p * 1.05)), 1.6) * (0.3 + 0.7 * e.hot));
    hot.setX(i, e.hot);
  }
  pos.needsUpdate = true;
  life.needsUpdate = true;
  hot.needsUpdate = true;
  geo.computeBoundingSphere();

  return <points geometry={geo} material={mat} renderOrder={40} frustumCulled={false} />;
};

// --- camera -----------------------------------------------------------------

const CameraRig: React.FC<{ p: number }> = ({ p }) => {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  camera.fov = 38;
  camera.near = 2;
  camera.far = 14000;
  camera.position.set(0, 66 + 11 * p, 968 - 84 * p);
  camera.lookAt(0, 86 + 6 * p, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return null;
};

// --- scene ------------------------------------------------------------------

const SHAFTS = [
  { x: -372, z: 330, w: 150, h: 300 },
  { x: -168, z: 520, w: 120, h: 210 },
  { x: 196, z: 470, w: 130, h: 230 },
  { x: 388, z: 350, w: 165, h: 310 },
  { x: 36, z: 660, w: 210, h: 180 },
];

const Scene: React.FC<{ frame: number; total: number }> = ({ frame, total }) => {
  const t = frame / FPS;
  const p = frame / Math.max(1, total - 1);
  const lit = ramp(frame, 4, 40);
  const riseRaw = ramp(frame, RISE_START, RISE_END);
  const rise = 1 - Math.pow(1 - riseRaw, 2.4);
  const sink = LAYOUT.topY * 1.06 * (1 - rise);
  const flicker =
    0.5 + 0.5 * Math.sin(t * 5.1) * Math.sin(t * 2.3) * (0.6 + 0.4 * Math.sin(t * 0.9));
  const haze = ramp(frame, 16, 86);

  const sky = React.useMemo(skyMaterial, []);
  const water = React.useMemo(waterMaterial, []);
  const smoke = React.useMemo(() => [0, 1, 2, 3, 4].map((i) => smokeMaterial(i + 1)), []);
  const shaft = React.useMemo(() => shaftMaterial('#2fe6e0'), []);
  const fogLow = React.useMemo(() => fogMaterial('#1d7f8c'), []);
  const fogWarm = React.useMemo(() => fogMaterial('#ff8a3a'), []);
  const godRay = React.useMemo(() => shaftMaterial('#ff5a22'), []);

  sky.uniforms.uTime.value = t;
  water.uniforms.uTime.value = t;
  water.uniforms.uWarm.value = rise * lit;
  smoke.forEach((m, i) => {
    m.uniforms.uTime.value = t + i * 7;
    m.uniforms.uTint.value = 0.5 + 0.5 * Math.sin(i * 2.1);
  });
  shaft.uniforms.uStrength.value = 0.22 + 0.17 * haze + 0.05 * flicker;
  godRay.uniforms.uStrength.value = 0.32 * rise * lit;
  fogLow.uniforms.uTime.value = t;
  fogLow.uniforms.uStrength.value = 0.85 * haze;
  fogWarm.uniforms.uTime.value = t * 1.3;
  fogWarm.uniforms.uSeed.value = 3.4;
  fogWarm.uniforms.uStrength.value = 0.42 * haze * rise;

  return (
    <>
      <CameraRig p={p} />

      {/* two-temperature ambient: red from the cloud, teal from the water */}
      <hemisphereLight args={['#3a060a', '#0b5c68', 1.0]} />
      <ambientLight color="#15121a" intensity={0.34} />
      <directionalLight position={[320, 620, 460]} color="#ff6a38" intensity={1.25} />
      <directionalLight position={[-420, -220, -520]} color="#2fe6d8" intensity={1.5} />
      <directionalLight position={[-520, 240, 420]} color="#8fd8f2" intensity={0.5} />
      <pointLight
        position={[0, 70, -16]}
        color="#ff6a16"
        intensity={lamp(0.95 + flicker * 0.4, 220)}
        distance={1400}
        decay={2}
      />
      <pointLight
        position={[0, 158, 210]}
        color="#ff9840"
        intensity={lamp(0.38, 260)}
        distance={1400}
        decay={2}
      />
      <pointLight
        position={[0, 96, 120]}
        color="#ff8030"
        intensity={lamp(0.3 + flicker * 0.14, 150)}
        distance={520}
        decay={2}
      />
      {[-1, 1].map((sx) => (
        <pointLight
          key={`ll${sx}`}
          position={[sx * 204, 48, 150]}
          color="#9fdcf6"
          intensity={lamp(0.42, 180)}
          distance={760}
          decay={2}
        />
      ))}
      <pointLight
        position={[0, -110, 330]}
        color="#19bdb4"
        intensity={lamp(0.85, 340)}
        distance={2200}
        decay={2}
      />

      <mesh position={[0, 300, -3200]} material={sky} renderOrder={-100} frustumCulled={false}>
        <planeGeometry args={[11000, 6400]} />
      </mesh>

      {/* smoke banks drifting at different depths */}
      {smoke.map((m, i) => (
        <mesh
          key={`sm${i}`}
          material={m}
          renderOrder={-90 + i}
          position={[
            [-520, 420, -180, 680, 120][i],
            [520, 700, 330, 460, 880][i],
            [-2300, -1500, -900, -1900, -2700][i],
          ]}
          frustumCulled={false}
        >
          <planeGeometry args={[[2600, 2000, 1500, 2200, 3200][i], [900, 700, 520, 780, 1100][i]]} />
        </mesh>
      ))}

      {/* god rays leaning out of the cloud over the shrine */}
      {[-1, 1].map((sx) => (
        <mesh
          key={`gr${sx}`}
          material={godRay}
          renderOrder={25}
          position={[sx * 230, 560, -620]}
          rotation={[0, 0, sx * 0.22]}
          frustumCulled={false}
        >
          <planeGeometry args={[320, 900]} />
        </mesh>
      ))}

      {/* the building, clipped to above the waterline as it rises */}
      <group position={[0, -sink, 0]}>
        <Shrine lit={lit} flicker={flicker} />
      </group>

      {/* the mirrored underworld, clipped to below the waterline */}
      <group position={[0, sink, 0]} scale={[1, -1, 1]}>
        <Shrine cold lit={lit} flicker={flicker} />
      </group>

      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        material={water}
        renderOrder={10}
        frustumCulled={false}
      >
        <planeGeometry args={[9000, 9000]} />
      </mesh>

      {/* teal shafts rising through the reflection */}
      {SHAFTS.map((s, i) => (
        <mesh
          key={`sh${i}`}
          material={shaft}
          renderOrder={20}
          position={[s.x, -s.h / 2, s.z]}
          frustumCulled={false}
        >
          <planeGeometry args={[s.w, s.h]} />
        </mesh>
      ))}

      <mesh material={fogLow} renderOrder={30} position={[0, 6, 340]} frustumCulled={false}>
        <planeGeometry args={[2100, 200]} />
      </mesh>
      <mesh material={fogWarm} renderOrder={31} position={[0, 18, 210]} frustumCulled={false}>
        <planeGeometry args={[1000, 170]} />
      </mesh>

      <Embers t={t} strength={1.3 * haze} />
    </>
  );
};

export const MalevolentShrine: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const fade =
    ramp(frame, 0, FADE_IN) * (1 - ramp(frame, durationInFrames - FADE_OUT, durationInFrames));

  return (
    <AbsoluteFill style={{ backgroundColor: '#000000' }}>
      <ThreeCanvas
        width={width}
        height={height}
        orthographic={false}
        gl={{ antialias: true, alpha: false }}
        onCreated={({ gl }) => {
          gl.localClippingEnabled = true;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 0.97;
          gl.setClearColor(new THREE.Color('#000000'), 1);
        }}
      >
        <Scene frame={frame} total={durationInFrames} />
      </ThreeCanvas>
      {/* lens vignette, then the fade from and to black */}
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(ellipse 72% 70% at 50% 54%, rgba(0,0,0,0) 48%, rgba(0,0,0,0.55) 100%)',
          pointerEvents: 'none',
        }}
      />
      <AbsoluteFill style={{ backgroundColor: '#000000', opacity: 1 - fade }} />
    </AbsoluteFill>
  );
};
