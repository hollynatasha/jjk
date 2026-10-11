// Teach-mode capture logic. A capture is taken only after the required hands
// are tracked with high confidence and hold still for ~0.4 s. Between captures
// the hands must drop (or move well away) so twelve captures are twelve
// separate attempts, not twelve frames of one frozen hold.

import { featureDistance } from './features.js';

export const CAPTURE_DEFAULTS = {
  stableMs: 400,
  minScore: 0.75,
  hiddenScore: 0.85,
  maxWristMotion: 0.03,
  maxDrift: 0.075,
  rearmMs: 300,
  rearmMove: 0.15,
  minGapMs: 900,
  samples: 3,
  duplicateDist: 0.25,
  minFrames: 4,
};

function wristMotion(a, b, W) {
  let m = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) m = Math.max(m, Math.hypot(a[i][0] - b[i][0], a[i][1] - b[i][1]) / W);
  return m;
}

export class StableCapture {
  constructor(requiredHands, options = {}) {
    this.required = requiredHands;
    this.opts = { ...CAPTURE_DEFAULTS, ...options };
    this.reset();
  }

  reset() {
    this.run = [];
    this.waitingRelease = false;
    this.releaseSince = null;
    this.lastCaptureAt = -Infinity;
    this.lastCaptureWrists = null;
  }

  /**
   * Carries "drop your hands first" over from the previous prompt's capture.
   * Without it, a pose still held when the prompt changes (fist -> peace, or the
   * last neutral pose -> the first sign capture) would be stored under the new prompt.
   */
  inheritRelease(prev) {
    if (prev && prev.waitingRelease) {
      this.waitingRelease = true;
      this.releaseSince = null;
      this.lastCaptureAt = prev.lastCaptureAt;
      this.lastCaptureWrists = prev.lastCaptureWrists;
    }
    return this;
  }

  /** Feed one frame of features. Returns status for the UI, plus `capture` when one is taken. */
  update(now, feat) {
    const o = this.opts;
    const count = feat ? feat.count : 0;
    const info = (feat && feat.info) || {};
    const W = info.W || 640;

    if (this.waitingRelease) {
      const moved = count === this.required && this.lastCaptureWrists && info.wrists && wristMotion(info.wrists, this.lastCaptureWrists, W) > o.rearmMove;
      if (count < this.required || moved) {
        if (this.releaseSince === null) this.releaseSince = now;
        if ((moved || now - this.releaseSince >= o.rearmMs) && now - this.lastCaptureAt >= o.minGapMs) {
          this.waitingRelease = false;
          this.releaseSince = null;
        }
      } else {
        this.releaseSince = null;
      }
      if (this.waitingRelease) return { status: 'need-release', progress: 0, tip: 'Got it. Drop your hands, then sign again.' };
    }

    const fail = (status, tip) => {
      this.run = [];
      return { status, progress: 0, tip };
    };
    if (count === 0) return fail('need-hands', this.required === 2 ? 'Raise both hands into the frame.' : 'Raise your hand into the frame.');
    if (count < this.required) return fail('need-hands', 'Show your second wrist.');
    if (count > this.required) return fail('too-many', 'This sign uses one hand. Lower the other one.');
    if ((info.minScore ?? 1) < o.minScore) return fail('low-score', 'Hold still so the tracker locks on.');
    if (this.required === 2 && (info.dupDist ?? 1) < o.duplicateDist) return fail('merged', 'Your hands merge into one shape. Open a small gap between the wrists.');

    const v = feat.variants[0];
    const prev = this.run[this.run.length - 1];
    if (prev) {
      let drift = Infinity;
      for (const cand of feat.variants) drift = Math.min(drift, featureDistance(cand, prev.vec, count));
      const motion = wristMotion(info.wrists || [], this.run[0].wrists || [], W);
      if (drift > o.maxDrift || motion > o.maxWristMotion) this.run = [];
    }
    this.run.push({ t: now, vec: v, wrists: info.wrists || [], score: info.minScore ?? 1, overlap: info.overlap || 0, sameLabel: !!info.sameLabel, chirality: feat.chirality || null, palmFrac: info.palmFrac || 0 });
    const elapsed = now - this.run[0].t;
    if (elapsed < o.stableMs || this.run.length < o.minFrames) {
      return { status: 'steadying', progress: Math.min(0.99, elapsed / o.stableMs), tip: 'Hold it…' };
    }

    // Capture: first, middle and last frames of the stable window.
    const r = this.run;
    const picks = o.samples >= 3 ? [r[0], r[Math.floor(r.length / 2)], r[r.length - 1]] : [r[r.length - 1]];
    const minScore = Math.min(...r.map((x) => x.score));
    const maxOverlap = Math.max(...r.map((x) => x.overlap));
    // Two hands given the same handedness usually means the tracker lost
    // track of which is which: a sign of occluded or interlocked hands.
    const confusedLabels = count === 2 && r.filter((x) => x.sameLabel).length > r.length / 2;
    const chir = count === 1 ? majority(r.map((x) => x.chirality)) : null;
    const capture = {
      handCount: count,
      chirality: chir,
      vectors: picks.map((x) => Array.from(x.vec)),
      quality: {
        minScore: round(minScore),
        overlap: round(maxOverlap),
        palmFrac: round(r[r.length - 1].palmFrac),
        hidden: minScore < o.hiddenScore || confusedLabels,
      },
    };
    this.lastCaptureAt = now;
    this.lastCaptureWrists = r[r.length - 1].wrists;
    this.waitingRelease = true;
    this.releaseSince = null;
    this.run = [];
    return { status: 'captured', progress: 1, tip: 'Captured.', capture };
  }
}

const round = (x) => Math.round(x * 1000) / 1000;

function majority(values) {
  const m = new Map();
  for (const v of values) if (v) m.set(v, (m.get(v) || 0) + 1);
  let best = null;
  let n = 0;
  for (const [v, c] of m) if (c > n) [best, n] = [v, c];
  return best;
}
