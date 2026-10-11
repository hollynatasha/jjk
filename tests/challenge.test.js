import { describe, it, expect } from 'vitest';
import { SignChallenge } from '../src/core/challenge.js';

const SIGNS = ['gojo', 'sukuna', 'megumi', 'higuruma'];

/** Plays a scripted user: `respond(target)` returns what the matcher accepts during a trial. */
function play(ch, respond, { restResponse = () => null } = {}) {
  let t = 0;
  let snap = ch.start(t);
  let guard = 0;
  while (!snap.done && guard++ < 100000) {
    t += 55;
    let accepted = null;
    if (snap.phase === 'trial') accepted = respond(snap.target, snap);
    else if (snap.phase === 'rest') accepted = restResponse(snap);
    snap = ch.update(t, accepted);
  }
  return ch.results();
}

describe('Test my signs challenge', () => {
  it('asks five times per sign in a seeded random order', () => {
    const ch = new SignChallenge({ domains: SIGNS, seed: 42 });
    expect(ch.order).toHaveLength(20);
    for (const d of SIGNS) expect(ch.order.filter((x) => x === d)).toHaveLength(5);
    expect(ch.order.every((d, i) => i === 0 || d !== ch.order[i - 1])).toBe(true);
    const again = new SignChallenge({ domains: SIGNS, seed: 42 });
    expect(again.order).toEqual(ch.order);
    expect(new SignChallenge({ domains: SIGNS, seed: 7 }).order).not.toEqual(ch.order);
  });

  it('awards ready badges to a clean run', () => {
    const res = play(new SignChallenge({ domains: SIGNS, seed: 1 }), (target) => target);
    expect(res.complete).toBe(true);
    for (const d of SIGNS) {
      expect(res.perSign[d].success).toBe(5);
      expect(res.ready[d]).toBe(true);
    }
    expect(res.weak).toEqual([]);
  });

  it('records confusions and withholds ready from both signs involved', () => {
    const res = play(new SignChallenge({ domains: SIGNS, seed: 2 }), (target) => (target === 'megumi' ? 'sukuna' : target));
    expect(res.perSign.megumi.success).toBe(0);
    expect(res.perSign.megumi.confusions.sukuna).toBe(5);
    expect(res.ready.megumi).toBe(false);
    expect(res.ready.sukuna).toBe(false);
    expect(res.perSign.sukuna.castByMistake).toBe(5);
    expect(res.ready.gojo).toBe(true);
    expect(res.weak.sort()).toEqual(['megumi', 'sukuna']);
  });

  it('does not turn a hold that runs past the end of a trial into a false positive', () => {
    const ch = new SignChallenge({ domains: ['gojo'], seed: 5 });
    let t = 0;
    let snap = ch.start(t);
    let guard = 0;
    while (!snap.done && guard++ < 100000) {
      t += 55;
      let accepted = null;
      // starts the sign 0.4 s before time runs out and keeps holding into the pause
      if (snap.phase === 'trial' && snap.remainingMs < 400) accepted = 'gojo';
      if (snap.phase === 'feedback' && snap.remainingMs > 500) accepted = 'gojo';
      snap = ch.update(t, accepted);
    }
    const res = ch.results();
    expect(res.perSign.gojo.misses).toBe(5);
    expect(res.falsePositives).toHaveLength(0);
    expect(res.perSign.gojo.falsePositives).toBe(0);
  });

  it('counts misses when nothing fires', () => {
    const res = play(new SignChallenge({ domains: ['gojo'], seed: 3 }), () => null);
    expect(res.perSign.gojo.misses).toBe(5);
    expect(res.ready.gojo).toBe(false);
  });

  it('shows false positives cast during rest', () => {
    let restFrames = 0;
    const res = play(new SignChallenge({ domains: ['gojo', 'higuruma'], seed: 4 }), (t) => t, {
      restResponse: (snap) => (snap.index === 2 && restFrames++ < 30 ? 'higuruma' : null),
    });
    expect(res.falsePositives.length).toBeGreaterThanOrEqual(1);
    expect(res.falsePositives[0].domain).toBe('higuruma');
  });
});
