import { describe, it, expect } from 'vitest';
import { CastGate } from '../src/core/gate.js';

const STEP = 55; // ~18 fps tracking cadence

function feed(gate, start, ms, domain, step = STEP) {
  const events = [];
  let t = start;
  for (; t < start + ms; t += step) {
    const r = gate.update(t, domain);
    if (r.event) events.push({ t, ...r });
  }
  return { t, events };
}

describe('cast gate', () => {
  it('fires only after ~0.7 s of continuous acceptance', () => {
    const g = new CastGate();
    const { events } = feed(g, 0, 1000, 'sukuna');
    const cast = events.find((e) => e.event === 'cast');
    expect(cast).toBeTruthy();
    expect(cast.t).toBeGreaterThanOrEqual(700);
    expect(cast.t).toBeLessThan(800);
    expect(cast.domain).toBe('sukuna');
  });

  it('never fires on a single noisy frame', () => {
    const g = new CastGate();
    g.update(0, 'gojo');
    const { events } = feed(g, STEP, 2000, null);
    expect(events.some((e) => e.event === 'cast')).toBe(false);
    expect(events.some((e) => e.event === 'cancel')).toBe(true);
  });

  it('tolerates a dropout up to 150 ms but not longer', () => {
    const g = new CastGate();
    const last = feed(g, 0, 400, 'megumi').t - STEP;
    // 140 ms without an accepted frame
    const gap = g.update(last + 140, null);
    expect(gap.state).toBe('holding');
    const { events } = feed(g, last + 145, 400, 'megumi');
    expect(events.some((e) => e.event === 'cast')).toBe(true);

    const g2 = new CastGate();
    const last2 = feed(g2, 0, 400, 'megumi').t - STEP;
    g2.update(last2 + 25, null);
    const r = g2.update(last2 + 200, null);
    expect(r.event).toBe('cancel');
    expect(r.state).toBe('armed');
  });

  it('needs enough positive frames, not just elapsed time', () => {
    const g = new CastGate();
    g.update(0, 'higuruma');
    g.update(120, 'higuruma');
    g.update(240, 'higuruma');
    g.update(360, 'higuruma');
    // A stalled tracker (no frames for 440 ms) restarts the hold, so a
    // sparse stream cannot add up to a cast.
    const r = g.update(800, 'higuruma');
    expect(r.event).not.toBe('cast');
    expect(r.progress).toBe(0);
  });

  it('resets the hold when the sign changes', () => {
    const g = new CastGate();
    feed(g, 0, 500, 'gojo');
    const r = g.update(500, 'sukuna');
    expect(r.event).toBe('switch');
    const { events } = feed(g, 555, 600, 'sukuna');
    expect(events.some((e) => e.event === 'cast')).toBe(false);
  });

  it('cools down and requires release before re-arming', () => {
    const g = new CastGate();
    const first = feed(g, 0, 1000, 'gojo');
    expect(first.events.filter((e) => e.event === 'cast')).toHaveLength(1);
    // still held through the whole cast + cooldown: no second cast
    g.castFinished(8000);
    const held = feed(g, 8000, 4000, 'gojo');
    expect(held.events.some((e) => e.event === 'cast')).toBe(false);
    // release for 400 ms re-arms
    const released = feed(g, 12000, 400, null);
    expect(released.events.some((e) => e.event === 'rearmed')).toBe(true);
    const again = feed(g, 12400, 1000, 'gojo');
    expect(again.events.some((e) => e.event === 'cast')).toBe(true);
  });

  it('cooldown blocks immediate recasting even after a release', () => {
    const g = new CastGate({ cooldownMs: 1500 });
    feed(g, 0, 1000, 'megumi');
    g.castFinished(1000);
    const { events } = feed(g, 1000, 1200, 'megumi', 55);
    expect(events.some((e) => e.event === 'cast')).toBe(false);
  });

  it('counts hands dropped during the animation as the release', () => {
    const g = new CastGate();
    expect(feed(g, 0, 1000, 'gojo').events.some((e) => e.event === 'cast')).toBe(true);
    g.beginCast();
    // the app reports what it sees while the domain plays: hands down after ~1 s
    for (let t = 1000; t < 2000; t += STEP) g.observe(t, 'gojo');
    for (let t = 2000; t < 8500; t += STEP) g.observe(t, null);
    g.castFinished(8500);
    // a new sign raised during the cooldown fires right after it
    const next = feed(g, 9000, 2600, 'sukuna');
    const cast = next.events.find((e) => e.event === 'cast');
    expect(cast).toBeTruthy();
    expect(cast.domain).toBe('sukuna');
    expect(cast.t).toBeGreaterThanOrEqual(10000 + 700);
    expect(cast.t).toBeLessThan(10000 + 900);
  });

  it('a sign held through the cast and cooldown still has to be released', () => {
    const g = new CastGate();
    feed(g, 0, 1000, 'gojo');
    g.beginCast();
    for (let t = 1000; t < 8500; t += STEP) g.observe(t, 'gojo');
    g.castFinished(8500);
    expect(feed(g, 8500, 5000, 'gojo').events.some((e) => e.event === 'cast')).toBe(false);
    expect(g.state).toBe('release');
  });

  it('every new cast (including a replay) starts a fresh release check', () => {
    const g = new CastGate();
    g.beginCast();
    for (let t = 0; t < 1000; t += STEP) g.observe(t, null);
    expect(g.released).toBe(true);
    g.castFinished(1000);
    g.beginCast(); // replay pressed during the cooldown
    expect(g.released).toBe(false);
    for (let t = 1000; t < 9000; t += STEP) g.observe(t, 'megumi');
    g.castFinished(9000);
    expect(feed(g, 9000, 4000, 'megumi').events.some((e) => e.event === 'cast')).toBe(false);
  });

  it('a locked gate never casts', () => {
    const g = new CastGate();
    g.lock();
    const { events } = feed(g, 0, 2000, 'sukuna');
    expect(events).toHaveLength(0);
    g.unlock(2000, { requireRelease: true });
    const still = feed(g, 2000, 1500, 'sukuna');
    expect(still.events.some((e) => e.event === 'cast')).toBe(false);
  });
});
