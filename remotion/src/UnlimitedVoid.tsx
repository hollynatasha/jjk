import React from 'react';
import { AbsoluteFill, interpolate, random, useCurrentFrame, useVideoConfig } from 'remotion';

// Gojo / Unlimited Void background. Two acts on one camera move: a tube of
// streaks accelerating at a small dark aperture, then a punch-through onto the
// void itself, sitting on a band of blue nebula.
//
// Rendered offline, so blur stacks and hundreds of layers cost nothing. Plays
// behind the person cutout, so nothing in here is a figure.

const CRIMSON = '#ff1346';
const VIOLET = '#6a28ff';
const INDIGO = '#3a1ad0';
const LILAC = '#e2d2ff';
const WHITE = '#ffffff';
const GOLD = '#f6ebb0';
const JADE = '#cdf6c8';
const CYAN = '#7fe9ff';
const AZURE = '#3aa0ff';

// weighted so crimson and violet carry the tube, white only punctuates
const STREAK_COLOURS = [CRIMSON, CRIMSON, CRIMSON, VIOLET, VIOLET, VIOLET, INDIGO, LILAC, LILAC, WHITE];

const FPS = 30;

const ramp = (frame: number, a: number, b: number) =>
  interpolate(frame, [a, b], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

// Streaks down the wall of the tube. Each one is a point travelling at the
// camera: short and dim near the aperture, long and bright at the edge of frame.
const Streaks: React.FC<{ frame: number; cx: number; cy: number; reach: number; opacity: number; count: number }> = ({
  frame,
  cx,
  cy,
  reach,
  opacity,
  count,
}) => {
  const t = frame / FPS;
  return (
    <>
      {new Array(count).fill(0).map((_, i) => {
        const ang = random(`sa${i}`) * 360;
        const speed = 0.3 + random(`ss${i}`) * 0.75;
        const travel = ((random(`so${i}`) * 2 + t * speed) % 1.25) - 0.06;
        if (travel <= 0) return null;
        // the last stretch of the approach covers most of the distance, which
        // is what reads as speed
        const depth = Math.pow(travel, 1.9);
        const r = 0.06 * reach + depth * reach;
        const len = reach * (0.14 + random(`sl${i}`) * 0.8) * (0.1 + depth * 1.9);
        const thick = 0.7 + random(`sw${i}`) * 2.6 * (0.2 + depth * 2.2);
        const colour = STREAK_COLOURS[Math.floor(random(`sc${i}`) * STREAK_COLOURS.length)];
        const a = Math.min(1, travel * 9) * Math.min(1, (1.18 - travel) * 3.2) * (0.45 + random(`sv${i}`) * 0.55) * opacity;
        if (a <= 0.004) return null;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: cx,
              top: cy,
              width: len,
              height: thick,
              marginTop: -thick / 2,
              transform: `rotate(${ang}deg) translateX(${r}px)`,
              transformOrigin: '0 50%',
              background: `linear-gradient(90deg, ${colour}00 0%, ${colour} 55%, ${colour}00 100%)`,
              opacity: a,
              borderRadius: thick,
            }}
          />
        );
      })}
    </>
  );
};

// Broken concentric ribs scrolling outward. Without these the streaks read as
// a flat starfield instead of a tube.
const Ribs: React.FC<{ frame: number; cx: number; cy: number; reach: number; opacity: number }> = ({
  frame,
  cx,
  cy,
  reach,
  opacity,
}) => {
  const t = frame / FPS;
  const n = 26;
  return (
    <svg
      width={cx * 2}
      height={cy * 2}
      viewBox={`0 0 ${cx * 2} ${cy * 2}`}
      style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}
    >
      {new Array(n).fill(0).map((_, i) => {
        const travel = ((i / n + t * 0.22) % 1.1) - 0.04;
        if (travel <= 0) return null;
        const depth = Math.pow(travel, 2.1);
        const r = reach * (0.045 + depth * 1.15);
        const circ = 2 * Math.PI * r;
        // cut into arcs, pattern fixed per rib
        const seg = 5 + Math.floor(random(`rg${i}`) * 7);
        const on = circ / seg * (0.18 + random(`rd${i}`) * 0.5);
        const off = circ / seg - on;
        const a = Math.min(1, travel * 7) * Math.min(1, (1.05 - travel) * 3) * (0.1 + random(`rv${i}`) * 0.3) * opacity;
        if (a <= 0.004) return null;
        const tone = random(`rc${i}`) > 0.72 ? LILAC : random(`rc2${i}`) > 0.5 ? VIOLET : CRIMSON;
        return (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={tone}
            strokeWidth={0.6 + depth * 7}
            strokeDasharray={`${on.toFixed(1)} ${off.toFixed(1)}`}
            strokeDashoffset={(random(`ro${i}`) * circ).toFixed(1)}
            opacity={a}
          />
        );
      })}
    </svg>
  );
};

/** Smoke dragged down the tube between the streaks. */
const Wisps: React.FC<{ frame: number; cx: number; cy: number; reach: number; opacity: number }> = ({
  frame,
  cx,
  cy,
  reach,
  opacity,
}) => {
  const t = frame / FPS;
  return (
    <>
      {new Array(16).fill(0).map((_, i) => {
        const ang = random(`wa${i}`) * 360;
        const travel = ((random(`wo${i}`) * 2 + t * (0.18 + random(`ws${i}`) * 0.3)) % 1.2) - 0.05;
        if (travel <= 0) return null;
        const depth = Math.pow(travel, 1.8);
        const r = reach * (0.07 + depth);
        const len = reach * (0.14 + random(`wl${i}`) * 0.3) * (0.3 + depth * 1.6);
        const thick = reach * (0.02 + random(`wt${i}`) * 0.05) * (0.3 + depth * 1.4);
        const a = Math.min(1, travel * 6) * Math.min(1, (1.1 - travel) * 3) * (0.1 + random(`wv${i}`) * 0.22) * opacity;
        if (a <= 0.004) return null;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: cx,
              top: cy,
              width: len,
              height: thick,
              marginTop: -thick / 2,
              transform: `rotate(${ang}deg) translateX(${r}px)`,
              transformOrigin: '0 50%',
              borderRadius: '50%',
              background: `radial-gradient(ellipse at 50% 50%, rgba(226,210,255,0.85) 0%, rgba(170,150,225,0.3) 45%, rgba(0,0,0,0) 72%)`,
              filter: `blur(${(6 + depth * 14).toFixed(1)}px)`,
              opacity: a,
            }}
          />
        );
      })}
    </>
  );
};

// the dark mouth at the far end of the tube, plus its rings
const Aperture: React.FC<{ frame: number; cx: number; cy: number; reach: number; opacity: number }> = ({
  frame,
  cx,
  cy,
  reach,
  opacity,
}) => (
  <div style={{ position: 'absolute', left: cx, top: cy, opacity }}>
    {[0.055, 0.075, 0.1, 0.13, 0.17].map((k, i) => {
      const size = k * reach * 2;
      return (
        <div
          key={i}
          style={{
            position: 'absolute',
            width: size,
            height: size,
            marginLeft: -size / 2,
            marginTop: -size / 2,
            borderRadius: '50%',
            border: `${0.8 + i * 0.5}px solid rgba(190,165,255,${0.34 - i * 0.05})`,
            transform: `rotate(${frame * (i % 2 ? -0.7 : 1.1)}deg)`,
            boxShadow: `0 0 ${10 + i * 8}px rgba(120,70,255,0.2)`,
          }}
        />
      );
    })}
    {/* the hole itself: black, with the thinnest hot rim */}
    <div
      style={{
        position: 'absolute',
        width: reach * 0.088,
        height: reach * 0.088,
        marginLeft: -reach * 0.044,
        marginTop: -reach * 0.044,
        borderRadius: '50%',
        background: '#000',
        border: '1px solid rgba(226,210,255,0.55)',
        boxSizing: 'border-box',
      }}
    />
  </div>
);

// The band the void sits on: clumps of blue and teal with hot speckles inside
// them, crossing the whole frame horizontally.
const Nebula: React.FC<{ frame: number; width: number; height: number; opacity: number }> = ({
  frame,
  width,
  height,
  opacity,
}) => {
  const t = frame / FPS;
  return (
    <>
      {new Array(70).fill(0).map((_, i) => {
        const drift = (random(`nd${i}`) - 0.5) * 0.012;
        const x = (((random(`nx${i}`) + t * drift) % 1.2) + 1.2) % 1.2 * width - width * 0.1;
        // tight to the middle band, with a little spread
        const y = height * (0.46 + (random(`ny${i}`) - 0.5) * 0.34);
        const size = height * (0.05 + Math.pow(random(`nr${i}`), 2.1) * 0.36);
        const teal = random(`nt${i}`) > 0.62;
        const tone = teal ? 'rgba(60,232,214,0.3)' : 'rgba(58,160,255,0.34)';
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x - size / 2,
              top: y - size / 2,
              width: size,
              height: size * (0.5 + random(`nh${i}`) * 0.5),
              borderRadius: '50%',
              background: `radial-gradient(circle, ${tone} 0%, rgba(0,0,0,0) 68%)`,
              filter: `blur(${(5 + random(`nb${i}`) * 16).toFixed(0)}px)`,
              opacity: (0.35 + random(`na${i}`) * 0.65) * opacity,
            }}
          />
        );
      })}
      {/* the hot speckles inside the band */}
      {new Array(150).fill(0).map((_, i) => {
        const x = random(`kx${i}`) * width;
        const y = height * (0.46 + (random(`ky${i}`) - 0.5) * 0.26);
        const size = 1 + random(`ks${i}`) * 3.4;
        const twinkle = 0.45 + 0.55 * Math.abs(Math.sin(t * (0.6 + random(`kt${i}`) * 1.6) + random(`kp${i}`) * 9));
        const tone = random(`kc${i}`) > 0.45 ? CYAN : '#d8f6ff';
        return (
          <div
            key={`k${i}`}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: size,
              height: size,
              borderRadius: '50%',
              background: tone,
              boxShadow: `0 0 ${4 + size * 4}px ${tone}`,
              opacity: twinkle * (0.3 + random(`ka${i}`) * 0.6) * opacity,
            }}
          />
        );
      })}
    </>
  );
};

// The void itself: hard black core, silver iris swirling around it, blazing
// rim, thin gold and jade arcs outside the rim each at their own speed.
const Void: React.FC<{ frame: number; cx: number; cy: number; r: number }> = ({ frame, cx, cy, r }) => {
  if (r <= 1) return null;
  const t = frame / FPS;
  const pupil = r * 0.42;
  const ringSpan = r * 2.5;
  return (
    <div style={{ position: 'absolute', left: cx, top: cy }}>
      {/* the light it sits in */}
      <div
        style={{
          position: 'absolute',
          width: r * 5.2,
          height: r * 5.2,
          marginLeft: -r * 2.6,
          marginTop: -r * 2.6,
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(255,252,228,0.34) 0%, rgba(205,246,200,0.16) 26%, rgba(120,200,255,0.08) 46%, rgba(0,0,0,0) 70%)',
          filter: 'blur(18px)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: r * 2,
          height: r * 2,
          marginLeft: -r,
          marginTop: -r,
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(252,253,255,0.97) 44%, rgba(214,220,226,0.9) 66%, rgba(158,168,176,0.82) 86%, rgba(236,232,196,0.72) 97%, rgba(120,130,138,0) 100%)',
        }}
      />
      {/* the shadowed crescent across the lower left of the iris */}
      <div
        style={{
          position: 'absolute',
          width: r * 2,
          height: r * 2,
          marginLeft: -r,
          marginTop: -r,
          borderRadius: '50%',
          background:
            'radial-gradient(circle at 24% 76%, rgba(40,48,56,0.62) 0%, rgba(70,80,90,0.26) 32%, rgba(0,0,0,0) 58%)',
          mixBlendMode: 'multiply',
        }}
      />
      {/* the swirl running round the core */}
      <div
        style={{
          position: 'absolute',
          width: r * 2,
          height: r * 2,
          marginLeft: -r,
          marginTop: -r,
          borderRadius: '50%',
          background: `conic-gradient(from ${t * 14}deg, rgba(255,255,255,0.55), rgba(140,150,158,0.1) 24%, rgba(255,255,255,0.6) 46%, rgba(120,132,140,0.08) 70%, rgba(255,255,255,0.5) 100%)`,
          WebkitMaskImage: `radial-gradient(circle, transparent ${((pupil / r) * 100).toFixed(0)}%, #000 ${(((pupil / r) * 100) + 10).toFixed(0)}%, #000 86%, transparent 100%)`,
          maskImage: `radial-gradient(circle, transparent ${((pupil / r) * 100).toFixed(0)}%, #000 ${(((pupil / r) * 100) + 10).toFixed(0)}%, #000 86%, transparent 100%)`,
          filter: 'blur(5px)',
          opacity: 0.72,
        }}
      />
      {/* fine vortex fibres pulled around the core */}
      <svg
        width={ringSpan}
        height={ringSpan}
        viewBox={`${-ringSpan / 2} ${-ringSpan / 2} ${ringSpan} ${ringSpan}`}
        style={{ position: 'absolute', left: -ringSpan / 2, top: -ringSpan / 2, overflow: 'visible' }}
      >
        {new Array(54).fill(0).map((_, i) => {
          const rr = r * (0.5 + random(`vr${i}`) * 0.44);
          const circ = 2 * Math.PI * rr;
          const arc = circ * (0.05 + random(`vl${i}`) * 0.2);
          return (
            <circle
              key={i}
              cx={0}
              cy={0}
              r={rr}
              fill="none"
              stroke="rgba(255,255,255,0.75)"
              strokeWidth={0.5 + random(`vw${i}`) * 1.6}
              strokeLinecap="round"
              strokeDasharray={`${arc.toFixed(1)} ${(circ - arc).toFixed(1)}`}
              strokeDashoffset={(random(`vo${i}`) * circ - t * circ * 0.012 * (i % 2 ? 1 : -1)).toFixed(1)}
              opacity={0.1 + random(`va${i}`) * 0.3}
            />
          );
        })}
      </svg>
      <div
        style={{
          position: 'absolute',
          width: r * 2,
          height: r * 2,
          marginLeft: -r,
          marginTop: -r,
          borderRadius: '50%',
          border: `${r * 0.1}px solid rgba(255,253,236,0.98)`,
          boxShadow: `0 0 ${r * 0.16}px rgba(255,255,255,1), 0 0 ${r * 0.5}px rgba(246,235,176,0.9), 0 0 ${r * 1.1}px rgba(205,246,200,0.5), inset 0 0 ${r * 0.18}px rgba(246,235,176,0.9)`,
        }}
      />
      {/* gold and jade arcs riding just outside the rim */}
      <svg
        width={ringSpan}
        height={ringSpan}
        viewBox={`${-ringSpan / 2} ${-ringSpan / 2} ${ringSpan} ${ringSpan}`}
        style={{ position: 'absolute', left: -ringSpan / 2, top: -ringSpan / 2, overflow: 'visible' }}
      >
        {new Array(11).fill(0).map((_, i) => {
          const rr = r * (1.0 + i * 0.026 + random(`gr${i}`) * 0.02);
          const circ = 2 * Math.PI * rr;
          const arc = circ * (0.12 + random(`gl${i}`) * 0.4);
          const tone = [GOLD, JADE, GOLD, WHITE, CYAN][i % 5];
          const spin = (i % 2 ? -1 : 1) * (0.02 + random(`gs${i}`) * 0.05);
          return (
            <circle
              key={i}
              cx={0}
              cy={0}
              r={rr}
              fill="none"
              stroke={tone}
              strokeWidth={0.9 + random(`gw${i}`) * 3.4}
              strokeLinecap="round"
              strokeDasharray={`${arc.toFixed(1)} ${(circ - arc).toFixed(1)}`}
              strokeDashoffset={(random(`go${i}`) * circ + t * circ * spin).toFixed(1)}
              opacity={0.5 + random(`ga${i}`) * 0.45}
              style={{ filter: `drop-shadow(0 0 ${3 + i}px ${tone})` }}
            />
          );
        })}
      </svg>
      <div
        style={{
          position: 'absolute',
          width: pupil * 2,
          height: pupil * 2,
          marginLeft: -pupil,
          marginTop: -pupil,
          borderRadius: '50%',
          background: '#000',
        }}
      />
    </div>
  );
};

export const UnlimitedVoid: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const cx = width / 2;
  const cy = height * 0.46;
  const reach = Math.hypot(width, height) * 0.55;

  const open = ramp(frame, 0, 6);
  // accelerate down the tube, punch through the aperture at ~2.4 s, then the
  // void settles back over the next second and a half
  const fly = ramp(frame, 38, 72);
  const tunnel = 1 - ramp(frame, 58, 72);
  const flyScale = 1 + Math.pow(fly, 2.6) * 9;
  const grow = ramp(frame, 64, 84);
  const voidScale = interpolate(ramp(frame, 64, 172), [0, 1], [2.35, 1], { easing: (x) => 1 - Math.pow(1 - x, 3) });
  const band = ramp(frame, 60, 100);
  const out = 1 - ramp(frame, durationInFrames - 30, durationInFrames);
  // two white frames: the domain opening, and the camera going through
  const flash = Math.max(
    interpolate(frame, [0, 2, 10], [1, 0.9, 0], { extrapolateRight: 'clamp' }),
    interpolate(frame, [63, 66, 71], [0, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
  );
  const roll = frame * 0.055;
  // slow push plus a hair of lateral drift, so act two is never a still frame
  const settle = ramp(frame, 64, durationInFrames);
  const drift = Math.sin(settle * Math.PI * 0.8) * height * 0.012;
  const breathe = 1 + Math.sin(frame / FPS * 0.55) * 0.012;

  return (
    <AbsoluteFill style={{ backgroundColor: '#000000', opacity: out }}>
      {/* act two sits behind act one, so the punch-through reveals it */}
      <AbsoluteFill style={{ mixBlendMode: 'screen', opacity: band }}>
        <Nebula frame={frame} width={width} height={height} opacity={1} />
      </AbsoluteFill>
      <AbsoluteFill style={{ mixBlendMode: 'screen', filter: 'blur(26px)', opacity: band * 0.8 }}>
        <Nebula frame={frame} width={width} height={height} opacity={1} />
      </AbsoluteFill>

      {grow > 0 ? (
        <>
          <AbsoluteFill style={{ transform: `scale(${voidScale})`, transformOrigin: `${cx}px ${cy}px` }}>
            <Void frame={frame} cx={cx + drift} cy={cy - drift * 0.4} r={height * 0.3 * grow * breathe} />
          </AbsoluteFill>
          <AbsoluteFill
            style={{
              mixBlendMode: 'screen',
              filter: 'blur(30px)',
              opacity: 0.5,
              transform: `scale(${voidScale})`,
              transformOrigin: `${cx}px ${cy}px`,
            }}
          >
            <Void frame={frame} cx={cx + drift} cy={cy - drift * 0.4} r={height * 0.3 * grow * breathe} />
          </AbsoluteFill>
        </>
      ) : null}

      {/* act one: the tube */}
      {tunnel > 0 ? (
        <AbsoluteFill
          style={{
            transform: `scale(${flyScale}) rotate(${roll}deg)`,
            transformOrigin: `${cx}px ${cy}px`,
            opacity: tunnel,
          }}
        >
          <AbsoluteFill style={{ mixBlendMode: 'screen' }}>
            <Wisps frame={frame} cx={cx} cy={cy} reach={reach} opacity={open} />
          </AbsoluteFill>
          <AbsoluteFill style={{ mixBlendMode: 'screen' }}>
            <Ribs frame={frame} cx={cx} cy={cy} reach={reach} opacity={open} />
          </AbsoluteFill>
          <AbsoluteFill style={{ mixBlendMode: 'screen' }}>
            <Streaks frame={frame} cx={cx} cy={cy} reach={reach} opacity={open} count={300} />
          </AbsoluteFill>
          {/* the same streaks blurred back over themselves: bloom, not haze */}
          <AbsoluteFill style={{ mixBlendMode: 'screen', filter: 'blur(9px)', opacity: 0.6 }}>
            <Streaks frame={frame} cx={cx} cy={cy} reach={reach} opacity={open} count={300} />
          </AbsoluteFill>
          <AbsoluteFill style={{ mixBlendMode: 'screen' }}>
            <Aperture frame={frame} cx={cx} cy={cy} reach={reach} opacity={open * (1 - Math.pow(fly, 2))} />
          </AbsoluteFill>
        </AbsoluteFill>
      ) : null}

      {/* a few motes left drifting in front of the void */}
      <AbsoluteFill style={{ mixBlendMode: 'screen', opacity: band }}>
        {new Array(70).fill(0).map((_, i) => {
          const life = 2 + random(`ml${i}`) * 3;
          const age = (frame / FPS + random(`mb${i}`) * life) % life;
          const k = Math.sin((age / life) * Math.PI);
          const x = random(`mx${i}`) * width + Math.sin(frame / FPS + i) * 12;
          const y = (random(`my${i}`) * height - age * 22 + height * 2) % height;
          const size = 1 + random(`ms${i}`) * 2.2;
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
                background: '#e6f6ff',
                boxShadow: `0 0 ${5 + size * 3}px ${AZURE}`,
                opacity: k * 0.6,
              }}
            />
          );
        })}
      </AbsoluteFill>

      {/* corner falloff, so the frame never fights the person cutout */}
      <AbsoluteFill
        style={{ background: 'radial-gradient(128% 100% at 50% 46%, rgba(0,0,0,0) 42%, rgba(0,0,0,0.82) 100%)' }}
      />

      <AbsoluteFill style={{ backgroundColor: '#ffffff', opacity: flash }} />
    </AbsoluteFill>
  );
};
