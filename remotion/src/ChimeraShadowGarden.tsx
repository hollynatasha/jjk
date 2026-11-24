import React from 'react';
import { AbsoluteFill, interpolate, random, useCurrentFrame, useVideoConfig } from 'remotion';
import { ChimeraTotem } from './ChimeraTotem';

// Megumi / Chimera Shadow Garden background. Red wireframe lattice running to
// a low horizon, cursed energy erupting off the floor as cyan whips, shadow
// pooling along the bottom edge, and the whole thing flooding blue as the
// domain settles.
//
// No shikigami in here on purpose: the garden is the barrier itself.

const RED = '#ff0a1e';
const RED_HOT = '#ff4a5e';
const CYAN = '#2fd0ff';
const CYAN_DEEP = '#1657ff';
const CORE = '#e6feff';
const FLOOD = '#0b46ff';

const FPS = 30;

const ramp = (frame: number, a: number, b: number) =>
  interpolate(frame, [a, b], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

// Floor grid to a low horizon with a railing standing on it, flat saturated
// red. The lines stay thin and crisp; the glow is the blurred copy the caller
// stacks over them.
const Lattice: React.FC<{ frame: number; width: number; height: number; build: number }> = ({
  frame,
  width,
  height,
  build,
}) => {
  const hz = height * 0.42;
  const t = frame / FPS;
  const scroll = (t * 0.1) % 1;
  const rows = 24;
  const cols = 26;
  const railTop = hz - height * 0.16;
  // railing builds out from the vanishing point as the domain closes
  const reach = Math.pow(build, 0.6);
  return (
    <svg width={width} height={height} style={{ position: 'absolute', left: 0, top: 0 }}>
      {/* floor rails, coming toward the camera */}
      {new Array(rows).fill(0).map((_, i) => {
        const u = (i + scroll) / rows;
        const d = Math.pow(u, 2.4);
        const y = hz + (height - hz) * d;
        const half = width * (0.04 + d * 1.6) * reach;
        return (
          <line
            key={`fr${i}`}
            x1={width / 2 - half}
            y1={y}
            x2={width / 2 + half}
            y2={y}
            stroke={RED}
            strokeWidth={0.5 + 2.2 * d}
            opacity={(0.1 + 0.6 * d) * build}
          />
        );
      })}
      {/* floor runners, converging on the vanishing point */}
      {new Array(cols + 1).fill(0).map((_, i) => {
        const k = i / cols - 0.5;
        return (
          <line
            key={`fc${i}`}
            x1={width / 2 + k * width * 0.06}
            y1={hz}
            x2={width / 2 + k * width * 4.2}
            y2={height}
            stroke={RED}
            strokeWidth={0.9}
            opacity={0.26 * build}
          />
        );
      })}
      {/* railing on the horizon: rails, then the bars between them */}
      {[0, 0.34, 0.68, 1].map((k, i) => (
        <line
          key={`rr${i}`}
          x1={width / 2 - width * 0.62 * reach}
          y1={railTop + (hz - railTop) * k}
          x2={width / 2 + width * 0.62 * reach}
          y2={railTop + (hz - railTop) * k}
          stroke={i === 3 ? RED_HOT : RED}
          strokeWidth={i === 3 ? 1.8 : 1}
          opacity={(i === 3 ? 0.9 : 0.5) * build}
        />
      ))}
      {new Array(43).fill(0).map((_, i) => {
        const k = i / 42 - 0.5;
        const x = width / 2 + k * width * 1.24 * reach;
        return (
          <line
            key={`rb${i}`}
            x1={x}
            y1={railTop}
            x2={x}
            y2={hz}
            stroke={RED}
            strokeWidth={0.9}
            opacity={0.34 * build}
          />
        );
      })}
      {/* posts standing on the floor, thinning away to the horizon */}
      {new Array(11).fill(0).map((_, i) => {
        const k = (i / 10 - 0.5) * 2;
        const u = 0.42 + Math.abs(k) * 0.3;
        const d = Math.pow(u, 2.4);
        const y = hz + (height - hz) * d;
        const x = width / 2 + k * width * 0.62;
        return (
          <line
            key={`po${i}`}
            x1={x}
            y1={y}
            x2={x}
            y2={y - height * 0.1 * (1 - d * 0.5)}
            stroke={RED}
            strokeWidth={0.8 + d * 1.6}
            opacity={0.3 * build}
          />
        );
      })}
      {/* a second railing further back, half scale, for depth */}
      {[0, 1].map((k, i) => (
        <line
          key={`rr2${i}`}
          x1={width / 2 - width * 0.3 * reach}
          y1={hz - height * 0.075 + height * 0.075 * k}
          x2={width / 2 + width * 0.3 * reach}
          y2={hz - height * 0.075 + height * 0.075 * k}
          stroke={RED}
          strokeWidth={0.8}
          opacity={0.3 * build}
        />
      ))}
      {new Array(27).fill(0).map((_, i) => {
        const k = i / 26 - 0.5;
        const x = width / 2 + k * width * 0.6 * reach;
        return (
          <line
            key={`rb2${i}`}
            x1={x}
            y1={hz - height * 0.075}
            x2={x}
            y2={hz}
            stroke={RED}
            strokeWidth={0.7}
            opacity={0.2 * build}
          />
        );
      })}
    </svg>
  );
};


// Cursed energy whipping out of a point on the floor. Each whip integrates its
// own heading, so it curls instead of wobbling around a straight axis, and gets
// stroked three times: wide halo, cyan body, hot core.
const Whips: React.FC<{
  frame: number;
  width: number;
  height: number;
  sx: number;
  sy: number;
  count: number;
  opacity: number;
}> = ({ frame, width, height, sx, sy, count, opacity }) => {
  const t = frame / FPS;
  const R = Math.hypot(width, height);
  const SAMPLES = 26;
  return (
    <svg width={width} height={height} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
      {new Array(count).fill(0).map((_, i) => {
        const born = 0.25 + random(`wb${i}`) * 0.85;
        const age = t - born;
        if (age <= 0) return null;
        const grow = Math.min(1, age / (0.5 + random(`wg${i}`) * 0.45));
        // fanned across the upper half and a little under the horizontal, so a
        // few whips rake along the floor
        const spread = Math.PI * 1.22;
        const base = -Math.PI - 0.11 + (spread * (i + 0.5)) / count + (random(`wj${i}`) - 0.5) * 0.38;
        const len = R * (0.2 + Math.pow(random(`wl${i}`), 0.8) * 0.62);
        const curl = (random(`wc${i}`) - 0.5) * 3.6;
        const sp = 0.5 + random(`ws${i}`) * 1.2;
        const freq = 3 + random(`wf${i}`) * 5;
        const amp = 0.5 + random(`wa${i}`) * 1.5;
        const n = Math.max(2, Math.round(SAMPLES * grow));
        const step = len / SAMPLES;
        // roots scatter around the source so the whips cross near the floor
        const ox = sx + (random(`wox${i}`) - 0.5) * width * 0.12;
        const oy = sy + (random(`woy${i}`) - 0.5) * height * 0.09;
        let x = ox;
        let y = oy;
        let a = base;
        const pts: string[] = [`M ${ox.toFixed(1)} ${oy.toFixed(1)}`];
        for (let k = 1; k <= n; k++) {
          const u = k / SAMPLES;
          // steady curl that bites harder at the tip, plus a travelling wave
          a += (curl * u * 1.6) / SAMPLES + (amp * Math.sin(t * sp * 2.1 + i * 1.7 + u * freq) * u) / SAMPLES;
          x += Math.cos(a) * step;
          y += Math.sin(a) * step;
          pts.push(`L ${x.toFixed(1)} ${y.toFixed(1)}`);
        }
        const d = pts.join(' ');
        // thick half near the root, redrawn over the full path: a taper without
        // stroking every segment separately
        const root = pts.slice(0, Math.max(2, Math.round(pts.length * 0.5))).join(' ');
        const w = 2.2 + Math.pow(random(`ww${i}`), 1.5) * 5.2;
        const a0 = opacity * (0.55 + random(`wv${i}`) * 0.45);
        return (
          <g key={i} opacity={a0}>
            <path d={d} stroke={CYAN_DEEP} strokeWidth={w * 6} opacity={0.2} fill="none" strokeLinecap="round" />
            <path d={root} stroke={CYAN_DEEP} strokeWidth={w * 8} opacity={0.16} fill="none" strokeLinecap="round" />
            <path d={d} stroke={CYAN} strokeWidth={w * 2} opacity={0.62} fill="none" strokeLinecap="round" />
            <path d={root} stroke={CYAN} strokeWidth={w * 3} opacity={0.45} fill="none" strokeLinecap="round" />
            <path d={d} stroke={CORE} strokeWidth={w * 0.55} opacity={0.95} fill="none" strokeLinecap="round" />
            <path d={root} stroke={CORE} strokeWidth={w * 0.9} opacity={0.9} fill="none" strokeLinecap="round" />
          </g>
        );
      })}
    </svg>
  );
};

/** Shadow pooling along the bottom edge, lit blue where the energy reaches it. */
const GroundMist: React.FC<{ frame: number; width: number; height: number; opacity: number }> = ({
  frame,
  width,
  height,
  opacity,
}) => {
  const t = frame / FPS;
  return (
    <>
      {new Array(7).fill(0).map((_, i) => {
        const drift = (random(`gd${i}`) - 0.5) * 0.05;
        const x = (((random(`gx${i}`) + t * drift) % 1.4) + 1.4) % 1.4 * width - width * 0.2;
        const y = height * (0.74 + random(`gy${i}`) * 0.3);
        const w = width * (0.3 + random(`gw${i}`) * 0.5);
        const h = height * (0.07 + random(`gh${i}`) * 0.14);
        const teal = random(`gt${i}`) > 0.55;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x - w / 2,
              top: y - h / 2,
              width: w,
              height: h,
              borderRadius: '50%',
              transform: `rotate(${(random(`gr${i}`) - 0.5) * 18}deg)`,
              background: `radial-gradient(ellipse, ${teal ? 'rgba(47,208,255,0.4)' : 'rgba(42,60,255,0.42)'} 0%, rgba(0,0,0,0) 70%)`,
              filter: `blur(${(20 + random(`gb${i}`) * 30).toFixed(0)}px)`,
              opacity: (0.4 + random(`ga${i}`) * 0.6) * opacity,
            }}
          />
        );
      })}
    </>
  );
};

export const ChimeraShadowGarden: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const t = frame / FPS;
  const build = ramp(frame, 14, 40);
  const energy = ramp(frame, 34, 62);
  const mist = ramp(frame, 34, 80);
  // floods blue as it settles, then drains with everything else
  const flood = ramp(frame, 120, 186) * (1 - ramp(frame, 196, 216));
  const out = 1 - ramp(frame, durationInFrames - 28, durationInFrames);
  // the totem slams up out of the floor behind the caster, overshoots and
  // settles; everything else follows it
  const slam = ramp(frame, 6, 22);
  const overshoot = 1 - Math.pow(1 - slam, 3);
  const totemFade = ramp(frame, 6, 16) * (1 - 0.4 * ramp(frame, 150, 210));
  // the whips erupt from the totem's crown, which the 3D camera puts here
  const sx = width / 2;
  const sy = height * 0.4;
  // slow push in, so the lattice is never a still image
  const push = 1 + 0.07 * ramp(frame, 0, durationInFrames);

  return (
    <AbsoluteFill style={{ backgroundColor: '#000000', opacity: out }}>
      <AbsoluteFill style={{ transform: `scale(${push})`, transformOrigin: `${sx}px ${height * 0.42}px` }}>
        <AbsoluteFill style={{ mixBlendMode: 'screen' }}>
          <Lattice frame={frame} width={width} height={height} build={build} />
        </AbsoluteFill>
        {/* the lattice bleeding, so the red reads as light and not as ink */}
        <AbsoluteFill style={{ mixBlendMode: 'screen', filter: 'blur(11px)', opacity: 0.85 }}>
          <Lattice frame={frame} width={width} height={height} build={build} />
        </AbsoluteFill>
      </AbsoluteFill>

      <AbsoluteFill
        style={{
          background: 'radial-gradient(130% 68% at 50% 104%, rgba(0,0,0,0.96) 28%, rgba(0,0,0,0) 74%)',
        }}
      />

      <AbsoluteFill style={{ mixBlendMode: 'screen' }}>
        <GroundMist frame={frame} width={width} height={height} opacity={mist} />
      </AbsoluteFill>

      {/* the totem, and the light it throws */}
      <AbsoluteFill style={{ mixBlendMode: 'screen', filter: 'blur(36px)', opacity: 0.72 * totemFade }}>
        <ChimeraTotem width={width} height={height} enter={overshoot} opacity={1} />
      </AbsoluteFill>
      <AbsoluteFill style={{ mixBlendMode: 'screen', filter: 'blur(11px)', opacity: 0.5 * totemFade }}>
        <ChimeraTotem width={width} height={height} enter={overshoot} opacity={1} />
      </AbsoluteFill>
      <ChimeraTotem width={width} height={height} enter={overshoot} opacity={totemFade} />

      <AbsoluteFill style={{ mixBlendMode: 'screen' }}>
        <div
          style={{
            position: 'absolute',
            left: sx - height * 0.26,
            top: sy - height * 0.26,
            width: height * 0.52,
            height: height * 0.52,
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(230,254,255,0.8) 0%, rgba(47,208,255,0.34) 12%, rgba(22,87,255,0.18) 32%, rgba(0,0,0,0) 64%)',
            filter: 'blur(16px)',
            opacity: energy * (0.6 + 0.4 * Math.abs(Math.sin(t * 2.1))),
          }}
        />
      </AbsoluteFill>

      {/* energy, and the same energy blurred twice over itself for the bloom */}
      <AbsoluteFill style={{ mixBlendMode: 'screen', filter: 'blur(34px)', opacity: 0.45 }}>
        <Whips frame={frame} width={width} height={height} sx={sx} sy={sy} count={34} opacity={energy} />
      </AbsoluteFill>
      <AbsoluteFill style={{ mixBlendMode: 'screen', filter: 'blur(9px)', opacity: 0.9 }}>
        <Whips frame={frame} width={width} height={height} sx={sx} sy={sy} count={34} opacity={energy} />
      </AbsoluteFill>
      <AbsoluteFill style={{ mixBlendMode: 'screen' }}>
        <Whips frame={frame} width={width} height={height} sx={sx} sy={sy} count={34} opacity={energy} />
      </AbsoluteFill>

      <AbsoluteFill style={{ mixBlendMode: 'screen' }}>
        {new Array(80).fill(0).map((_, i) => {
          const life = 1.6 + random(`ml${i}`) * 2.6;
          const age = (t + random(`mb${i}`) * life) % life;
          const k = Math.sin((age / life) * Math.PI);
          const x = random(`mx${i}`) * width + Math.sin(t * 1.4 + i) * 10;
          const y = (random(`my${i}`) * height - age * 46 + height * 2) % height;
          const size = 1 + random(`ms${i}`) * 2.4;
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: x,
                top: y,
                width: size,
                height: size,
                borderRadius: '50%',
                background: CORE,
                boxShadow: `0 0 ${5 + size * 4}px ${CYAN}`,
                opacity: k * 0.7 * energy,
              }}
            />
          );
        })}
      </AbsoluteFill>

      {/* the blue the garden finally floods with */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(120% 100% at 50% 58%, rgba(60,170,255,0.5) 0%, ${FLOOD}cc 55%, rgba(4,10,60,0.9) 100%)`,
          mixBlendMode: 'screen',
          opacity: flood * 0.72,
        }}
      />

      <AbsoluteFill
        style={{ background: 'radial-gradient(128% 100% at 50% 52%, rgba(0,0,0,0) 46%, rgba(0,0,0,0.84) 100%)' }}
      />
    </AbsoluteFill>
  );
};
