// "Test my signs": five attempts per trained sign in random order, with rest
// phases in between where any cast counts as a false positive. A sign earns
// its green "ready" badge only from this webcam challenge.

import { CastGate } from './gate.js';
import { makeRng } from './rng.js';

export const CHALLENGE_DEFAULTS = {
  trialsPerSign: 5,
  restMs: 1800,
  trialMs: 7000,
  feedbackMs: 1100,
  readyMinSuccess: 4,
  maxFalsePositives: 1,
};

export class SignChallenge {
  constructor({ domains, seed = 1, gateOptions = {}, ...options }) {
    this.opts = { ...CHALLENGE_DEFAULTS, ...options };
    this.domains = domains.slice();
    const rng = makeRng(seed);
    // Random order, but avoid asking for the same sign twice in a row when possible.
    let order = [];
    for (let i = 0; i < this.opts.trialsPerSign; i++) order.push(...this.domains);
    for (let attempt = 0; attempt < 20; attempt++) {
      order = rng.shuffle(order);
      if (this.domains.length < 2 || order.every((d, i) => i === 0 || d !== order[i - 1])) break;
    }
    this.order = order;
    this.gate = new CastGate({ ...gateOptions, cooldownMs: 0 });
    this.records = [];
    this.falsePositives = [];
    this.index = -1;
    this.phase = 'idle';
    this.phaseStart = 0;
  }

  start(now) {
    this.index = 0;
    this.phase = 'rest';
    this.phaseStart = now;
    this.gate.reset();
    return this.snapshot(now);
  }

  get target() {
    return this.order[this.index] ?? null;
  }

  snapshot(now, event = null) {
    const dur = this.phase === 'rest' ? this.opts.restMs : this.phase === 'trial' ? this.opts.trialMs : this.phase === 'feedback' ? this.opts.feedbackMs : 0;
    return {
      phase: this.phase,
      index: this.index,
      total: this.order.length,
      target: this.target,
      remainingMs: Math.max(0, dur - (now - this.phaseStart)),
      holdProgress: this.gate.progress(now),
      holding: this.gate.state === 'holding' ? this.gate.domain : null,
      event,
      done: this.phase === 'done',
    };
  }

  /** accepted: the matcher's accepted domain for this frame, or null. */
  update(now, accepted) {
    if (this.phase === 'idle' || this.phase === 'done') return this.snapshot(now);
    const g = this.gate.update(now, accepted);
    let event = null;
    if (g.event === 'cast') {
      this.gate.castFinished(now);
      if (this.phase === 'rest' || this.phase === 'feedback') {
        event = { type: 'false-positive', domain: g.domain, trial: this.index };
        this.falsePositives.push(event);
      } else if (this.phase === 'trial') {
        const ok = g.domain === this.target;
        event = { type: ok ? 'success' : 'confusion', target: this.target, detected: g.domain, latencyMs: Math.round(now - this.phaseStart), trial: this.index };
        this.records.push(event);
        this.phase = 'feedback';
        this.phaseStart = now;
        return this.snapshot(now, event);
      }
    }
    const elapsed = now - this.phaseStart;
    if (this.phase === 'rest' && elapsed >= this.opts.restMs) {
      this.phase = 'trial';
      this.phaseStart = now;
    } else if (this.phase === 'trial' && elapsed >= this.opts.trialMs) {
      event = { type: 'miss', target: this.target, detected: null, trial: this.index };
      this.records.push(event);
      this.phase = 'feedback';
      this.phaseStart = now;
      // A hold still building when time ran out must not complete during the
      // pause and be counted as a false positive: the sign has to be released first.
      this.gate.unlock(now, { requireRelease: true });
    } else if (this.phase === 'feedback' && elapsed >= this.opts.feedbackMs) {
      this.index += 1;
      if (this.index >= this.order.length) {
        this.phase = 'done';
      } else {
        this.phase = 'rest';
        this.phaseStart = now;
      }
    }
    return this.snapshot(now, event);
  }

  results() {
    const perSign = {};
    for (const d of this.domains) perSign[d] = { attempts: 0, success: 0, misses: 0, confusions: {}, falsePositives: 0, latencies: [] };
    for (const r of this.records) {
      const s = perSign[r.target];
      if (!s) continue;
      s.attempts += 1;
      if (r.type === 'success') {
        s.success += 1;
        s.latencies.push(r.latencyMs);
      } else if (r.type === 'miss') s.misses += 1;
      else s.confusions[r.detected] = (s.confusions[r.detected] || 0) + 1;
    }
    for (const fp of this.falsePositives) if (perSign[fp.domain]) perSign[fp.domain].falsePositives += 1;
    const ready = {};
    const weak = [];
    for (const d of this.domains) {
      const s = perSign[d];
      const confusionCount = Object.values(s.confusions).reduce((a, b) => a + b, 0);
      // Being cast when another sign was asked for also counts against a sign.
      const castByMistake = this.records.filter((r) => r.type === 'confusion' && r.detected === d).length;
      ready[d] = s.success >= this.opts.readyMinSuccess && confusionCount === 0 && castByMistake === 0 && s.falsePositives <= this.opts.maxFalsePositives;
      s.castByMistake = castByMistake;
      if (!ready[d]) weak.push(d);
    }
    return { perSign, falsePositives: this.falsePositives.slice(), records: this.records.slice(), ready, weak, complete: this.phase === 'done' };
  }
}
