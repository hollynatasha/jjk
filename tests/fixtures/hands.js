// Deterministic synthetic captures for unit tests. Every vector here comes
// from the procedural hand in src/handmodel, never from a real person.
import { makeRng } from '../../src/core/rng.js';
import { SIGN_SCENES, NEUTRAL_SCENES, sceneFrame, CAPTURE_VIEWS } from '../../src/handmodel/poses.js';
import { extractFrameFeatures, FEATURE_VERSION } from '../../src/core/features.js';

export { SIGN_SCENES, NEUTRAL_SCENES, CAPTURE_VIEWS };

export function frameFor(scene, seed, opts = {}) {
  return sceneFrame(scene, { rng: makeRng(seed), noiseRng: makeRng(seed * 7919 + 13), ...opts });
}

export function featFor(scene, seed, opts = {}) {
  return extractFrameFeatures(frameFor(scene, seed, opts));
}

/** One capture = one attempt (shared pose jitter) sampled at 3 frames (fresh noise). */
export function makeCapture({ scene, kind = 'positive', domain = null, seed, view = 'center', slot = 0, createdAt = 0, frames = 3, noise = 1 }) {
  const vectors = [];
  let chirality = null;
  let handCount = 0;
  for (let f = 0; f < frames; f++) {
    const frame = sceneFrame(scene, { rng: makeRng(seed), noiseRng: makeRng(seed * 31 + f * 977 + 7), view, noise });
    const feat = extractFrameFeatures(frame);
    handCount = feat.count;
    chirality = feat.chirality || chirality;
    vectors.push(Array.from(feat.variants[0]));
  }
  return {
    id: `${kind}-${domain || 'neutral'}-${seed}`,
    kind,
    domain,
    handCount,
    chirality: handCount === 1 ? chirality : null,
    vectors,
    view,
    slot,
    createdAt,
    featureVersion: FEATURE_VERSION,
    quality: { minScore: 0.95, overlap: 0, hidden: false },
  };
}

export function trainDomain(domain, { scene = SIGN_SCENES[domain].friendly, baseSeed = 1000, createdAt = 1 } = {}) {
  return CAPTURE_VIEWS.map((view, i) => makeCapture({ scene, domain, seed: baseSeed + i * 17, view, slot: i, createdAt: createdAt + i }));
}

export function neutralCaptures(baseSeed = 5000) {
  const out = [];
  let i = 0;
  for (const [name, scene] of Object.entries(NEUTRAL_SCENES)) {
    out.push({ ...makeCapture({ scene, kind: 'negative', seed: baseSeed + i * 29, view: i % 3 === 0 ? 'center' : i % 3 === 1 ? 'left' : 'right', createdAt: 0 }), prompt: name });
    i++;
  }
  return out;
}

export const LABELS = { gojo: 'Gojo', sukuna: 'Sukuna', megumi: 'Megumi' };

/** Mirror a frame horizontally, like a mirrored camera feed reaching the model. */
export function mirrorFrame(frame) {
  return {
    ...frame,
    hands: frame.hands.map((h) => ({
      ...h,
      landmarks: h.landmarks.map((l) => ({ ...l, x: 1 - l.x })),
      world: h.world.map((w) => ({ ...w, x: -w.x })),
      handedness: h.handedness === 'Left' ? 'Right' : 'Left',
    })),
  };
}
