// Turns a stream of per-frame matcher decisions into casts.
// A sign must be accepted for ~0.7 s (with at most 150 ms of dropout and at
// least a handful of positive frames) before it fires. After a cast the gate
// cools down and re-arms only once the sign has been released (no accepted
// sign for 350 ms) at some point since the cast began, so one held pose can
// never fire twice and one noisy frame never fires. Dropping the hands during
// the animation counts as that release.

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

  /** A cast (live, replay or simulated) has started: lock, and start watching for a release. */
  beginCast() {
    this.locked = true;
    this.state = 'casting';
    this.domain = null;
    this.released = false;
    this.releaseSince = null;
  }

  /** Watches for a release while a cast runs or the gate cools down. */
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
        // The tracker stalled; a hold only counts if it was observed throughout.
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
