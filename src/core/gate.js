// Per-frame matcher decisions in, casts out.
// A sign has to stay accepted for ~0.7s (150ms of dropout tolerated, plus a
// handful of positive frames) before it fires. Then the gate cools down and
// won't re-arm until the sign is released: 350ms with nothing accepted, so one
// long hold can't fire twice. Dropping your hands mid-cast counts as release.

export const GATE_DEFAULTS = {
  holdMs: 700,
  maxDropoutMs: 150,
  minFrames: 6,
  cooldownMs: 1500,
  releaseMs: 350,
};

export class CastGate {
  constructor(options = {}) {
    this.opts = { ...GATE_DEFAULTS, ...options };
    this.reset();
  }

  reset() {
    this.state = 'armed';
    this.domain = null;
    this.start = 0;
    this.lastSeen = 0;
    this.frames = 0;
    this.until = 0;
    this.releaseSince = null;
    this.released = false;
    this.locked = false;
  }

  /** Locks the gate (cast in progress, teach mode, record countdown...). */
  lock() {
    this.locked = true;
    if (this.state === 'holding') this.state = 'armed';
    this.domain = null;
  }

  unlock(now, { requireRelease = true } = {}) {
    this.locked = false;
    this.state = requireRelease ? 'release' : 'armed';
    this.releaseSince = null;
    this.released = false;
    this.until = now;
  }

  /** Cast started (live, replay or sim): lock, then watch for the release. */
  beginCast() {
    this.locked = true;
    this.state = 'casting';
    this.domain = null;
    this.released = false;
    this.releaseSince = null;
  }

  /** Release watcher, used while a cast runs or the gate cools down. */
  observe(now, domain) {
    if (this.released) return true;
    if (domain) {
      this.releaseSince = null;
      return false;
    }
    if (this.releaseSince === null) this.releaseSince = now;
    if (now - this.releaseSince >= this.opts.releaseMs) this.released = true;
    return this.released;
  }

  progress(now) {
    if (this.state !== 'holding') return 0;
    return Math.max(0, Math.min(1, (now - this.start) / this.opts.holdMs));
  }

  /**
   * domain: the accepted domain for this frame, or null.
   * Returns { state, domain, progress, event } where event is one of
   * null | 'hold' | 'switch' | 'cancel' | 'cast' | 'rearmed'.
   */
  update(now, domain) {
    const o = this.opts;
    let event = null;
    if (this.locked || this.state === 'casting') {
      return { state: this.locked ? 'locked' : this.state, domain: this.domain, progress: 0, event };
    }
    if (this.state === 'cooldown') {
      this.observe(now, domain);
      if (now < this.until) return { state: 'cooldown', domain: null, progress: 0, event };
      this.state = 'release';
    }
    if (this.state === 'release') {
      if (!this.observe(now, domain)) return { state: 'release', domain: null, progress: 0, event };
      this.state = 'armed';
      event = 'rearmed';
    }
    if (this.state === 'armed') {
      if (domain) {
        this.state = 'holding';
        this.domain = domain;
        this.start = now;
        this.lastSeen = now;
        this.frames = 1;
        event = 'hold';
      }
      return { state: this.state, domain: this.domain, progress: this.progress(now), event };
    }
    // holding
    if (domain && domain === this.domain) {
      if (now - this.lastSeen > o.maxDropoutMs) {
        // tracker stalled: a hold only counts if it was seen the whole way through
        this.start = now;
        this.frames = 0;
      }
      this.lastSeen = now;
      this.frames += 1;
      if (now - this.start >= o.holdMs && this.frames >= o.minFrames) {
        this.state = 'casting';
        this.released = false;
        this.releaseSince = null;
        return { state: 'casting', domain: this.domain, progress: 1, event: 'cast' };
      }
      return { state: 'holding', domain: this.domain, progress: this.progress(now), event };
    }
    if (domain && domain !== this.domain) {
      this.domain = domain;
      this.start = now;
      this.lastSeen = now;
      this.frames = 1;
      return { state: 'holding', domain, progress: 0, event: 'switch' };
    }
    // no accepted domain this frame: tolerate a short dropout
    if (now - this.lastSeen > o.maxDropoutMs) {
      this.state = 'armed';
      const d = this.domain;
      this.domain = null;
      return { state: 'armed', domain: null, progress: 0, event: 'cancel', cancelled: d };
    }
    return { state: 'holding', domain: this.domain, progress: this.progress(now), event };
  }

  /** Call when the cast animation has finished. A release seen during the cast still counts. */
  castFinished(now) {
    this.locked = false;
    this.state = 'cooldown';
    this.until = now + this.opts.cooldownMs;
    this.domain = null;
  }
}

/**
 * Whether the person cutout is worth computing right now. Segmentation is the
 * second most expensive thing in the frame and it fights hand tracking for the
 * same budget, so it only runs while a sign is held or a domain is open.
 */
export function shouldSegment({ casting = false, gate = null, mode = 'live', challenge = null } = {}) {
  if (casting) return true;
  if (gate && gate.state === 'holding' && gate.domain) return true;
  if (mode === 'test' && challenge && challenge.holding) return true;
  return false;
}
