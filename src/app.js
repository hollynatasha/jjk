// The application controller: camera -> 21 landmarks -> features -> local
// matcher -> gate -> procedural domain on the export canvas -> PNG/clip.

import { Stage } from './render/stage.js';
import { computeView, handsToCanvas } from './render/geometry.js';
import { AudioDesk } from './media/audio.js';
import { ClipRecorder, downloadBlob, stampForFilename } from './media/recorder.js';
import { Tracker } from './media/tracker.js';
import { PersonMask } from './media/segmentation.js';
import { cameraSupport, describeCameraError, listCameras, openCamera, stopStream } from './media/camera.js';
import { PoseMatcher } from './core/matcher.js';
import { CastGate } from './core/gate.js';
import { StableCapture } from './core/capture.js';
import { SignChallenge } from './core/challenge.js';
import { extractFrameFeatures, FEATURE_VERSION } from './core/features.js';
import { tipFor } from './core/feedback.js';
import { openTrainingStore, loadCaptures, exportTraining, importTraining } from './core/storage.js';
import { loadSettings, saveSettings } from './core/settings.js';
import { DOMAINS, DOMAIN_IDS, DOMAIN_LABELS, domainById } from './domains/catalog.js';
import { moduleFor } from './domains/registry.js';
import { CastRun, anchorsFromHands } from './domains/engine.js';
import { announce } from './ui/dom.js';
import { renderPanel, updateReadouts, renderStageUi } from './ui/panels.js';
import { renderCards, updateBadges } from './ui/cards.js';
import { renderHeader, renderDataDialog } from './ui/chrome.js';
import { SLOT_VIEWS, NEG_PROMPTS } from './core/prompts.js';

export { SLOT_VIEWS, NEG_PROMPTS };

// Hand inference is capped at 18 fps (?handFps=5..20 overrides it, for slow
// machines and tests); rendering runs on every animation frame.
const HAND_FPS = (() => {
  const v = Number(new URLSearchParams(location.search).get('handFps'));
  return Number.isFinite(v) && v >= 5 && v <= 20 ? v : 18;
})();
const HAND_INTERVAL = 1000 / HAND_FPS;
// Segmentation only gets the frames hand tracking leaves free. If it cannot get
// at least this many masks per window, the app switches to effects overlay mode.
const SEG_WATCH_MS = 4000;
const SEG_MIN_FRAMES = 3;

export class App {
  constructor() {
    this.dom = {
      canvas: document.getElementById('stage-canvas'),
      stage: document.getElementById('stage'),
      stageUi: document.getElementById('stage-ui'),
      status: document.getElementById('stage-status'),
      panel: document.getElementById('panel'),
      cards: document.getElementById('cards'),
      dialog: document.getElementById('data-dialog'),
    };
    this.settings = loadSettings();
    this.reducedQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false, addEventListener() {} };
    this.stage = new Stage(this.dom.canvas);
    this.audio = new AudioDesk();
    this.audio.muted = this.settings.muted;
    this.recorder = new ClipRecorder(this.dom.canvas, this.audio);
    this.tracker = new Tracker();
    this.mask = new PersonMask();
    this.matcher = new PoseMatcher();
    this.gate = new CastGate();
    this.mode = 'landing';
    this.video = document.createElement('video');
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.setAttribute('playsinline', '');
    this.cam = { status: 'off', stream: null, track: null, mirror: true, facing: 'user', devices: [], index: 0, error: null };
    this.models = { runtime: 'idle', hand: 'idle', seg: 'idle', handProgress: 0, segProgress: 0, handSrc: '', segSrc: '', segNote: '' };
    this.segEnabled = false;
    this.segLastAt = 0;
    this.captures = [];
    this.staleCaptures = 0;
    this.meta = { domains: {} };
    this.hand = { frame: null, feat: null, cls: null, canvas: [], lastAt: 0, gate: null };
    this.view = null;
    this.teach = null;
    this.challenge = null;
    this.challengeSnap = null;
    this.challengeResults = null;
    this.run = null;
    this.lastRecord = null;
    this.peak = document.createElement('canvas');
    this.peak.width = this.dom.canvas.width;
    this.peak.height = this.dom.canvas.height;
    this.peakDomain = null;
    this.rec = { phase: 'idle' };
    this.clip = null;
    this.simDomain = 'gojo';
    this.notices = [];
    this.brightness = null;
    this.lightAt = 0;
    this.uiAt = 0;
    this.flashAt = 0;
    this.expanded = {};
    this.perf = { frameMs: 0, byDomain: {} };
    // Test hook: with ?debug=1 the cast clock can be frozen at an exact time
    // so automated screenshots are deterministic. Inert otherwise.
    this.debug = new URLSearchParams(location.search).get('debug') === '1';
    this.clockOverride = null;
    window.__domainPermit = this; // read-only debugging handle for the e2e harness
  }

  // ---------- derived settings ----------
  get reduced() {
    return this.settings.motion === 'reduced' || (this.settings.motion === 'auto' && this.reducedQuery.matches);
  }

  get low() {
    return this.settings.effects === 'low';
  }

  get cameraOn() {
    return this.cam.status === 'on';
  }

  saveSettings() {
    saveSettings(this.settings);
  }

  // ---------- boot ----------
  async init() {
    renderHeader(this);
    renderCards(this);
    this.setMode('landing');
    this.bindGlobal();
    try {
      this.store = await openTrainingStore();
      const { usable, stale } = await loadCaptures(this.store);
      this.captures = usable;
      this.staleCaptures = stale;
      this.meta.domains = (await this.store.getMeta('domains')) || {};
    } catch (e) {
      this.notice(`Training storage unavailable (${e.message}). Captures will last until you close the tab.`);
    }
    this.refreshMatcher();
    this.raf = requestAnimationFrame(this.loop);
  }

  bindGlobal() {
    document.addEventListener('visibilitychange', () => this.onVisibility());
    window.addEventListener('pagehide', () => this.shutdown());
    this.reducedQuery.addEventListener && this.reducedQuery.addEventListener('change', () => {
      renderHeader(this);
      this.renderAll();
    });
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  onKey(e) {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (e.target && e.target.tagName) || '';
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || this.dom.dialog.open) return;
    const k = e.key.toLowerCase();
    if (k === 'm') {
      this.toggleMute();
      e.preventDefault();
    } else if (k === 'e') {
      this.toggleEffects();
      e.preventDefault();
    } else if (k === 'r' && (this.mode === 'live' || this.mode === 'result' || this.mode === 'sim') && this.rec.phase === 'idle' && !this.run) {
      this.startRecording();
      e.preventDefault();
    } else if (this.mode === 'sim' && !this.run && ['1', '2', '3', '4'].includes(k)) {
      this.previewSim(DOMAIN_IDS[Number(k) - 1]);
      e.preventDefault();
    } else if (k === 'escape' && !this.run && ['teach', 'negatives', 'test', 'live', 'result'].includes(this.mode) && this.rec.phase === 'idle') {
      this.goLibrary();
      e.preventDefault();
    }
  }

  // ---------- modes ----------
  setMode(mode, { focus = true } = {}) {
    const prev = this.mode;
    this.mode = mode;
    this.renderAll();
    if (focus && prev !== mode) {
      const head = this.dom.panel.querySelector('h1, h2');
      if (head) {
        head.setAttribute('tabindex', '-1');
        head.focus({ preventScroll: true });
      }
    }
  }

  renderAll() {
    renderPanel(this);
    renderStageUi(this);
    updateBadges(this);
    this.dom.stage.setAttribute('aria-busy', this.run ? 'true' : 'false');
  }

  notice(text, ms = 7000) {
    const n = { text, until: performance.now() + ms };
    this.notices.push(n);
    announce(text);
    renderStageUi(this);
  }

  // ---------- training data ----------
  refreshMatcher() {
    this.matcher.setData(this.captures.filter((c) => c.featureVersion === FEATURE_VERSION), DOMAIN_LABELS);
    updateBadges(this);
  }

  positives(domain) {
    return this.captures.filter((c) => c.kind === 'positive' && c.domain === domain);
  }

  negatives() {
    return this.captures.filter((c) => c.kind === 'negative');
  }

  trainedDomains() {
    return Object.keys(this.matcher.models);
  }

  badge(d) {
    const caps = this.positives(d).length;
    const r = this.matcher.reports[d];
    if (!caps) return { tone: 'none', text: 'Not trained' };
    if (!r || r.status === 'incomplete') return { tone: 'amber', text: `${caps}/12 captured` };
    if (r.status === 'confusable') return { tone: 'red', text: 'Confusable' };
    if (r.status === 'hidden') return { tone: 'red', text: 'Hands hidden' };
    if (r.status === 'inconsistent') return { tone: 'amber', text: 'Needs retakes' };
    const v = this.meta.domains[d] && this.meta.domains[d].verified;
    if (v && v.ready) return { tone: 'green', text: `Ready ${v.success}/5` };
    if (v) return { tone: 'amber', text: `Test ${v.success}/5` };
    return { tone: 'amber', text: 'Learned, untested' };
  }

  async saveMeta() {
    try {
      await this.store.putMeta('domains', this.meta.domains);
    } catch {
      /* memory only */
    }
  }

  async clearVerified(domain) {
    if (this.meta.domains[domain] && this.meta.domains[domain].verified) {
      delete this.meta.domains[domain].verified;
      await this.saveMeta();
    }
  }

  async deleteCaptures(pred) {
    const doomed = this.captures.filter(pred);
    this.captures = this.captures.filter((c) => !pred(c));
    try {
      await this.store.deleteWhere((c) => doomed.some((d) => d.id === c.id));
    } catch {
      /* memory only */
    }
    for (const d of new Set(doomed.map((c) => c.domain).filter(Boolean))) await this.clearVerified(d);
    this.refreshMatcher();
    return doomed.length;
  }

  async deleteAllTraining() {
    this.captures = [];
    this.meta.domains = {};
    try {
      await this.store.clearAll();
    } catch {
      /* memory only */
    }
    this.refreshMatcher();
    this.teach = null;
    announce('All training data deleted.');
    if (['teach', 'negatives', 'test', 'live', 'result'].includes(this.mode)) this.goLibrary();
    else this.renderAll();
  }

  async exportTraining() {
    const json = await exportTraining(this.store);
    downloadBlob(new Blob([json], { type: 'application/json' }), `domain-permit-training-${stampForFilename()}.json`);
    announce('Training data exported.');
  }

  async importTraining(file) {
    const text = await file.text();
    const n = await importTraining(this.store, text, { replace: false });
    const { usable } = await loadCaptures(this.store);
    this.captures = usable;
    this.meta.domains = (await this.store.getMeta('domains')) || {};
    this.refreshMatcher();
    this.renderAll();
    announce(`Imported ${n} captures.`);
    return n;
  }

  // ---------- camera + models ----------
  async startCamera() {
    this.audio.unlock();
    const support = cameraSupport();
    if (!support.secure || !support.media || !support.wasm) {
      this.cam.error = describeCameraError(null, support);
      this.cam.status = 'error';
      this.setMode('error');
      return;
    }
    this.cam.status = 'starting';
    this.cam.error = null;
    this.setMode('loading');
    const modelsP = this.ensureModels().catch((e) => e);
    try {
      await this.openStream({});
    } catch (e) {
      this.cam.status = 'error';
      this.cam.error = describeCameraError(e, support);
      this.setMode('error');
      return;
    }
    const err = await modelsP;
    if (err instanceof Error) {
      this.models.hand = 'error';
      this.cam.error = {
        code: 'model',
        title: 'The hand tracker did not load',
        detail: err.message,
        fixes: ['Check the connection and press Try again.', 'If public/models/hand_landmarker.task is missing, run npm run fetch-models.', 'Preview effects still works without the tracker (simulation only).'],
      };
      this.setMode('error');
      return;
    }
    this.cam.devices = await listCameras();
    this.setMode(this.captures.length ? 'library' : 'library');
    announce('Camera on. Tracking ready.');
  }

  async openStream({ deviceId = null }) {
    stopStream(this.cam.stream);
    const c = await openCamera({ deviceId, facingMode: 'user', quality: this.settings.cameraQuality });
    this.cam.stream = c.stream;
    this.cam.track = c.track;
    this.cam.mirror = c.mirror;
    this.cam.facing = c.facing;
    this.cam.settings = c.settings;
    this.video.srcObject = c.stream;
    await this.video.play().catch(() => {});
    await new Promise((resolve) => {
      if (this.video.readyState >= 2) resolve();
      else this.video.addEventListener('loadeddata', resolve, { once: true });
      setTimeout(resolve, 4000);
    });
    this.cam.status = 'on';
    this.mask.reset();
    if (c.track) c.track.addEventListener('ended', () => this.onTrackEnded());
  }

  onTrackEnded() {
    if (this.cam.status !== 'on') return;
    this.cam.status = 'error';
    this.cam.error = {
      code: 'ended',
      title: 'The camera disconnected',
      detail: 'The video track ended: the camera was unplugged, taken by another app, or its permission was revoked.',
      fixes: ['Reconnect or free the camera, then press Try again.'],
    };
    this.abortCast();
    this.cancelRecording('Camera disconnected; recording stopped.');
    this.setMode('error');
  }

  async switchCamera() {
    if (!this.cameraOn || this.run) return;
    this.cam.devices = await listCameras();
    if (this.cam.devices.length < 2) {
      this.notice('Only one camera found.');
      return;
    }
    const current = this.cam.settings && this.cam.settings.deviceId;
    let idx = this.cam.devices.findIndex((d) => d.deviceId === current);
    idx = (idx + 1) % this.cam.devices.length;
    try {
      await this.openStream({ deviceId: this.cam.devices[idx].deviceId });
      this.gate.reset();
      announce(`Switched to ${this.cam.devices[idx].label}.`);
      this.renderAll();
    } catch (e) {
      this.cam.error = describeCameraError(e);
      this.notice(`${this.cam.error.title}. ${this.cam.error.detail}`);
    }
  }

  stopCamera() {
    this.abortCast();
    this.cancelRecording();
    stopStream(this.cam.stream);
    this.cam.stream = null;
    this.cam.track = null;
    this.cam.status = 'off';
    this.video.srcObject = null;
    this.hand = { frame: null, feat: null, cls: null, canvas: [], lastAt: 0, gate: null };
    this.mask.reset();
    this.teach = null;
    this.challenge = null;
    this.setMode('landing');
    announce('Camera stopped.');
  }

  async ensureModels() {
    if (this.tracker.hand) return;
    this.models.runtime = 'loading';
    this.renderAll();
    await this.tracker.loadRuntime();
    this.models.runtime = 'ready';
    this.models.hand = 'loading';
    this.renderAll();
    await this.tracker.loadHands(({ got, total, src }) => {
      this.models.handProgress = total ? got / total : 0;
      this.models.handSrc = src.label;
      updateReadouts(this, performance.now());
    });
    this.models.hand = 'ready';
    this.models.handSrc = this.tracker.handSource.label;
    this.renderAll();
    this.loadSegmentation();
  }

  async loadSegmentation() {
    if (this.models.seg === 'loading' || this.models.seg === 'ready') return;
    this.models.seg = 'loading';
    try {
      await this.tracker.loadSegmenter(({ got, total, src }) => {
        this.models.segProgress = total ? got / total : 0;
        this.models.segSrc = src.label;
      });
      this.models.seg = 'ready';
      this.models.segSrc = this.tracker.segSource.label;
      this.segEnabled = true;
      this.segWatch = null;
    } catch (e) {
      this.models.seg = 'failed';
      this.models.segNote = e.message;
      this.segEnabled = false;
      this.notice('Effects overlay mode: the person segmenter did not load, so domains open around a camera portal instead of behind you. Hand signs work as normal.', 9000);
    }
    this.renderAll();
  }

  segmentationOff(note, message) {
    this.segEnabled = false;
    this.segWatch = null;
    this.models.seg = 'slow';
    this.models.segNote = note;
    this.mask.reset();
    this.notice(message, 9000);
    this.renderAll();
  }

  measureBrightness() {
    try {
      if (!this.lightCanvas) {
        this.lightCanvas = document.createElement('canvas');
        this.lightCanvas.width = 32;
        this.lightCanvas.height = 24;
        this.lightCtx = this.lightCanvas.getContext('2d', { willReadFrequently: true });
      }
      this.lightCtx.drawImage(this.video, 0, 0, 32, 24);
      const d = this.lightCtx.getImageData(0, 0, 32, 24).data;
      let s = 0;
      for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      this.brightness = s / (d.length / 4) / 255;
    } catch {
      this.brightness = null;
    }
  }

  // ---------- main loop ----------
  loop = (realNow) => {
    this.raf = requestAnimationFrame(this.loop);
    if (document.hidden) return;
    const now = this.clockOverride ?? realNow;
    try {
      const t0 = performance.now();
      this.tick(now, realNow);
      const dt = performance.now() - t0;
      this.perf.frameMs = this.perf.frameMs ? this.perf.frameMs * 0.9 + dt * 0.1 : dt;
      if (this.run) {
        const id = this.run.record.domainId;
        this.perf.byDomain[id] = this.perf.byDomain[id] ? this.perf.byDomain[id] * 0.9 + dt * 0.1 : dt;
      }
    } catch (e) {
      // Keep the loop alive; surface the problem once.
      if (!this.loopError) {
        this.loopError = e;
        console.error(e);
        this.notice(`Render error: ${e.message}`);
      }
    }
  };

  /**
   * now: the render clock (frozen by the ?debug=1 test hooks); rt: real time.
   * Tracking, segmentation, gates and recording always run on real time.
   */
  tick(now, rt = now) {
    const camReady = this.cameraOn && this.video.readyState >= 2 && this.video.videoWidth > 0;
    // A long gap (background tab, debugger) is not starvation: restart the segmentation watch.
    if (!camReady || (this.lastTickAt && rt - this.lastTickAt > 1000)) this.segWatch = null;
    this.lastTickAt = rt;
    if (camReady) {
      this.view = computeView(this.video.videoWidth, this.video.videoHeight, this.dom.canvas.width, this.dom.canvas.height, this.cam.mirror);
      if (this.tracker.hand && rt - this.hand.lastAt >= HAND_INTERVAL) {
        const frame = this.tracker.detectHands(this.video, rt);
        if (frame) {
          this.hand.lastAt = rt;
          this.onFrame(frame, rt);
        }
      } else if (this.segEnabled && this.tracker.seg && rt - this.segLastAt >= (this.low ? 260 : 120) && rt - this.hand.lastAt > 10) {
        this.segLastAt = rt;
        this.tracker.segment(this.video, rt, (data, w, h) => this.mask.update(data, w, h, rt));
        const st = this.tracker.stats;
        if (st.segFrames > 20 && st.segMs > 80) {
          this.segmentationOff(`segmentation averaged ${Math.round(st.segMs)} ms per frame`, 'Effects overlay mode: segmentation is too slow on this device, so it was switched off to keep hand tracking smooth.');
        }
      }
      if (this.segEnabled && this.tracker.seg) {
        // Hand tracking always comes first. When it needs every frame (slow CPU),
        // segmentation starves; say so and use overlay mode instead of a stale cutout.
        const w = this.segWatch || (this.segWatch = { since: rt, frames: this.tracker.stats.segFrames });
        if (rt - w.since >= SEG_WATCH_MS) {
          const got = this.tracker.stats.segFrames - w.frames;
          this.segWatch = null;
          if (got < SEG_MIN_FRAMES) {
            this.segmentationOff(`hand tracking (${Math.round(this.tracker.stats.handMs)} ms per frame) left no time for segmentation`, 'Effects overlay mode: hand tracking needs all of this device’s time, so the person cutout is off. Hand signs work as normal.');
          }
        }
      }
      if (rt - this.lightAt > 1000) {
        this.lightAt = rt;
        this.measureBrightness();
      }
    }
    if (this.mode === 'sim' || (this.run && this.run.record.simulated)) this.simHands(now);

    if (this.run) {
      if (this.run.startedAt === null) this.run.begin(now);
      const t = this.run.t(now);
      if (!this.run.peakTaken && t >= 3.3) {
        this.run.peakTaken = 'pending';
      }
      if (this.run.done(now)) this.endCast(rt);
    }
    this.tickRecording(rt);
    this.realNow = rt;
    this.stage.render(now, this.stageState(now));
    if (this.run && this.run.peakTaken === 'pending') {
      this.stage.snapshot(this.peak);
      this.peakDomain = this.run.record.domainId;
      this.run.peakTaken = true;
    }
    if (rt - this.uiAt > 100) {
      this.uiAt = rt;
      this.notices = this.notices.filter((n) => n.until > rt);
      updateReadouts(this, rt);
    }
  }

  stageState(now) {
    const sim = this.mode === 'sim' || !!(this.run && this.run.record.simulated);
    const preview = !sim && !this.cameraOn && !this.run;
    let charge = null;
    const g = this.hand.gate;
    if (!this.run && g && g.state === 'holding' && g.domain && (this.mode === 'live' || this.mode === 'result')) charge = { domain: g.domain, p: g.progress };
    if (this.mode === 'test' && this.challengeSnap && this.challengeSnap.holding) charge = { domain: this.challengeSnap.holding, p: this.challengeSnap.holdProgress };
    return {
      preview,
      sim,
      video: this.cameraOn ? this.video : null,
      view: this.view,
      mask: this.mask,
      maskNow: this.realNow ?? now,
      segOk: this.segEnabled,
      hands: this.hand.canvas,
      showHands: this.cameraOn && this.mode !== 'cast',
      teach: this.mode === 'teach' || this.mode === 'negatives',
      charge,
      cast: this.run,
      castKey: this.castKey,
      low: this.low,
      reduced: this.reduced,
    };
  }

  /** Smoothed stage-space hands for drawing; alpha fades traces in only when tracking is confident. */
  updateCanvasHands(frame) {
    const next = handsToCanvas(frame, this.view).sort((a, b) => a.pts[0][0] - b.pts[0][0]);
    const prev = this.hand.canvas;
    this.hand.canvas = next.map((h, i) => {
      const p = prev[i];
      const confident = h.score >= 0.85;
      const alpha = Math.min(1, Math.max(0, (p ? p.alpha : 0) + (confident ? 0.34 : -0.25)));
      if (!p || p.pts.length !== h.pts.length) return { ...h, alpha };
      const k = 0.6;
      return { ...h, alpha, pts: h.pts.map((q, j) => [p.pts[j][0] + (q[0] - p.pts[j][0]) * k, p.pts[j][1] + (q[1] - p.pts[j][1]) * k]) };
    });
  }

  simHands(now) {
    const domain = this.run && this.run.record.simulated ? this.run.record.domainId : null;
    const frame = this.stage.standIn.frameFor(domain, now / 1000);
    this.hand.canvas = handsToCanvas(frame, this.stage.simView).map((h) => ({ ...h, alpha: 1 }));
  }

  onFrame(frame, now) {
    this.hand.frame = frame;
    const feat = extractFrameFeatures(frame);
    this.hand.feat = feat;
    this.updateCanvasHands(frame);
    if (this.mode === 'teach' || this.mode === 'negatives') {
      this.onTeachFrame(feat, now);
      return;
    }
    if (this.mode === 'test' && this.challenge) {
      const cls = this.matcher.classify(feat);
      this.hand.cls = cls;
      const snap = this.challenge.update(now, cls.accepted ? cls.best : null);
      this.onChallenge(snap);
      return;
    }
    if (this.mode === 'cast' && this.run) {
      // No new cast can start, but dropping the hands now counts as the release.
      const cls = this.matcher.classify(feat);
      this.hand.cls = cls;
      this.gate.observe(now, cls.accepted ? cls.best : null);
      return;
    }
    if ((this.mode === 'live' || this.mode === 'result') && !this.run) {
      const cls = this.matcher.classify(feat);
      this.hand.cls = cls;
      const g = this.gate.update(now, cls.accepted ? cls.best : null);
      this.hand.gate = g;
      if (g.event === 'cast') this.startCast(g.domain, now);
      return;
    }
    this.hand.cls = this.mode === 'library' ? this.matcher.classify(feat) : null;
  }

  // ---------- teach ----------
  openTeach(domain, { after = null } = {}) {
    if (!this.cameraOn) {
      this.notice('Start the camera to teach a sign. Simulation can only preview effects.');
      return;
    }
    const d = domainById(domain);
    const variant = this.settings.variant[domain] || 'friendly';
    const hands = variant === 'custom' ? this.settings.customHands[domain] || d.hands : d.hands;
    const existing = this.positives(domain);
    const slots = new Array(12).fill(null);
    for (const c of existing) {
      const i = Number.isInteger(c.slot) && c.slot >= 0 && c.slot < 12 && !slots[c.slot] ? c.slot : slots.indexOf(null);
      if (i >= 0) slots[i] = c;
    }
    const mismatch = existing.some((c) => c.handCount !== hands || (c.variant && c.variant !== variant));
    this.teach = { kind: 'sign', domain, variant, hands, flipped: !!this.settings.flipped[domain], slots, slot: slots.indexOf(null), capture: new StableCapture(hands).inheritRelease(after), status: null, report: null, mismatch };
    if (this.negatives().length < NEG_PROMPTS.length) {
      this.openNegatives({ then: domain });
      return;
    }
    if (this.teach.slot === -1) {
      this.teach.phase = 'review';
      this.teach.report = this.matcher.reports[domain] || null;
    } else {
      this.teach.phase = 'capturing';
    }
    this.gate.lock();
    this.setMode('teach');
    announce(`Teaching ${d.character}. ${this.teach.phase === 'review' ? 'Twelve captures on file.' : SLOT_VIEWS[this.teach.slot].label}.`);
  }

  openNegatives({ then = null } = {}) {
    const have = new Set(this.negatives().map((c) => c.prompt));
    const index = NEG_PROMPTS.findIndex((p) => !have.has(p.id));
    this.teach = { kind: 'negatives', then, index: index === -1 ? NEG_PROMPTS.length : index, capture: new StableCapture(NEG_PROMPTS[Math.max(0, index)]?.hands || 1), status: null, phase: 'capturing' };
    this.gate.lock();
    this.setMode('negatives');
  }

  async onTeachFrame(feat, now) {
    const T = this.teach;
    if (!T || T.phase !== 'capturing' || T.saving) return;
    const r = T.capture.update(now, feat);
    T.status = r;
    if (r.status !== 'captured') return;
    T.saving = true;
    this.flashAt = performance.now();
    try {
      if (T.kind === 'negatives') await this.saveNegative(r.capture);
      else await this.saveSignCapture(r.capture);
    } finally {
      T.saving = false;
    }
  }

  async saveNegative(capture) {
    const T = this.teach;
    const prompt = NEG_PROMPTS[T.index];
    const cap = { ...capture, id: `neg-${prompt.id}-${Date.now().toString(36)}`, kind: 'negative', domain: null, prompt: prompt.id, featureVersion: FEATURE_VERSION, createdAt: Date.now() };
    await this.persist(cap);
    const have = new Set(this.negatives().map((c) => c.prompt));
    const next = NEG_PROMPTS.findIndex((p) => !have.has(p.id));
    if (next === -1) {
      announce('Neutral poses done.');
      this.refreshMatcher();
      if (T.then) {
        this.teach = null;
        this.openTeach(T.then, { after: T.capture });
      } else {
        this.goLibrary();
      }
      return;
    }
    T.index = next;
    T.capture = new StableCapture(NEG_PROMPTS[next].hands).inheritRelease(T.capture);
    announce(`Captured. Next: ${NEG_PROMPTS[next].text}.`);
    renderPanel(this);
  }

  async saveSignCapture(capture) {
    const T = this.teach;
    const slot = T.slot;
    const cap = {
      ...capture,
      id: `cap-${T.domain}-${slot}-${Date.now().toString(36)}`,
      kind: 'positive',
      domain: T.domain,
      variant: T.variant,
      flipped: T.flipped,
      slot,
      view: SLOT_VIEWS[slot].id,
      featureVersion: FEATURE_VERSION,
      createdAt: Date.now(),
    };
    await this.clearVerified(T.domain);
    await this.persist(cap);
    T.slots[slot] = cap;
    T.slot = T.slots.indexOf(null);
    if (T.slot === -1) {
      this.refreshMatcher();
      T.report = this.matcher.reports[T.domain] || null;
      T.phase = 'review';
      announce(T.report ? T.report.message : 'Twelve captures taken.');
    } else {
      announce(`Captured ${12 - T.slots.filter((s) => !s).length} of 12. Next: ${SLOT_VIEWS[T.slot].label}.`);
    }
    renderPanel(this);
    updateBadges(this);
  }

  async persist(cap) {
    this.captures.push(cap);
    try {
      await this.store.putCapture(cap);
    } catch {
      this.notice('Could not write to browser storage; this capture lasts only until you close the tab.');
    }
  }

  async retakeSlot(i) {
    const T = this.teach;
    if (!T || T.kind !== 'sign') return;
    const cap = T.slots[i];
    if (cap) await this.deleteCaptures((c) => c.id === cap.id);
    T.slots[i] = null;
    T.slot = i;
    T.phase = 'capturing';
    T.report = null;
    T.capture.reset();
    renderPanel(this);
    announce(`Retaking capture ${i + 1}: ${SLOT_VIEWS[i].label}.`);
  }

  async retakeFlagged() {
    const T = this.teach;
    if (!T || !T.report) return;
    const ids = new Set(T.report.flagged || []);
    if (!ids.size) return;
    await this.deleteCaptures((c) => ids.has(c.id));
    T.slots = T.slots.map((c) => (c && ids.has(c.id) ? null : c));
    T.slot = T.slots.indexOf(null);
    T.phase = 'capturing';
    T.report = null;
    T.capture.reset();
    renderPanel(this);
  }

  async retakeAll(domain = this.teach && this.teach.domain) {
    if (!domain) return;
    await this.deleteCaptures((c) => c.kind === 'positive' && c.domain === domain);
    if (this.teach && this.teach.domain === domain) {
      this.teach.slots = new Array(12).fill(null);
      this.teach.slot = 0;
      this.teach.phase = 'capturing';
      this.teach.report = null;
      this.teach.mismatch = false;
      this.teach.capture = new StableCapture(this.teach.hands);
      renderPanel(this);
    }
    updateBadges(this);
  }

  async setVariant(domain, variant, customHands = null) {
    this.settings.variant[domain] = variant;
    if (customHands) this.settings.customHands[domain] = customHands;
    this.saveSettings();
    const hasData = this.positives(domain).length > 0;
    if (hasData) await this.retakeAll(domain);
    if (this.teach && this.teach.domain === domain) this.openTeach(domain);
    else this.renderAll();
    renderCards(this);
  }

  toggleFlip(domain) {
    this.settings.flipped[domain] = !this.settings.flipped[domain];
    this.saveSettings();
    renderCards(this);
    renderStageUi(this);
  }

  async deleteSign(domain) {
    await this.deleteCaptures((c) => c.kind === 'positive' && c.domain === domain);
    delete this.meta.domains[domain];
    await this.saveMeta();
    announce(`${domainById(domain).character} deleted.`);
    if (this.teach && this.teach.domain === domain) this.goLibrary();
    else this.renderAll();
  }

  goLibrary() {
    this.teach = null;
    this.challenge = null;
    this.challengeSnap = null;
    this.gate.reset();
    this.setMode(this.cameraOn ? 'library' : 'landing');
  }

  // ---------- test my signs ----------
  startChallenge() {
    const domains = this.trainedDomains();
    if (!domains.length) {
      this.notice('Teach at least one sign first.');
      return;
    }
    this.challenge = new SignChallenge({ domains, seed: (Date.now() & 0x7fffffff) >>> 0 });
    this.challengeResults = null;
    this.challengeSnap = this.challenge.start(performance.now());
    this.setMode('test');
  }

  onChallenge(snap) {
    const prev = this.challengeSnap;
    this.challengeSnap = snap;
    if (snap.event) {
      const e = snap.event;
      const name = (d) => (d ? domainById(d).character : 'nothing');
      if (e.type === 'success') announce(`${name(e.target)}: recognised.`);
      else if (e.type === 'confusion') announce(`Asked for ${name(e.target)}, saw ${name(e.detected)}.`);
      else if (e.type === 'miss') announce(`${name(e.target)}: not recognised in time.`);
      else if (e.type === 'false-positive') announce(`False positive: ${name(e.domain)} fired during rest.`);
    }
    if (snap.done && (!prev || !prev.done)) this.finishChallenge();
    else if (!prev || prev.phase !== snap.phase || prev.index !== snap.index) renderPanel(this);
  }

  async finishChallenge() {
    const res = this.challenge.results();
    this.challengeResults = res;
    for (const d of Object.keys(res.perSign)) {
      const s = res.perSign[d];
      this.meta.domains[d] = this.meta.domains[d] || {};
      this.meta.domains[d].verified = { at: new Date().toISOString(), ready: res.ready[d], success: s.success, attempts: s.attempts, misses: s.misses, confusions: s.confusions, falsePositives: s.falsePositives };
    }
    this.lastChallengeLog = res;
    await this.saveMeta();
    renderPanel(this);
    updateBadges(this);
    const readyN = Object.values(res.ready).filter(Boolean).length;
    announce(`Test finished. ${readyN} of ${Object.keys(res.ready).length} signs ready.`);
  }

  // ---------- live + casting ----------
  goLive() {
    if (!this.trainedDomains().length) {
      this.notice('No sign is trained yet. Teach one first; untrained domains never fire.');
      return;
    }
    this.teach = null;
    this.gate.reset();
    this.setMode('live');
  }

  startCast(domainId, now, { replay = null, simulated = false } = {}) {
    if (this.run) return;
    this.audio.unlock();
    const mod = moduleFor(domainId);
    const live = anchorsFromHands(this.hand.canvas);
    const record = replay
      ? { ...replay, replayOf: replay.id }
      : {
          id: `cast-${Date.now().toString(36)}`,
          domainId,
          animationId: mod.id,
          seed: (Math.random() * 2 ** 31) >>> 0,
          low: this.low,
          reduced: this.reduced,
          simulated,
          at: new Date().toISOString(),
          anchor0: live,
        };
    this.run = new CastRun(record, mod, { W: this.dom.canvas.width, H: this.dom.canvas.height });
    this.run.begin(now);
    this.castKey = `${record.id}-${Math.round(now)}`;
    this.gate.beginCast();
    this.audio.play(domainId, this.run.state, { reduced: !!record.reduced });
    this.lastCastDomain = domainId;
    this.setMode('cast', { focus: false });
    const d = domainById(domainId);
    announce(`${d.title.toLowerCase()} opening${simulated ? ' (simulation)' : ''}.`);
  }

  endCast(now) {
    const run = this.run;
    const simulated = !!run.record.simulated;
    if (!run.replay) this.lastRecord = run.snapshot();
    this.run = null;
    this.gate.castFinished(now);
    if (this.rec.phase === 'recording') this.rec.stopAt = now + 1000;
    this.setMode(simulated ? 'sim' : 'result', { focus: false });
  }

  abortCast() {
    if (!this.run) return;
    this.run = null;
    this.audio.stopAll();
    this.gate.reset();
  }

  replay() {
    if (!this.lastRecord || this.run) return;
    this.startCast(this.lastRecord.domainId, performance.now(), { replay: this.lastRecord });
  }

  // ---------- simulation ----------
  openSimulation() {
    this.audio.unlock();
    this.setMode('sim');
  }

  previewSim(domainId) {
    if (this.run) return;
    this.simDomain = domainId;
    this.startCast(domainId, performance.now(), { simulated: true });
  }

  // ---------- capture: PNG + clip ----------
  saveImage() {
    const usePeak = this.mode === 'result' && this.peakDomain;
    const src = usePeak ? this.peak : this.dom.canvas;
    const name = usePeak ? this.peakDomain : this.mode === 'sim' ? 'simulation' : 'stage';
    src.toBlob((blob) => {
      if (!blob) {
        this.notice('This browser could not encode the PNG.');
        return;
      }
      downloadBlob(blob, `domain-permit-${name}-${stampForFilename()}.png`);
      announce(`Saved ${src.width} by ${src.height} PNG.`);
    }, 'image/png');
  }

  startRecording({ replay = false } = {}) {
    if (this.rec.phase !== 'idle' || this.run) return;
    if (!this.recorder.supported) {
      this.notice('This browser cannot record video from the canvas. Use Save image for a full-resolution PNG instead.', 9000);
      return;
    }
    this.audio.unlock();
    this.clip = null;
    this.rec = { phase: 'countdown', end: performance.now() + 3000, replay, mode: this.mode };
    this.gate.lock();
    renderStageUi(this);
    renderPanel(this);
    announce('Recording in 3 seconds.');
  }

  tickRecording(now) {
    const r = this.rec;
    if (r.phase === 'countdown') {
      if (now >= r.end) {
        try {
          this.recorder.start();
        } catch (e) {
          this.rec = { phase: 'idle' };
          this.gate.unlock(now, { requireRelease: false });
          this.notice(`Recording failed to start: ${e.message}`);
          return;
        }
        this.rec = { phase: 'recording', startedAt: now, until: now + 20000, replay: r.replay, mode: r.mode };
        announce('Recording.');
        if (r.replay && this.lastRecord) this.replay();
        else if (r.mode === 'sim') this.previewSim(this.simDomain);
        else this.gate.unlock(now, { requireRelease: false });
        renderPanel(this);
      }
      renderStageUi(this);
    } else if (r.phase === 'recording') {
      if (r.stopAt && now >= r.stopAt) {
        this.finishRecording();
      } else if (!r.stopAt && !this.run && now > r.until) {
        this.cancelRecording('No cast in 20 seconds, so the recording was discarded.');
      }
    }
  }

  async finishRecording() {
    this.rec = { phase: 'saving' };
    renderStageUi(this);
    try {
      const clip = await this.recorder.stop();
      clip.domain = this.lastCastDomain || 'cast';
      this.clip = clip;
      announce(`Clip ready: ${(clip.durationMs / 1000).toFixed(1)} s ${clip.ext.toUpperCase()}${clip.hasAudio ? ' with sound' : ', silent'}.`);
    } catch (e) {
      this.notice(`Recording failed: ${e.message || e}`);
    }
    this.rec = { phase: 'idle' };
    this.renderAll();
  }

  cancelRecording(message = null) {
    if (this.rec.phase === 'recording') this.recorder.cancel();
    const was = this.rec.phase;
    this.rec = { phase: 'idle' };
    if (was !== 'idle') {
      if (this.cameraOn && !this.run) this.gate.unlock(performance.now(), { requireRelease: false });
      if (message) this.notice(message);
      this.renderAll();
    }
  }

  saveClip() {
    if (!this.clip) return;
    downloadBlob(this.clip.blob, `domain-permit-${this.clip.domain}-${stampForFilename()}.${this.clip.ext}`);
    announce(`Saved ${this.clip.ext.toUpperCase()} clip.`);
  }

  // ---------- header toggles ----------
  toggleMute() {
    this.settings.muted = !this.settings.muted;
    this.audio.setMuted(this.settings.muted);
    this.saveSettings();
    renderHeader(this);
    announce(this.settings.muted ? 'Sound off.' : 'Sound on.');
  }

  toggleEffects() {
    this.settings.effects = this.low ? 'high' : 'low';
    this.saveSettings();
    renderHeader(this);
    announce(`Effects ${this.settings.effects}.`);
  }

  cycleMotion() {
    const order = ['auto', 'reduced', 'full'];
    this.settings.motion = order[(order.indexOf(this.settings.motion) + 1) % order.length];
    this.saveSettings();
    renderHeader(this);
    this.renderAll();
    announce(`Motion: ${this.settings.motion}${this.settings.motion === 'auto' ? (this.reduced ? ' (reduced, from your system)' : ' (full, from your system)') : ''}.`);
  }

  openDataDialog() {
    renderDataDialog(this);
    if (typeof this.dom.dialog.showModal === 'function') this.dom.dialog.showModal();
    else this.dom.dialog.setAttribute('open', '');
  }

  // ---------- test hooks (?debug=1 only) ----------
  freezeCastAt(seconds) {
    if (!this.debug || !this.run || this.run.startedAt === null) return false;
    this.clockOverride = this.run.startedAt + seconds * 1000;
    return true;
  }

  releaseClock() {
    if (!this.debug || this.clockOverride === null) return;
    const shift = performance.now() - this.clockOverride;
    if (this.run && this.run.startedAt !== null) this.run.startedAt += shift;
    this.clockOverride = null;
  }

  // ---------- lifecycle ----------
  onVisibility() {
    if (document.hidden) {
      if (this.rec.phase === 'recording' || this.rec.phase === 'countdown') this.cancelRecording('Recording stopped because the tab was hidden.');
      this.audio.ctx && this.audio.ctx.suspend && this.audio.ctx.suspend().catch(() => {});
    } else {
      this.hand.lastAt = 0;
      this.segWatch = null;
      this.gate.reset();
      if (this.mode === 'teach' || this.mode === 'negatives' || this.mode === 'test') this.gate.lock();
      if (this.teach && this.teach.capture) this.teach.capture.reset();
      this.audio.ctx && this.audio.ctx.resume && this.audio.ctx.resume().catch(() => {});
    }
  }

  shutdown() {
    cancelAnimationFrame(this.raf);
    this.cancelRecording();
    stopStream(this.cam.stream);
    this.tracker.close();
  }
}

export { DOMAINS, DOMAIN_IDS };
