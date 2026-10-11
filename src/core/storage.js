// Training storage. Only labelled numeric feature vectors and small metadata
// are kept: never a camera frame, image or video. IndexedDB first, with a
// localStorage fallback for browsers that block it (some private modes).

import { FEATURE_VERSION } from './features.js';

export const DB_NAME = 'holly-rd-domain-permit';
export const EXPORT_FORMAT = 'holly-rd-domain-permit/training';
const DB_VERSION = 1;
const LS_KEY = 'hrd-training-v1';

export function serializeCapture(c) {
  return {
    id: c.id,
    kind: c.kind,
    domain: c.domain ?? null,
    variant: c.variant ?? null,
    flipped: !!c.flipped,
    slot: c.slot ?? null,
    view: c.view ?? null,
    prompt: c.prompt ?? null,
    handCount: c.handCount,
    chirality: c.chirality ?? null,
    vectors: c.vectors.map((v) => Array.from(v, (x) => Math.round(x * 1e5) / 1e5)),
    quality: c.quality ?? null,
    featureVersion: c.featureVersion ?? FEATURE_VERSION,
    createdAt: c.createdAt ?? Date.now(),
  };
}

function reqP(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

class IdbStore {
  constructor(db) {
    this.db = db;
    this.kind = 'indexeddb';
  }

  static open(idb) {
    return new Promise((resolve, reject) => {
      let req;
      try {
        req = idb.open(DB_NAME, DB_VERSION);
      } catch (e) {
        reject(e);
        return;
      }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('captures')) db.createObjectStore('captures', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(new IdbStore(req.result));
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('IndexedDB blocked'));
    });
  }

  tx(store, mode = 'readonly') {
    return this.db.transaction(store, mode).objectStore(store);
  }

  async listCaptures() {
    return reqP(this.tx('captures').getAll());
  }

  async putCapture(c) {
    const s = serializeCapture(c);
    await reqP(this.tx('captures', 'readwrite').put(s));
    return s;
  }

  async deleteWhere(pred) {
    const all = await this.listCaptures();
    const doomed = all.filter(pred);
    const st = this.tx('captures', 'readwrite');
    await Promise.all(doomed.map((c) => reqP(st.delete(c.id))));
    return doomed.length;
  }

  async clearAll() {
    await reqP(this.tx('captures', 'readwrite').clear());
    await reqP(this.tx('meta', 'readwrite').clear());
  }

  async getMeta(key) {
    const r = await reqP(this.tx('meta').get(key));
    return r ? r.value : undefined;
  }

  async putMeta(key, value) {
    await reqP(this.tx('meta', 'readwrite').put({ key, value }));
  }
}

class LocalStore {
  constructor(storage) {
    this.storage = storage;
    this.kind = storage ? 'localstorage' : 'memory';
    this.mem = { captures: [], meta: {} };
  }

  read() {
    if (!this.storage) return this.mem;
    try {
      const raw = this.storage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : { captures: [], meta: {} };
    } catch {
      return { captures: [], meta: {} };
    }
  }

  write(data) {
    if (!this.storage) {
      this.mem = data;
      return;
    }
    this.storage.setItem(LS_KEY, JSON.stringify(data));
  }

  async listCaptures() {
    return this.read().captures;
  }

  async putCapture(c) {
    const d = this.read();
    const s = serializeCapture(c);
    d.captures = d.captures.filter((x) => x.id !== s.id).concat([s]);
    this.write(d);
    return s;
  }

  async deleteWhere(pred) {
    const d = this.read();
    const before = d.captures.length;
    d.captures = d.captures.filter((c) => !pred(c));
    this.write(d);
    return before - d.captures.length;
  }

  async clearAll() {
    this.write({ captures: [], meta: {} });
  }

  async getMeta(key) {
    return this.read().meta[key];
  }

  async putMeta(key, value) {
    const d = this.read();
    d.meta[key] = value;
    this.write(d);
  }
}

export async function openTrainingStore({ indexedDB = globalThis.indexedDB, storage = globalThis.localStorage } = {}) {
  if (indexedDB) {
    try {
      return await IdbStore.open(indexedDB);
    } catch {
      /* fall back below */
    }
  }
  let ls = null;
  try {
    if (storage) {
      storage.setItem('hrd-probe', '1');
      storage.removeItem('hrd-probe');
      ls = storage;
    }
  } catch {
    ls = null;
  }
  return new LocalStore(ls);
}

/** Loads captures, split into usable ones and ones from an older feature version. */
export async function loadCaptures(store) {
  const all = await store.listCaptures();
  const usable = all.filter((c) => c.featureVersion === FEATURE_VERSION);
  return { usable, stale: all.length - usable.length };
}

export async function exportTraining(store) {
  const captures = await store.listCaptures();
  const meta = (await store.getMeta('domains')) || {};
  return JSON.stringify(
    {
      format: EXPORT_FORMAT,
      featureVersion: FEATURE_VERSION,
      exportedAt: new Date().toISOString(),
      note: 'Landmark-derived feature vectors only. Contains no images or video.',
      captures,
      domains: meta,
    },
    null,
    1,
  );
}

export async function importTraining(store, text, { replace = false } = {}) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (!data || data.format !== EXPORT_FORMAT) throw new Error('That file is not a Domain Permit training export.');
  if (data.featureVersion !== FEATURE_VERSION) throw new Error(`That export uses feature version ${data.featureVersion}; this build expects ${FEATURE_VERSION}. Retake instead.`);
  const caps = Array.isArray(data.captures) ? data.captures : [];
  for (const c of caps) {
    if (!c.id || !Array.isArray(c.vectors) || !c.vectors.every((v) => Array.isArray(v) && v.every((x) => typeof x === 'number' && Number.isFinite(x)))) {
      throw new Error('That export has a malformed capture.');
    }
  }
  if (replace) await store.clearAll();
  for (const c of caps) await store.putCapture(c);
  if (data.domains && typeof data.domains === 'object') await store.putMeta('domains', data.domains);
  return caps.length;
}
