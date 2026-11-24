import { describe, it, expect } from 'vitest';
import { extractFrameFeatures, featureDistance, HAND_DIM, PAIR_DIM } from '../src/core/features.js';
import { frameFor, featFor, mirrorFrame, SIGN_SCENES, NEUTRAL_SCENES } from './fixtures/hands.js';

const d1 = (a, b) => featureDistance(a.variants[0], b.variants[0], a.count);

describe('feature extraction', () => {
  it('produces the documented dimensions', () => {
    const one = featFor(SIGN_SCENES.gojo.friendly, 1);
    const two = featFor(SIGN_SCENES.sukuna.friendly, 2);
    expect(one.count).toBe(1);
    expect(one.variants).toHaveLength(1);
    expect(one.variants[0]).toHaveLength(HAND_DIM);
    expect(two.count).toBe(2);
    expect(two.variants).toHaveLength(2);
    expect(two.variants[0]).toHaveLength(HAND_DIM * 2 + PAIR_DIM);
    for (const v of [...one.variants, ...two.variants]) expect([...v].every(Number.isFinite)).toBe(true);
  });

  it('returns nothing for an empty frame', () => {
    const f = extractFrameFeatures({ width: 640, height: 480, hands: [] });
    expect(f.count).toBe(0);
    expect(f.variants).toHaveLength(0);
  });

  it('is scale invariant (near vs far captures)', () => {
    const base = featFor(SIGN_SCENES.sukuna.friendly, 0, { rng: null, noiseRng: null });
    const near = extractFrameFeatures(frameFor(SIGN_SCENES.sukuna.friendly, 0, { rng: null, noiseRng: null, scale: 1, view: 'near' }));
    const far = extractFrameFeatures(frameFor(SIGN_SCENES.sukuna.friendly, 0, { rng: null, noiseRng: null, view: 'far' }));
    expect(d1(base, near)).toBeLessThan(0.03);
    expect(d1(base, far)).toBeLessThan(0.03);
  });

  it('tolerates a small in-plane rotation', () => {
    const base = extractFrameFeatures(frameFor(SIGN_SCENES.gojo.friendly, 0, { rng: null, noiseRng: null }));
    const rolled = extractFrameFeatures(frameFor(SIGN_SCENES.gojo.friendly, 0, { rng: null, noiseRng: null, roll: 10 }));
    expect(d1(base, rolled)).toBeLessThan(0.06);
  });

  it('canonicalises reflection: a mirrored hand has the same shape vector but the other chirality', () => {
    const frame = frameFor(SIGN_SCENES.gojo.friendly, 3, { rng: null, noiseRng: null });
    const a = extractFrameFeatures(frame);
    const b = extractFrameFeatures(mirrorFrame(frame));
    expect(d1(a, b)).toBeLessThan(1e-5);
    expect(a.chirality).toBe('R');
    expect(b.chirality).toBe('L');
  });

  it('does not depend on the tracker output order of two hands', () => {
    const frame = frameFor(SIGN_SCENES.megumi.friendly, 5, { rng: null, noiseRng: null });
    const swapped = { ...frame, hands: frame.hands.slice().reverse() };
    const a = extractFrameFeatures(frame);
    const b = extractFrameFeatures(swapped);
    expect(featureDistance(a.variants[0], b.variants[0], 2)).toBeLessThan(1e-6);
    expect(featureDistance(a.variants[1], b.variants[1], 2)).toBeLessThan(1e-6);
  });

  it('reports overlap and wrist gap for two hands', () => {
    const tight = featFor(NEUTRAL_SCENES.prayerBoth, 4);
    const apart = featFor(NEUTRAL_SCENES.openBoth, 4);
    expect(tight.info.wristGap).toBeLessThan(apart.info.wristGap);
    expect(apart.info.overlap).toBe(0);
  });
});
