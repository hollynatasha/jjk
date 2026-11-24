// One tip at a time, from whatever the tracker can see. The 30-80 cm and
// "normal indoor light" numbers in the UI are guidance, not guarantees, so the
// tips go off visible palm size and measured frame brightness instead.

const NAMES = { gojo: 'Gojo', sukuna: 'Sukuna', megumi: 'Megumi', neutral: 'a neutral pose' };

export function brightnessTip(brightness) {
  if (brightness == null) return null;
  if (brightness < 0.17) return 'Raise the light: the room is too dark for steady fingertips.';
  if (brightness > 0.9) return 'Too bright or backlit: face away from the window.';
  return null;
}

export function distanceTip(palmFrac) {
  if (!palmFrac) return null;
  if (palmFrac > 0.2) return 'Move back a little: your hand fills too much of the frame.';
  if (palmFrac < 0.045) return 'Come closer: your hands are too small for the tracker.';
  return null;
}

/**
 * feat: extractFrameFeatures output; cls: matcher.classify output;
 * expected: hand count of the sign being taught/tested (or null in Live).
 */
export function tipFor({ feat, cls = null, expected = null, brightness = null }) {
  const count = feat ? feat.count : 0;
  const info = (feat && feat.info) || {};
  const light = brightnessTip(brightness);
  if (count === 0) return light || (expected === 2 ? 'Raise both hands into the frame.' : 'Raise your hand into the frame.');
  if (expected === 2 && count === 1) return 'Show your second wrist.';
  if (expected === 1 && count === 2) return 'This sign uses one hand. Lower the other one.';
  const dist = distanceTip(info.palmFrac);
  if (dist) return dist;
  if (light) return light;
  if ((info.minScore ?? 1) < 0.8) return 'Hold steady and keep every fingertip in view.';
  if (count === 2 && info.dupDist !== undefined && info.dupDist < 0.35) return 'Separate your wrists a little: the tracker sees one shape.';
  const W = info.W || 640;
  const H = info.H || 480;
  if (info.wrists && info.wrists.some((w) => w[0] < W * 0.2 || w[0] > W * 0.8 || w[1] > H * 0.97)) return 'Center your hands in the frame.';
  if (cls) {
    if (cls.reason === 'count' && cls.expectedCounts) {
      return cls.expectedCounts.includes(2) && count === 1 ? 'Your taught signs use two hands. Show your second wrist.' : 'Your taught signs use one hand. Lower the other one.';
    }
    if (cls.reason === 'ambiguous' && cls.best) {
      const other = NAMES[cls.runnerUp] || 'another pose';
      return `Looks like ${NAMES[cls.best]} but also like ${other}. ${count === 2 ? 'Separate your wrists or exaggerate the sign.' : 'Exaggerate the finger shape.'}`;
    }
    if (cls.reason === 'handedness' && cls.best) return `${NAMES[cls.best]} was taught with your other hand. Switch hands or flip the card and retrain.`;
    if (cls.reason === 'far' && cls.best && cls.confidence > 0.2) return `Closest is ${NAMES[cls.best]}. Match the card more exactly.`;
  }
  return null;
}
