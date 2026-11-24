import { describe, it, expect } from 'vitest';
import { StableCapture } from '../src/core/capture.js';
import { extractFrameFeatures } from '../src/core/features.js';
import { makeRng } from '../src/core/rng.js';
import { sceneFrame } from '../src/handmodel/poses.js';
import { SIGN_SCENES, NEUTRAL_SCENES } from './fixtures/hands.js';

// Frames of one steady hold: same pose, fresh landmark noise each frame.
const steady = (scene, seed, f, opts = {}) => extractFrameFeatures(sceneFrame(scene, { rng: makeRng(seed), noiseRng: makeRng(seed * 101 + f), landmarkNoise: 0.0012, worldNoise: 0.0006, ...opts }));
const empty = { count: 0, variants: [], info: {} };

function run(cap, startT, ms, featFn) {
  const out = [];
  for (let t = startT, f = 0; t < startT + ms; t += 55, f++) out.push({ t, ...cap.update(t, featFn(f)) });
  return out;
}

describe('stable capture', () => {
  it('captures after ~0.4 s of a steady two-hand sign, with three vectors', () => {
    const cap = new StableCapture(2);
    const res = run(cap, 0, 1000, (f) => steady(SIGN_SCENES.sukuna.friendly, 10, f));
    const shot = res.find((r) => r.status === 'captured');
    expect(shot).toBeTruthy();
    expect(shot.t).toBeGreaterThanOrEqual(400);
    expect(shot.capture.vectors).toHaveLength(3);
    expect(shot.capture.handCount).toBe(2);
    expect(shot.capture.quality.hidden).toBe(false);
  });

  it('asks for the missing hand instead of capturing', () => {
    const cap = new StableCapture(2);
    const res = run(cap, 0, 1200, () => steady(NEUTRAL_SCENES.openR, 11, 0));
    expect(res.every((r) => r.status === 'need-hands')).toBe(true);
    expect(res[0].tip).toBe('Show your second wrist.');
  });

  it('asks to drop the extra hand for a one-hand sign', () => {
    const cap = new StableCapture(1);
    const r = cap.update(0, steady(NEUTRAL_SCENES.openBoth, 12, 0));
    expect(r.status).toBe('too-many');
  });

  it('takes independent captures: holding still does not produce a second one', () => {
    const cap = new StableCapture(1);
    const held = run(cap, 0, 3000, (f) => steady(SIGN_SCENES.gojo.friendly, 13, f));
    expect(held.filter((r) => r.status === 'captured')).toHaveLength(1);
    expect(held[held.length - 1].status).toBe('need-release');
    // drop the hand, then sign again
    run(cap, 3000, 400, () => empty);
    const again = run(cap, 3400, 1000, (f) => steady(SIGN_SCENES.gojo.friendly, 14, f));
    expect(again.filter((r) => r.status === 'captured')).toHaveLength(1);
  });

  it('refuses a merged detection (the same hand returned twice)', () => {
    const cap = new StableCapture(2);
    const merged = (f) => {
      const frame = sceneFrame(SIGN_SCENES.gojo.friendly, { rng: makeRng(15), noiseRng: makeRng(15 + f) });
      const h = frame.hands[0];
      const twin = { ...h, handedness: 'Right', landmarks: h.landmarks.map((l) => ({ ...l, x: l.x + 0.002 })) };
      return extractFrameFeatures({ ...frame, hands: [h, twin] });
    };
    const res = run(cap, 0, 1000, merged);
    expect(res.some((r) => r.status === 'captured')).toBe(false);
    expect(res[0].status).toBe('merged');
  });

  it('flags captures where both hands got the same handedness label', () => {
    const cap = new StableCapture(2);
    const confused = (f) => {
      const frame = sceneFrame(SIGN_SCENES.megumi.friendly, { rng: makeRng(17), noiseRng: makeRng(17 * 101 + f), landmarkNoise: 0.0012, worldNoise: 0.0006 });
      return extractFrameFeatures({ ...frame, hands: frame.hands.map((h) => ({ ...h, handedness: 'Left' })) });
    };
    const shot = run(cap, 0, 1000, confused).find((r) => r.status === 'captured');
    expect(shot).toBeTruthy();
    expect(shot.capture.quality.hidden).toBe(true);
  });

  it('does not store a pose held across a prompt change under the next prompt', () => {
    // neutral "fists" captured, then the prompt moves to a two-hand sign while
    // the fists are still up
    const first = new StableCapture(2);
    const fists = (f) => steady(NEUTRAL_SCENES.fistBoth, 18, f);
    expect(run(first, 0, 1000, fists).some((r) => r.status === 'captured')).toBe(true);
    const next = new StableCapture(2).inheritRelease(first);
    const held = run(next, 1000, 2000, fists);
    expect(held.some((r) => r.status === 'captured')).toBe(false);
    expect(held[held.length - 1].status).toBe('need-release');
    // hands down, then the real sign
    run(next, 3000, 400, () => empty);
    const sign = run(next, 3400, 1000, (f) => steady(SIGN_SCENES.sukuna.friendly, 19, f));
    expect(sign.filter((r) => r.status === 'captured')).toHaveLength(1);
    // without the hand-off, the held pose would have been captured at once
    const naive = new StableCapture(2);
    expect(run(naive, 1000, 1000, fists).some((r) => r.status === 'captured')).toBe(true);
  });

  it('waits while the pose keeps changing', () => {
    const cap = new StableCapture(1);
    const poses = [SIGN_SCENES.gojo.friendly, NEUTRAL_SCENES.fistR, NEUTRAL_SCENES.openR, NEUTRAL_SCENES.pointR];
    const res = run(cap, 0, 1500, (f) => steady(poses[f % poses.length], 16, f));
    expect(res.some((r) => r.status === 'captured')).toBe(false);
  });
});
