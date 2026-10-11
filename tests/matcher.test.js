import { describe, it, expect, beforeAll } from 'vitest';
import { PoseMatcher, NEUTRAL } from '../src/core/matcher.js';
import { extractFrameFeatures } from '../src/core/features.js';
import { DOMAINS, domainById } from '../src/domains/catalog.js';
import { trainDomain, neutralCaptures, featFor, frameFor, mirrorFrame, SIGN_SCENES, NEUTRAL_SCENES, LABELS } from './fixtures/hands.js';

const IDS = ['gojo', 'sukuna', 'megumi', 'higuruma'];
const VIEWS = ['center', 'left', 'right', 'near', 'far', 'mid'];

function fullTraining() {
  const caps = [...neutralCaptures()];
  let t = 10;
  for (const d of IDS) {
    caps.push(...trainDomain(d, { baseSeed: 1000 + t * 100, createdAt: t }));
    t += 20;
  }
  return caps;
}

describe('pose matcher with all four signs taught', () => {
  let m;
  beforeAll(() => {
    m = new PoseMatcher();
    m.setData(fullTraining(), LABELS);
  });

  it('marks every sign learned with a per-sign threshold', () => {
    for (const d of IDS) {
      expect(m.reports[d].status).toBe('learned');
      expect(m.reports[d].threshold).toBeGreaterThan(0);
      expect(m.isTrained(d)).toBe(true);
    }
    const thr = IDS.map((d) => m.reports[d].threshold.toFixed(4));
    expect(new Set(thr).size).toBeGreaterThan(1);
  });

  for (const d of IDS) {
    it(`accepts fresh ${d} frames from every view`, () => {
      let ok = 0;
      for (let i = 0; i < 30; i++) {
        const r = m.classify(featFor(SIGN_SCENES[d].friendly, 90000 + i * 13 + d.length * 1000, { view: VIEWS[i % 6] }));
        if (r.accepted && r.best === d) ok++;
      }
      expect(ok).toBeGreaterThanOrEqual(28);
    });
  }

  it('rejects neutral poses and fists', () => {
    for (const [name, scene] of Object.entries(NEUTRAL_SCENES)) {
      for (let i = 0; i < 12; i++) {
        const r = m.classify(featFor(scene, 40000 + i * 7 + name.length * 100, { view: VIEWS[i % 6] }));
        expect(r.accepted, `${name} #${i} fired ${r.best}`).toBe(false);
      }
    }
  });

  it('never accepts one sign as another', () => {
    for (const d of IDS) {
      for (let i = 0; i < 20; i++) {
        const r = m.classify(featFor(SIGN_SCENES[d].friendly, 60000 + i * 3, { view: VIEWS[i % 6] }));
        if (r.accepted) expect(r.best).toBe(d);
      }
    }
  });

  it('rejects the wrong number of hands', () => {
    // A two-hand sign with one hand hidden
    const sukuna = frameFor(SIGN_SCENES.sukuna.friendly, 77);
    const oneHand = { ...sukuna, hands: [sukuna.hands[0]] };
    const r1 = m.classify(extractFrameFeatures(oneHand));
    expect(r1.accepted && ['sukuna', 'megumi', 'higuruma'].includes(r1.best)).toBe(false);
    // Gojo's one-hand sign with an extra hand in frame
    const gojo = frameFor(SIGN_SCENES.gojo.friendly, 78);
    const extra = frameFor(NEUTRAL_SCENES.openL, 79);
    const r2 = m.classify(extractFrameFeatures({ ...gojo, hands: [...gojo.hands, ...extra.hands] }));
    expect(r2.accepted && r2.best === 'gojo').toBe(false);
  });

  it('survives a tracker hand-order or label swap', () => {
    for (const d of ['sukuna', 'megumi', 'higuruma']) {
      for (let i = 0; i < 6; i++) {
        const f = frameFor(SIGN_SCENES[d].friendly, 31000 + i, { view: VIEWS[i % 6] });
        const swapped = { ...f, hands: f.hands.slice().reverse().map((h) => ({ ...h, handedness: h.handedness === 'Left' ? 'Right' : 'Left' })) };
        const r = m.classify(extractFrameFeatures(swapped));
        expect(r.accepted && r.best === d).toBe(true);
      }
    }
  });

  it('rejects swapped hand roles for the asymmetric Higuruma sign', () => {
    // Mirror image: upright palm on the other hand, gavel on the other side.
    for (let i = 0; i < 8; i++) {
      const f = mirrorFrame(frameFor(SIGN_SCENES.higuruma.friendly, 32000 + i, { view: VIEWS[i % 6] }));
      const r = m.classify(extractFrameFeatures(f));
      expect(r.accepted && r.best === 'higuruma').toBe(false);
    }
  });

  it('keeps a handedness gate: Gojo taught with the right hand does not fire for the left', () => {
    let gated = 0;
    for (let i = 0; i < 8; i++) {
      const f = mirrorFrame(frameFor(SIGN_SCENES.gojo.friendly, 33000 + i));
      const r = m.classify(extractFrameFeatures(f));
      expect(r.accepted).toBe(false);
      if (r.reason === 'handedness') gated++;
    }
    expect(gated).toBeGreaterThan(0);
  });

  it('accepts scale and small rotation changes', () => {
    for (const d of IDS) {
      for (const opts of [{ view: 'near' }, { view: 'far' }, { roll: 8 }, { roll: -8 }]) {
        const r = m.classify(featFor(SIGN_SCENES[d].friendly, 34000 + d.length, opts));
        expect(r.accepted && r.best === d, `${d} ${JSON.stringify(opts)} -> ${r.reason}`).toBe(true);
      }
    }
  });

  it('maps every accepted sign to its own animation id', () => {
    const ids = new Set();
    for (const d of IDS) {
      const r = m.classify(featFor(SIGN_SCENES[d].friendly, 35000 + d.length));
      expect(r.accepted).toBe(true);
      ids.add(domainById(r.best).animationId);
    }
    expect([...ids].sort()).toEqual(['chimera-shadow-garden', 'deadly-sentencing', 'malevolent-shrine', 'unlimited-void']);
  });

  it('reports a confidence that is higher for a clean sign than for a neutral pose', () => {
    const good = m.classify(featFor(SIGN_SCENES.megumi.friendly, 36000));
    const bad = m.classify(featFor(NEUTRAL_SCENES.relaxedBoth, 36001));
    expect(good.confidence).toBeGreaterThan(0.5);
    expect(bad.confidence).toBeLessThan(0.5);
  });
});

describe('training lifecycle', () => {
  it('untrained signs never fire', () => {
    const m = new PoseMatcher();
    m.setData([...neutralCaptures(), ...trainDomain('gojo', { baseSeed: 2000 })], LABELS);
    expect(Object.keys(m.models)).toEqual(['gojo']);
    for (const d of ['sukuna', 'megumi', 'higuruma']) {
      for (let i = 0; i < 10; i++) {
        const r = m.classify(featFor(SIGN_SCENES[d].friendly, 37000 + i));
        expect(r.accepted).toBe(false);
      }
    }
  });

  it('one sign can be trained before the others and unlocked later', () => {
    const m = new PoseMatcher();
    const caps = [...neutralCaptures(), ...trainDomain('sukuna', { baseSeed: 2100, createdAt: 5 })];
    m.setData(caps, LABELS);
    expect(m.isTrained('sukuna')).toBe(true);
    expect(m.isTrained('higuruma')).toBe(false);
    m.setData([...caps, ...trainDomain('higuruma', { baseSeed: 2200, createdAt: 50 })], LABELS);
    expect(m.isTrained('higuruma')).toBe(true);
    expect(m.classify(featFor(SIGN_SCENES.higuruma.friendly, 38000)).best).toBe('higuruma');
  });

  it('reports incomplete sets honestly', () => {
    const m = new PoseMatcher();
    m.setData([...neutralCaptures(), ...trainDomain('megumi').slice(0, 7)], LABELS);
    expect(m.reports.megumi.status).toBe('incomplete');
    expect(m.reports.megumi.message).toMatch('7/12');
    expect(m.isTrained('megumi')).toBe(false);
  });

  it('stops firing a sign after its training data is deleted', () => {
    const m = new PoseMatcher();
    const caps = fullTraining();
    m.setData(caps, LABELS);
    expect(m.classify(featFor(SIGN_SCENES.megumi.friendly, 39000)).best).toBe('megumi');
    m.setData(caps.filter((c) => c.domain !== 'megumi'), LABELS);
    const r = m.classify(featFor(SIGN_SCENES.megumi.friendly, 39000));
    expect(r.accepted && r.best === 'megumi').toBe(false);
    expect(m.reports.megumi).toBeUndefined();
  });

  it('flags a deliberately confusable Megumi that copies the Sukuna seal', () => {
    const m = new PoseMatcher();
    const caps = [
      ...neutralCaptures(),
      ...trainDomain('sukuna', { baseSeed: 3000, createdAt: 10 }),
      // "Megumi" taught with essentially the same seal, a little later
      ...trainDomain('megumi', { scene: SIGN_SCENES.sukuna.friendly, baseSeed: 3500, createdAt: 40 }),
    ];
    m.setData(caps, LABELS);
    const r = m.reports.megumi;
    expect(r.status).toBe('confusable');
    expect(r.confusedWith).toBe('sukuna');
    expect(r.message).toMatch(/Megumi resembles Sukuna in \d+\/12 tries—separate wrists or retrain\./);
    expect(m.isTrained('megumi')).toBe(false);
    // The older, working sign keeps working
    expect(m.reports.sukuna.status).toBe('learned');
    expect(m.classify(featFor(SIGN_SCENES.sukuna.friendly, 39500)).best).toBe('sukuna');
  });

  it('flags captures where hands were hidden or merged', () => {
    const m = new PoseMatcher();
    const caps = trainDomain('megumi', { baseSeed: 4000 }).map((c, i) => (i < 4 ? { ...c, quality: { ...c.quality, hidden: true } } : c));
    m.setData([...neutralCaptures(), ...caps], LABELS);
    expect(m.reports.megumi.status).toBe('hidden');
    expect(m.reports.megumi.message).toMatch(/^Hands hidden: retake/);
    expect(m.isTrained('megumi')).toBe(false);
  });

  it('names neutral poses when they are the confusion', () => {
    const m = new PoseMatcher();
    const caps = [...neutralCaptures(), ...trainDomain('gojo', { scene: NEUTRAL_SCENES.openR, baseSeed: 4100, createdAt: 9 })];
    m.setData(caps, LABELS);
    expect(m.reports.gojo.status).toBe('confusable');
    expect(m.reports.gojo.confusedWith).toBe(NEUTRAL);
  });
});

describe('roster', () => {
  it('has exactly the four domains and four distinct animation ids', () => {
    expect(DOMAINS.map((d) => d.id)).toEqual(IDS);
    expect(new Set(DOMAINS.map((d) => d.animationId)).size).toBe(4);
    expect(DOMAINS.find((d) => d.id === 'higuruma').researchStatus).toBe('fan-made');
    for (const d of DOMAINS) expect(d.officialRef.url).toMatch(/^https:\/\/jujutsukaisen\.jp\//);
  });
});
