import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildSampleExport } from './fixtures/write-sample-vectors.mjs';
import { openTrainingStore, importTraining, exportTraining } from '../src/core/storage.js';
import { PoseMatcher } from '../src/core/matcher.js';
import { featFor, SIGN_SCENES, LABELS } from './fixtures/hands.js';

const file = JSON.parse(readFileSync(new URL('./fixtures/sample-vectors.json', import.meta.url), 'utf8'));
const ALLOWED = new Set(['id', 'kind', 'domain', 'variant', 'flipped', 'slot', 'view', 'prompt', 'handCount', 'chirality', 'vectors', 'quality', 'featureVersion', 'createdAt']);

describe('synthetic sample vectors', () => {
  it('match what the generator produces today (npm run vectors)', () => {
    expect(file).toEqual(JSON.parse(JSON.stringify(buildSampleExport())));
  });

  it('hold only labels and numbers: no image, video or extra fields', () => {
    expect(file.synthetic).toBe(true);
    expect(file.captures).toHaveLength(4 * 12 + 8);
    for (const c of file.captures) {
      for (const k of Object.keys(c)) expect(ALLOWED.has(k)).toBe(true);
      for (const v of c.vectors) expect(v.every((x) => typeof x === 'number' && Number.isFinite(x))).toBe(true);
    }
    const text = JSON.stringify(file);
    expect(text).not.toMatch(/data:image|data:video|base64|blob:/);
  });

  it('import into the app store, export again, and train every sign without a ready badge', async () => {
    const store = await openTrainingStore({ indexedDB: null, storage: null });
    expect(await importTraining(store, JSON.stringify(file))).toBe(56);
    const round = JSON.parse(await exportTraining(store));
    expect(round.captures).toHaveLength(56);
    expect(round.domains).toEqual({});
    const m = new PoseMatcher();
    m.setData(await store.listCaptures(), LABELS);
    for (const d of ['gojo', 'sukuna', 'megumi', 'higuruma']) expect(m.reports[d].status).toBe('learned');
    // a fresh synthetic Megumi frame is recognised as Megumi
    const cls = m.classify(featFor(SIGN_SCENES.megumi.friendly, 4242, { view: 'right' }));
    expect(cls.best).toBe('megumi');
  });
});
