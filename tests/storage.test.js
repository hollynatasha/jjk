import { describe, it, expect } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { openTrainingStore, exportTraining, importTraining, loadCaptures, EXPORT_FORMAT } from '../src/core/storage.js';
import { FEATURE_VERSION } from '../src/core/features.js';
import { trainDomain, neutralCaptures } from './fixtures/hands.js';

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

for (const kind of ['indexeddb', 'localstorage']) {
  describe(`training store (${kind})`, () => {
    const open = () => (kind === 'indexeddb' ? openTrainingStore({ indexedDB: new IDBFactory(), storage: null }) : openTrainingStore({ indexedDB: null, storage: memoryStorage() }));

    it('stores, lists and deletes captures by domain', async () => {
      const store = await open();
      expect(store.kind).toBe(kind);
      for (const c of [...trainDomain('gojo').slice(0, 3), ...trainDomain('sukuna').slice(0, 2), ...neutralCaptures().slice(0, 2)]) await store.putCapture(c);
      expect((await store.listCaptures()).length).toBe(7);
      expect(await store.deleteWhere((c) => c.domain === 'gojo')).toBe(3);
      const left = await store.listCaptures();
      expect(left.every((c) => c.domain !== 'gojo')).toBe(true);
      await store.clearAll();
      expect(await store.listCaptures()).toEqual([]);
    });

    it('keeps only numeric feature vectors and metadata, never images', async () => {
      const store = await open();
      await store.putCapture({ ...trainDomain('megumi')[0], frame: 'data:image/png;base64,AAAA', video: new Uint8Array([1, 2, 3]) });
      const [c] = await store.listCaptures();
      expect(Object.keys(c).sort()).toEqual(['chirality', 'createdAt', 'domain', 'featureVersion', 'flipped', 'handCount', 'id', 'kind', 'prompt', 'quality', 'slot', 'variant', 'vectors', 'view'].sort());
      expect(c.vectors.flat().every((x) => typeof x === 'number')).toBe(true);
      expect(JSON.stringify(c)).not.toMatch(/data:image|base64/);
    });

    it('exports and re-imports training data', async () => {
      const store = await open();
      for (const c of trainDomain('megumi').slice(0, 4)) await store.putCapture(c);
      await store.putMeta('domains', { megumi: { verified: true } });
      const json = await exportTraining(store);
      const parsed = JSON.parse(json);
      expect(parsed.format).toBe(EXPORT_FORMAT);
      expect(parsed.featureVersion).toBe(FEATURE_VERSION);
      expect(parsed.captures).toHaveLength(4);
      await store.clearAll();
      expect(await importTraining(store, json, { replace: true })).toBe(4);
      const { usable, stale } = await loadCaptures(store);
      expect(usable).toHaveLength(4);
      expect(stale).toBe(0);
      expect(await store.getMeta('domains')).toEqual({ megumi: { verified: true } });
    });

    it('rejects foreign or outdated exports', async () => {
      const store = await open();
      await expect(importTraining(store, '{"format":"something-else"}')).rejects.toThrow(/not a Domain Expansion/);
      await expect(importTraining(store, JSON.stringify({ format: EXPORT_FORMAT, featureVersion: 1, captures: [] }))).rejects.toThrow(/feature version 1/);
      await expect(importTraining(store, 'nope')).rejects.toThrow(/not valid JSON/);
    });
  });
}
