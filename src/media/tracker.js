// MediaPipe Tasks Vision: HandLandmarker (VIDEO mode, two hands) and the
// person/background Image Segmenter. Runs in this tab, frames never leave it.
// The detect calls are synchronous, so a busy flag keeps them from overlapping
// and late frames are skipped.

import { FilesetResolver, HandLandmarker, ImageSegmenter } from '@mediapipe/tasks-vision';
import { routeNativeLogs } from './native-logs.js';

export const OFFICIAL_MODELS = {
  hand: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  seg: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite',
};

const BASE = import.meta.env.BASE_URL || './';
const abs = (p) => new URL(p, document.baseURI).href;

/** Model sources in try order. Local copies first when they exist (see vite.config.js). */
export function modelSources(params = new URLSearchParams(location.search)) {
  // eslint-disable-next-line no-undef
  const local = typeof __LOCAL_MODELS__ !== 'undefined' ? __LOCAL_MODELS__ : { hand: false, seg: false };
  const hand = [];
  const seg = [];
  // test switches: ?noLocalModels=1 skips vendored copies, ?offline=1 skips the official URLs
  const useLocal = params.get('noLocalModels') !== '1';
  const useOfficial = params.get('offline') !== '1';
  if (params.get('handModel')) hand.push({ url: abs(params.get('handModel')), label: 'override from URL' });
  if (local.hand && useLocal) hand.push({ url: abs(`${BASE}models/hand_landmarker.task`), label: 'local copy (from google-ai-edge/mediapipe-samples)' });
  if (useOfficial) hand.push({ url: OFFICIAL_MODELS.hand, label: 'official Google storage' });
  if (params.get('segModel')) seg.push({ url: abs(params.get('segModel')), label: 'override from URL (testing)' });
  if (local.seg && useLocal) seg.push({ url: abs(`${BASE}models/selfie_segmenter.tflite`), label: 'local copy' });
  if (useOfficial) seg.push({ url: OFFICIAL_MODELS.seg, label: 'official Google storage' });
  return { hand, seg, noSeg: params.get('noSeg') === '1', delegate: (params.get('delegate') || '').toUpperCase() };
}

export async function fetchWithProgress(url, onProgress, timeoutMs = 60000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, mode: 'cors', credentials: 'omit' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const total = Number(res.headers.get('content-length')) || 0;
    if (!res.body || !res.body.getReader) {
      const buf = new Uint8Array(await res.arrayBuffer());
      onProgress && onProgress(buf.length, buf.length);
      return buf;
    }
    const reader = res.body.getReader();
    const chunks = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      got += value.length;
      onProgress && onProgress(got, total || got);
    }
    const out = new Uint8Array(got);
    let o = 0;
    for (const c of chunks) {
      out.set(c, o);
      o += c.length;
    }
    return out;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(`timed out after ${Math.round(timeoutMs / 1000)} s`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

const ema = (prev, x, k = 0.15) => (prev ? prev + (x - prev) * k : x);


export class Tracker {
  constructor() {
    this.sources = modelSources();
    this.fileset = null;
    this.hand = null;
    this.seg = null;
    this.busy = false;
    this.lastTs = { hand: 0, seg: 0 };
    this.stats = { handMs: 0, segMs: 0, handFrames: 0, segFrames: 0, handErrors: 0, segErrors: 0 };
    this.handSource = null;
    this.segSource = null;
    this.delegate = null;
    this.segLabels = [];
  }

  async loadRuntime() {
    if (this.fileset) return;
    routeNativeLogs();
    this.fileset = await FilesetResolver.forVisionTasks(abs(`${BASE}mediapipe/wasm`).replace(/\/$/, ''));
  }

  async loadHands(onProgress) {
    await this.loadRuntime();
    const errors = [];
    const delegates = this.sources.delegate === 'CPU' ? ['CPU'] : this.sources.delegate === 'GPU' ? ['GPU'] : ['GPU', 'CPU'];
    for (const src of this.sources.hand) {
      let buf;
      try {
        buf = await fetchWithProgress(src.url, (got, total) => onProgress && onProgress({ got, total, src }));
      } catch (e) {
        errors.push(`${src.label}: ${e.message}`);
        continue;
      }
      for (const delegate of delegates) {
        try {
          this.hand = await HandLandmarker.createFromOptions(this.fileset, {
            baseOptions: { modelAssetBuffer: buf, delegate },
            runningMode: 'VIDEO',
            numHands: 2,
            minHandDetectionConfidence: 0.55,
            minHandPresenceConfidence: 0.55,
            minTrackingConfidence: 0.5,
          });
          this.handSource = { ...src, bytes: buf.length };
          this.delegate = delegate;
          return this.handSource;
        } catch (e) {
          errors.push(`${src.label} (${delegate}): ${e.message || e}`);
        }
      }
    }
    throw new Error(errors.join(' | ') || 'no hand model source worked');
  }

  async loadSegmenter(onProgress) {
    await this.loadRuntime();
    if (this.sources.noSeg) throw new Error('segmentation disabled by ?noSeg=1');
    const errors = [];
    for (const src of this.sources.seg) {
      let buf;
      try {
        buf = await fetchWithProgress(src.url, (got, total) => onProgress && onProgress({ got, total, src }), 30000);
      } catch (e) {
        errors.push(`${src.label}: ${e.message}`);
        continue;
      }
      try {
        this.seg = await ImageSegmenter.createFromOptions(this.fileset, {
          baseOptions: { modelAssetBuffer: buf, delegate: 'CPU' },
          runningMode: 'VIDEO',
          outputConfidenceMasks: true,
          outputCategoryMask: false,
        });
        this.segLabels = (this.seg.getLabels && this.seg.getLabels()) || [];
        this.segSource = { ...src, bytes: buf.length };
        return this.segSource;
      } catch (e) {
        errors.push(`${src.label}: ${e.message || e}`);
      }
    }
    throw new Error(errors.join(' | ') || 'no segmentation model source worked');
  }

  /** HandLandmarkerResult to the plain frame shape the matcher wants. */
  static toFrame(r, width, height) {
    const hands = (r.landmarks || []).map((lm, i) => {
      const cat = (r.handedness && r.handedness[i] && r.handedness[i][0]) || (r.handednesses && r.handednesses[i] && r.handednesses[i][0]) || {};
      return {
        landmarks: lm.map((p) => ({ x: p.x, y: p.y, z: p.z })),
        world: r.worldLandmarks && r.worldLandmarks[i] ? r.worldLandmarks[i].map((p) => ({ x: p.x, y: p.y, z: p.z })) : null,
        handedness: cat.categoryName || 'Unknown',
        score: cat.score ?? 0,
      };
    });
    return { width, height, hands };
  }

  detectHands(video, now) {
    if (!this.hand || this.busy || !video || video.readyState < 2 || !video.videoWidth) return null;
    this.busy = true;
    const ts = Math.max(now, this.lastTs.hand + 1);
    this.lastTs.hand = ts;
    const t0 = performance.now();
    try {
      const r = this.hand.detectForVideo(video, ts);
      this.stats.handFrames++;
      return Tracker.toFrame(r, video.videoWidth, video.videoHeight);
    } catch (e) {
      this.stats.handErrors++;
      this.lastError = e;
      return null;
    } finally {
      this.stats.handMs = ema(this.stats.handMs, performance.now() - t0);
      this.busy = false;
    }
  }

  /** Segments, then calls `sink(mask, w, h)` with the person-probability mask inside the callback. */
  segment(video, now, sink) {
    if (!this.seg || this.busy || !video || video.readyState < 2 || !video.videoWidth) return false;
    this.busy = true;
    const ts = Math.max(now, this.lastTs.seg + 1);
    this.lastTs.seg = ts;
    const t0 = performance.now();
    try {
      this.seg.segmentForVideo(video, ts, (result) => {
        const masks = result.confidenceMasks || [];
        if (!masks.length) return;
        let idx = 0;
        const personIdx = this.segLabels.findIndex((l) => /person/i.test(l));
        if (masks.length > 1) idx = personIdx >= 0 ? personIdx : masks.length - 1;
        const m = masks[idx];
        let data = m.getAsFloat32Array();
        if (masks.length === 1 && personIdx < 0 && /background/i.test(this.segLabels[0] || '')) data = data.map((v) => 1 - v);
        sink(data, m.width, m.height);
      });
      this.stats.segFrames++;
      return true;
    } catch (e) {
      this.stats.segErrors++;
      this.lastSegError = e;
      return false;
    } finally {
      this.stats.segMs = ema(this.stats.segMs, performance.now() - t0);
      this.busy = false;
    }
  }

  dropSegmenter() {
    try {
      this.seg && this.seg.close();
    } catch {
      /* ignore */
    }
    this.seg = null;
  }

  close() {
    this.dropSegmenter();
    try {
      this.hand && this.hand.close();
    } catch {
      /* ignore */
    }
    this.hand = null;
  }
}
