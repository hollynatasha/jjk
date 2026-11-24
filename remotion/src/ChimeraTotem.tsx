import React, { useMemo } from 'react';
import { ThreeCanvas } from '@remotion/three';
import { useCurrentFrame } from 'remotion';
import * as THREE from 'three';

// The totem Chimera Shadow Garden opens on: a stack of plated, horned segments
// that slams up out of the floor and hangs there glowing, with the whips
// erupting out of its crown. Real extruded, bevelled geometry rather than
// stacked silhouettes, edges picked out in white so the plating reads.

const FPS = 30;

const BODY = '#8fd4ff';
const EDGE = '#e8feff';

/** A bevelled solid from a 2D outline, so the plates have real thickness. */
function solid(points: [number, number][], depth: number, round = 0.06) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: round,
    bevelSize: round,
    bevelSegments: 3,
    curveSegments: 10,
  });
}

// one piece: the solid, plus its edges as glowing seams
const Piece: React.FC<{
  geometry: THREE.BufferGeometry;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  glow: number;
}> = ({ geometry, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1], glow }) => {
  const edges = useMemo(() => new THREE.EdgesGeometry(geometry, 28), [geometry]);
  return (
    <group position={position} rotation={rotation} scale={scale}>
      <mesh geometry={geometry}>
        <meshPhysicalMaterial
          color={BODY}
          emissive={'#1b6fc4'}
          emissiveIntensity={0.5 + glow * 0.4}
          metalness={0.12}
          roughness={0.34}
          clearcoat={1}
          clearcoatRoughness={0.18}
          transmission={0.3}
          thickness={0.7}
          ior={1.32}
        />
      </mesh>
      <lineSegments geometry={edges}>
        <lineBasicMaterial color={EDGE} transparent opacity={0.95} />
      </lineSegments>
    </group>
  );
};

const PITCH = 1.22;

const Totem3D: React.FC<{ glow: number; spin: number }> = ({ glow, spin }) => {
  // built once, reused at every tier
  const geo = useMemo(() => {
    const plate = solid(
      [
        [0.3, -0.06], [1.08, -0.14], [1.58, -0.34], [1.9, -0.6],
        [1.96, -0.86], [1.8, -1.03], [1.3, -1.12], [0.72, -1.14], [0.3, -1.08],
      ],
      0.5,
    );
    const claw = solid(
      [[1.62, -0.62], [2.24, -0.9], [2.66, -1.44], [2.78, -2.0], [2.44, -1.52], [2.0, -1.0], [1.5, -0.78]],
      0.32,
    );
    const key = solid(
      [[-0.5, -0.04], [0.5, -0.04], [0.54, -0.56], [0.5, -1.08], [-0.5, -1.08], [-0.54, -0.56]],
      0.66,
    );
    const spine = solid([[-0.3, 0.12], [0.3, 0.12], [0.3, -3.6], [-0.3, -3.6]], 0.42);
    const horn = solid(
      [[0.44, 0], [0.88, 0.52], [1.04, 1.14], [0.82, 1.58], [0.68, 1.08], [0.46, 0.54], [0.14, 0.06]],
      0.3,
    );
    return { plate, claw, key, spine, horn };
  }, []);

  const tiers = [0, 1, 2];
  return (
    <group rotation={[0, spin, 0]} position={[0, -2.55, 0]} scale={1.06}>
      <Piece geometry={geo.spine} position={[0, 3.64, -0.21]} glow={glow} />
      {tiers.map((i) => {
        const k = 1 - i * 0.06;
        const y = 1.06 + i * PITCH;
        return (
          <group key={i} position={[0, y, 0]}>
            <Piece geometry={geo.key} position={[0, 0, -0.31]} scale={[k, 1, 1]} glow={glow} />
            {[1, -1].map((side) => (
              <group key={side} scale={[side * k, 1, 1]}>
                <Piece geometry={geo.plate} position={[0, 0, -0.23]} glow={glow} />
                <Piece geometry={geo.claw} position={[0, 0, -0.15]} glow={glow} />
              </group>
            ))}
          </group>
        );
      })}
      {/* the pair of horns that crown it */}
      {[1, -1].map((side) => (
        <group key={side} position={[0, 3.45, -0.15]} rotation={[0, 0, -side * 0.2]} scale={[side, 1, 1]}>
          <Piece geometry={geo.horn} glow={glow} />
        </group>
      ))}
      {/* the light burning inside the stack */}
      <pointLight position={[0, 2.2, 0.9]} color="#6fe4ff" intensity={22 + glow * 16} distance={14} decay={2} />
      <pointLight position={[0, 4.4, -1.8]} color="#1240ff" intensity={16} distance={18} decay={2} />
    </group>
  );
};

const Scene: React.FC<{ enter: number; glow: number; spin: number }> = ({ enter, glow, spin }) => (
  <group position={[0, -9 * (1 - enter), 0]}>
    <ambientLight intensity={0.34} color="#2b6fa8" />
    <directionalLight position={[-5, 7, 7]} intensity={3.1} color="#dff4ff" />
    <directionalLight position={[6, 2, -6]} intensity={2.4} color="#2f7dff" />
    <Totem3D glow={glow} spin={spin} />
  </group>
);

// The caller stacks this as a sharp copy plus blurred ones screened over it,
// because a canvas cannot be blurred into itself.
export const ChimeraTotem: React.FC<{
  width: number;
  height: number;
  enter: number;
  opacity: number;
}> = ({ width, height, enter, opacity }) => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const glow = 0.5 + 0.5 * Math.sin(t * 3.1);
  const spin = Math.sin(t * 0.34) * 0.26;
  if (opacity <= 0.002) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, opacity }}>
      <ThreeCanvas
        linear
        width={width}
        height={height}
        gl={{ alpha: true, antialias: true }}
        style={{ position: 'absolute', left: 0, top: 0, background: 'transparent' }}
        camera={{ fov: 34, position: [0, 0.3, 14], near: 0.1, far: 100 }}
      >
        <Scene enter={enter} glow={glow} spin={spin} />
      </ThreeCanvas>
    </div>
  );
};
