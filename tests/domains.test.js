import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOMAIN_MODULES, moduleFor } from '../src/domains/registry.js';
import { DOMAINS } from '../src/domains/catalog.js';
import { CastRun, phases, anchorsFromHands, TIMELINE, TIMELINE_REDUCED } from '../src/domains/engine.js';
import { computeView, handsToCanvas } from '../src/render/geometry.js';
import { frameFor, SIGN_SCENES } from './fixtures/hands.js';

const W = 720;
const H = 1280;
const IDS = ['gojo', 'sukuna', 'megumi'];

/** 2D context that logs every call and property write, numbers rounded. */
function recordingContext() {
  const log = [];
  const props = { globalAlpha: 1, lineWidth: 1, font: '10px sans-serif', globalCompositeOperation: 'source-over', shadowBlur: 0 };
  const val = (v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : typeof v === 'string' ? v : v && v.__kind ? v.__kind : typeof v);
  const gradient = (kind) => ({ __kind: kind, addColorStop: (o, c) => log.push(['stop', val(o), c]) });
  const own = {
    canvas: { width: W, height: H },
    createLinearGradient: (...a) => (log.push(['linear', ...a.map(val)]), gradient('linear')),
    createRadialGradient: (...a) => (log.push(['radial', ...a.map(val)]), gradient('radial')),
    createPattern: () => null,
    measureText: (t) => ({ width: String(t).length * 9 }),
    getLineDash: () => [],
    drawImage: (src, ...a) => log.push(['drawImage', src && src.__kind ? src.__kind : 'source', ...a.map(val)]),
    note: (what) => log.push(['note', what]),
  };
  const ctx = new Proxy(own, {
    get(t, k) {
      if (k === '__log') return log;
      if (k in t) return t[k];
      if (k in props) return props[k];
      return (...a) => log.push([String(k), ...a.map(val)]);
    },
    set(t, k, v) {
      props[k] = v;
      log.push([`=${String(k)}`, val(v)]);
      return true;
    },
  });
  return ctx;
}

function tempCanvas() {
  const c = recordingContext();
  return { __kind: 'temp', width: W, height: H, getContext: () => c };
}

const VIEW = computeView(640, 480, W, H, true);
function handsFor(domain, seed = 7) {
  return handsToCanvas(frameFor(SIGN_SCENES[domain].friendly, seed), VIEW);
}

/** Renders a cast at the given times, returns the call log from a fresh context. */
function renderCast(domain, { seed = 1234, times = [0.1, 0.8, 3.0, 6.5], reduced = false, low = false, person = true } = {}) {
  const mod = moduleFor(domain);
  const a = anchorsFromHands(handsFor(domain));
  const run = new CastRun({ domainId: domain, seed, reduced, low, anchor0: a }, mod, { W, H });
  const g = recordingContext();
  const temps = [];
  for (const t of times) {
    g.note(`t=${t}`);
    const f = {
      W,
      H,
      t,
      ph: phases(t, reduced),
      a,
      a0: a,
      low,
      reduced,
      hist: () => a,
      room: { draw: (gg) => gg.note('room') },
      person: { available: person, center: [W / 2, H * 0.45], draw: (gg) => gg.note('person'), silhouette: (gg) => gg.note('silhouette') },
      portalRoom: (gg) => gg.note('portal'),
      particles: (gg) => gg.note('particles'),
      temp: (i) => (temps[i] = temps[i] || tempCanvas()),
      overlay: !person,
    };
    mod.render(g, run.state, f);
  }
  return g.__log;
}

const signature = (log) => JSON.stringify(log);

describe('domain registry', () => {
  it('has exactly the taught domains, each with its own animation', () => {
    expect(Object.keys(DOMAIN_MODULES).sort()).toEqual([...IDS].sort());
    const anims = IDS.map((d) => moduleFor(d).id);
    expect(new Set(anims).size).toBe(IDS.length);
    for (const d of DOMAINS) {
      expect(moduleFor(d.id).id).toBe(d.animationId);
      expect(moduleFor(d.id).domain).toBe(d.id);
    }
    expect(() => moduleFor('nobody')).toThrow();
  });

  it('runs every domain on the shared 7.5 s timeline (7.9 s with reduced motion)', () => {
    expect(TIMELINE.total).toBe(7.5);
    expect(TIMELINE.rupture).toEqual([0.25, 1.25]);
    expect(TIMELINE.sustain).toEqual([1.25, 5.8]);
    expect(TIMELINE_REDUCED.total).toBeGreaterThan(TIMELINE.total);
    expect(TIMELINE_REDUCED.total).toBeLessThanOrEqual(8);
  });
});

describe('domain choreography', () => {
  const logs = Object.fromEntries(IDS.map((d) => [d, renderCast(d)]));

  it('draws a full sequence for every domain', () => {
    for (const d of IDS) expect(logs[d].length).toBeGreaterThan(300);
  });

  it('gives every domain its own drawing (no two call logs alike)', () => {
    const sigs = IDS.map((d) => signature(logs[d]));
    expect(new Set(sigs).size).toBe(IDS.length);
    // and their colour sets differ, not just their coordinates
    const colours = (log) => new Set(log.filter((c) => c[0] === '=fillStyle' || c[0] === '=strokeStyle' || c[0] === 'stop').map((c) => c[c.length - 1]).filter((x) => typeof x === 'string' && /^#|^rgb/.test(x)));
    for (let i = 0; i < IDS.length; i++) {
      for (let j = i + 1; j < IDS.length; j++) {
        const a = colours(logs[IDS[i]]);
        const b = colours(logs[IDS[j]]);
        const shared = [...a].filter((x) => b.has(x)).length;
        expect(shared / Math.min(a.size, b.size)).toBeLessThan(0.5);
      }
    }
  });

  it('replays exactly from the same seed and varies with a new one', () => {
    for (const d of IDS) {
      expect(signature(renderCast(d, { seed: 99 }))).toBe(signature(renderCast(d, { seed: 99 })));
      expect(signature(renderCast(d, { seed: 99 }))).not.toBe(signature(renderCast(d, { seed: 100 })));
    }
  });

  it('still transforms the scene with reduced motion', () => {
    for (const d of IDS) {
      const r = renderCast(d, { reduced: true, times: [3.0] });
      const before = renderCast(d, { reduced: true, times: [0.05] });
      expect(r.length).toBeGreaterThan(100);
      expect(signature(r)).not.toBe(signature(before));
    }
  });

  it('renders in effects overlay mode (no person cutout) and in low effects', () => {
    for (const d of IDS) {
      expect(renderCast(d, { person: false, times: [3.0] }).length).toBeGreaterThan(100);
      const low = renderCast(d, { low: true, times: [3.0] });
      const high = renderCast(d, { low: false, times: [3.0] });
      expect(low.length).toBeGreaterThan(50);
      expect(low.length).toBeLessThanOrEqual(high.length);
    }
  });

  it('never loads images: every drawImage source is a canvas made at run time', () => {
    for (const d of IDS) {
      for (const c of logs[d].filter((x) => x[0] === 'drawImage')) expect(c[1]).toBe('temp');
    }
  });
});

describe('content rules', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const banned = ['ma', 'hito'].join('');
  const walk = (dir) =>
    readdirSync(dir).flatMap((n) => {
      if (['node_modules', 'dist', '.git', 'mediapipe', 'models', 'e2e-out'].includes(n)) return [];
      const p = join(dir, n);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });

  it(`never mentions the excluded character anywhere in the repository`, () => {
    const files = walk(root).filter((p) => /\.(js|mjs|json|html|css|svg|md|txt)$/.test(p) && !p.endsWith('package-lock.json'));
    expect(files.length).toBeGreaterThan(30);
    const hits = files.filter((p) => readFileSync(p, 'utf8').toLowerCase().includes(banned));
    expect(hits).toEqual([]);
  });
});
