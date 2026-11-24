// One short soundscape per domain, synthesised with Web Audio: no samples, no
// imported audio, no microphone. The AudioContext needs a user gesture, and if
// it never starts the visuals run anyway.

import { makeRng } from '../core/rng.js';

const MASTER = 0.3;

export class AudioDesk {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.recDest = null;
    this.muted = false;
    this.available = false;
    this.noiseBuf = null;
    this.voices = new Set();
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return this.available;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : MASTER;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -20;
      comp.ratio.value = 4;
      comp.attack.value = 0.005;
      comp.release.value = 0.2;
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
      if (this.ctx.createMediaStreamDestination) {
        this.recDest = this.ctx.createMediaStreamDestination();
        comp.connect(this.recDest);
      }
      const len = this.ctx.sampleRate * 2;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      const r = makeRng(1234);
      for (let i = 0; i < len; i++) d[i] = r.next() * 2 - 1;
      this.available = true;
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    } catch {
      this.available = false;
    }
    return this.available;
  }

  setMuted(m) {
    this.muted = !!m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : MASTER, this.ctx.currentTime, 0.02);
  }

  audioTrack() {
    return this.recDest ? this.recDest.stream.getAudioTracks()[0] || null : null;
  }

  stopAll() {
    for (const v of this.voices) {
      try {
        v.stop();
      } catch {
        /* already stopped */
      }
    }
    this.voices.clear();
  }

  /** Schedules the domain's soundscape. `state` is the cast's seeded state, for cue times. */
  play(domainId, state, { reduced = false } = {}) {
    if (!this.available || !this.ctx) return false;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    this.stopAll();
    const t0 = this.ctx.currentTime + 0.03;
    const fn = SOUNDS[domainId];
    if (!fn) return false;
    try {
      fn(this, t0, state || {}, { reduced });
      return true;
    } catch {
      return false;
    }
  }

  // ---------- primitives ----------

  env(g, t0, attack, peak, hold, release) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + Math.max(0.002, attack));
    g.gain.setValueAtTime(Math.max(0.0002, peak), t0 + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + Math.max(0.01, release));
  }

  tone({ type = 'sine', f0, f1 = null, t0, dur = 0.5, glide = null, gain = 0.1, attack = 0.01, release = 0.3, detune = 0, filter = null }) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t0 + (glide ?? dur));
    o.detune.value = detune;
    const g = c.createGain();
    this.env(g, t0, attack, gain, Math.max(0, dur - attack), release);
    let node = o;
    if (filter) {
      const bq = c.createBiquadFilter();
      bq.type = filter.type || 'lowpass';
      bq.frequency.value = filter.f || 800;
      bq.Q.value = filter.q || 0.7;
      o.connect(bq);
      node = bq;
    }
    node.connect(g);
    g.connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + release + 0.05);
    this.track(o);
    return { o, g };
  }

  noise({ t0, dur = 0.3, gain = 0.1, attack = 0.01, release = 0.2, type = 'bandpass', f0 = 1000, f1 = null, q = 1 }) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const bq = c.createBiquadFilter();
    bq.type = type;
    bq.frequency.setValueAtTime(f0, t0);
    if (f1) bq.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    bq.Q.value = q;
    const g = c.createGain();
    this.env(g, t0, attack, gain, Math.max(0, dur - attack), release);
    src.connect(bq);
    bq.connect(g);
    g.connect(this.master);
    src.start(t0, Math.random() * 1.5);
    src.stop(t0 + dur + release + 0.05);
    this.track(src);
    return { src, g };
  }

  track(node) {
    this.voices.add(node);
    node.onended = () => this.voices.delete(node);
  }
}

/**
 * Held chord plus a slow repeating figure under the effects, so a cast is not
 * only hits. Runs most of the 7.5 s cast and fades out under the dissolve.
 */
function bed(d, t0, { chord, type = 'sine', gain = 0.03, filter = null, motif = [], motifType = 'sine', motifGain = 0.022, every = 1.1, from = 0.6, dur = 6.4 }) {
  chord.forEach((f, i) => {
    d.tone({ type, f0: f, t0: t0 + 0.08 + i * 0.1, dur, gain: gain * (i ? 1 : 1.25), attack: 1.2, release: 1.4, detune: (i - 1) * 4, filter });
  });
  for (let k = 0; motif.length && from + k * every < dur - 0.8; k++) {
    d.tone({ type: motifType, f0: motif[k % motif.length], t0: t0 + from + k * every, dur: 0.45, gain: motifGain, attack: 0.07, release: 1.6 });
  }
}

// ---------- the soundscapes, one per domain ----------

const SOUNDS = {
  // airy rising overtone, then a crystalline hit as the ring opens
  gojo(d, t0) {
    // open fifths and a high figure drifting over them
    bed(d, t0, { chord: [110, 164.81, 220], gain: 0.026, motif: [880, 1108.73, 1318.51, 1760], motifGain: 0.018, every: 0.95 });
    d.noise({ t0, dur: 1.3, gain: 0.18, attack: 0.5, release: 0.6, type: 'bandpass', f0: 900, f1: 5200, q: 0.8 });
    for (const [f, g] of [[330, 0.05], [495, 0.04], [660, 0.035], [990, 0.025]]) {
      d.tone({ type: 'sine', f0: f, f1: f * 2, glide: 1.2, t0, dur: 1.2, gain: g, attack: 0.4, release: 0.7 });
    }
    const hit = t0 + 0.45;
    for (const [f, g] of [[1567.98, 0.09], [2349.32, 0.06], [3135.96, 0.045], [4698.64, 0.03]]) {
      d.tone({ type: 'sine', f0: f, t0: hit, dur: 0.02, gain: g, attack: 0.003, release: 2.6, detune: (Math.random() - 0.5) * 6 });
    }
    d.tone({ type: 'sine', f0: 880, t0: t0 + 1.3, dur: 4.2, gain: 0.018, attack: 1.2, release: 1.2 });
    d.tone({ type: 'sine', f0: 1320, t0: t0 + 1.6, dur: 3.8, gain: 0.012, attack: 1.4, release: 1.2 });
  },

  // Ink-brush swoosh per slash, low pulse under all of it.
  sukuna(d, t0, state) {
    // low, flat and ominous under the slashes
    bed(d, t0, { chord: [55, 82.41, 110], type: 'sawtooth', gain: 0.022, filter: { type: 'lowpass', f: 210, q: 1.2 }, motif: [146.83, 174.61, 130.81], motifType: 'triangle', motifGain: 0.026, every: 1.45 });
    const r = makeRng(77);
    for (let i = 0; i < 10; i++) d.noise({ t0: t0 + r.range(0, 0.35), dur: 0.015, gain: 0.05, attack: 0.002, release: 0.03, type: 'highpass', f0: 2500, q: 0.5 });
    d.noise({ t0: t0 + 0.25, dur: 1.1, gain: 0.12, attack: 0.2, release: 0.6, type: 'lowpass', f0: 220, q: 0.7 });
    for (let k = 0; k < 6; k++) {
      const tb = t0 + 0.3 + k * 0.9;
      for (const off of [0, 0.22]) {
        d.tone({ type: 'sine', f0: 52, f1: 44, glide: 0.25, t0: tb + off, dur: 0.05, gain: off ? 0.16 : 0.24, attack: 0.015, release: 0.32 });
      }
    }
    for (const sl of state.slashes || []) {
      d.noise({ t0: t0 + sl.t0, dur: 0.24, gain: 0.16, attack: 0.012, release: 0.16, type: 'bandpass', f0: 3200, f1: 480, q: 1.4 });
    }
  },

  // drips, a low string texture, and a swell for the wave
  megumi(d, t0, state, { reduced }) {
    // minor figure riding over the string texture below
    bed(d, t0, { chord: [392, 466.16], gain: 0.009, motif: [196, 233.08, 293.66, 233.08], motifType: 'triangle', motifGain: 0.024, every: 1.6 });
    for (const dr of (state.drips || []).slice(0, 12)) {
      d.tone({ type: 'sine', f0: 1100, f1: 330, glide: 0.07, t0: t0 + dr.t0 + 0.12, dur: 0.02, gain: 0.07, attack: 0.003, release: 0.12 });
    }
    d.noise({ t0: t0 + 0.25, dur: 5.6, gain: 0.03, attack: 0.8, release: 1.0, type: 'lowpass', f0: 600, q: 0.6 });
    for (const [f, det] of [[55, -4], [82.41, 3], [110, 5]]) {
      d.tone({ type: 'sawtooth', f0: f, t0: t0 + 0.4, dur: 5.6, gain: 0.03, attack: 1.4, release: 1.2, detune: det, filter: { type: 'lowpass', f: 380, q: 2 } });
    }
    for (const an of state.animals || []) {
      d.tone({ type: 'sine', f0: 92, f1: 58, glide: 0.4, t0: t0 + an.t0, dur: 0.3, gain: 0.08, attack: 0.05, release: 0.3 });
    }
    const wt = t0 + (reduced ? 4.2 : 4.4);
    d.noise({ t0: wt, dur: 1.0, gain: 0.14, attack: 0.5, release: 0.6, type: 'lowpass', f0: 300, f1: 1200, q: 0.8 });
  },

};

export const SOUND_IDS = Object.keys(SOUNDS);
