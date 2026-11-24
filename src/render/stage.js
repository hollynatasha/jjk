// The export canvas. Camera frame, segmentation, hand traces, charging cues,
// domain worlds and titles all composite here and nowhere else, so the saved
// PNG and the recorded clip hold exactly what the stage showed. UI never draws
// on this canvas.

import { moduleFor, DOMAIN_MODULES } from '../domains/registry.js';
import { phases, anchorsFromHands } from '../domains/engine.js';
import { HAND_CONNECTIONS } from '../handmodel/synthetic.js';
import { applyVideoTransform, computeView, handsToCanvas, toCanvas } from './geometry.js';
import { StandIn } from './standin.js';
import { makeCanvas } from '../media/segmentation.js';
// three.js is big and only a running cast needs it, so it loads in the
// background and gets picked up whenever it lands.
let ParticleLayerClass = null;
let PARTICLE_FIELDS = {};
import('./particles.js')
  .then((m) => {
    ParticleLayerClass = m.ParticleLayer;
    PARTICLE_FIELDS = m.FIELDS;
  })
  .catch(() => {
    ParticleLayerClass = null;
  });
import { TAU, rgba, FONTS, clamp01, ease, polygon } from './draw.js';
import { makeRng } from '../core/rng.js';

const PREVIEW_ORDER = ['gojo', 'sukuna', 'megumi'];

let filterSupport = null;
function canFilter(g) {
  if (filterSupport === null) filterSupport = typeof g.filter === 'string';
  return filterSupport;
}

export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    this.W = canvas.width;
    this.H = canvas.height;
    this.g = canvas.getContext('2d', { alpha: false });
    this.g.imageSmoothingQuality = 'high';
    this.personCanvas = makeCanvas(this.W, this.H);
    this.frozen = makeCanvas(this.W, this.H);
    this.frozenFor = null;
    this.tint = makeCanvas(160, 120);
    this.temps = [];
    this.standIn = new StandIn(this.W, this.H);
    // simulated camera maps into the stand-in's 9:16 box, not the whole stage,
    // or the fake hands sit somewhere other than the fake body
    this.simView = { ...computeView(640, 480, 720, 1280, true), k: this.standIn.k, ox: this.standIn.ox };
    this.previewStates = {};
    this.frameId = 0;
    this.personBuiltFor = -1;
    this.particles = null;
    this.particleFor = null;
    this.lastParticleAt = 0;
  }

  temp(i) {
    while (this.temps.length <= i) this.temps.push(makeCanvas(this.W, this.H));
    return this.temps[i];
  }

  // ---------- sources ----------

  drawRoomLive(g, s) {
    if (s.sim || !s.video) {
      if (s.sim || s.preview) {
        this.standIn.drawBackground(g);
        this.standIn.drawFigure(g, s.hands, s.time);
        return;
      }
      g.fillStyle = '#000';
      g.fillRect(0, 0, this.W, this.H);
      return;
    }
    g.save();
    applyVideoTransform(g, s.view);
    g.drawImage(s.video, 0, 0, s.view.videoW, s.view.videoH);
    g.restore();
  }

  drawRoom(g, s, opts = {}) {
    if (opts.frozen) {
      if (this.frozenFor !== s.castKey) {
        const fg = this.frozen.getContext('2d');
        fg.setTransform(1, 0, 0, 1, 0, 0);
        this.drawRoomLive(fg, s);
        this.frozenFor = s.castKey;
      }
      g.drawImage(this.frozen, 0, 0);
      return;
    }
    this.drawRoomLive(g, s);
  }

  personAvailable(s) {
    if (s.sim || s.preview) return true;
    return !!(s.segOk && s.mask && s.mask.fresh(s.maskNow ?? s.now) && s.video && s.view);
  }

  personCenter(s) {
    if (s.sim || s.preview || !s.mask || !s.mask.bbox) return [this.W / 2, this.H * 0.3];
    const b = s.mask.bbox;
    const top = toCanvas(s.view, (b.x0 + b.x1) / 2 / s.mask.videoW, (b.y0 + (b.y1 - b.y0) * 0.28) / s.mask.videoH);
    return top;
  }

  buildPerson(s) {
    if (this.personBuiltFor === this.frameId) return;
    this.personBuiltFor = this.frameId;
    const pg = this.personCanvas.getContext('2d');
    pg.setTransform(1, 0, 0, 1, 0, 0);
    pg.globalCompositeOperation = 'source-over';
    pg.globalAlpha = 1;
    if (canFilter(pg)) pg.filter = 'none';
    pg.clearRect(0, 0, this.W, this.H);
    if (s.sim || s.preview) {
      this.standIn.drawFigure(pg, s.hands, s.time);
      return;
    }
    pg.save();
    applyVideoTransform(pg, s.view);
    pg.drawImage(s.video, 0, 0, s.view.videoW, s.view.videoH);
    pg.restore();
    pg.globalCompositeOperation = 'destination-in';
    pg.save();
    applyVideoTransform(pg, s.view);
    if (!s.low && canFilter(pg)) pg.filter = 'blur(1.5px)';
    pg.drawImage(s.mask.canvas, 0, 0, s.view.videoW, s.view.videoH);
    pg.restore();
    if (canFilter(pg)) pg.filter = 'none';
    pg.globalCompositeOperation = 'source-over';
  }

  drawPerson(g, s, opts = {}) {
    if (!this.personAvailable(s)) return;
    this.buildPerson(s);
    if (opts.grade && opts.gradeAlpha > 0) {
      const pg = this.personCanvas.getContext('2d');
      pg.globalCompositeOperation = 'source-atop';
      pg.fillStyle = rgba(opts.grade, opts.gradeAlpha);
      pg.fillRect(0, 0, this.W, this.H);
      pg.globalCompositeOperation = 'source-over';
    }
    g.save();
    if (opts.rim && opts.rimBlur) {
      g.shadowColor = opts.rim;
      g.shadowBlur = opts.rimBlur;
    }
    g.globalAlpha = opts.alpha ?? 1;
    g.drawImage(this.personCanvas, 0, 0);
    g.restore();
  }

  drawSilhouette(g, s, opts = {}) {
    const { delayMs = 400, color = '#6fa8ff', alpha = 0.25, dx = 0, dy = 0, scale = 1 } = opts;
    const W = this.W;
    const H = this.H;
    if (s.sim || s.preview) {
      const t = this.temp(1);
      const tg = t.getContext('2d');
      tg.setTransform(1, 0, 0, 1, 0, 0);
      tg.globalCompositeOperation = 'source-over';
      tg.clearRect(0, 0, W, H);
      this.standIn.drawFigure(tg, s.hands, s.time - delayMs / 1000);
      tg.globalCompositeOperation = 'source-atop';
      tg.fillStyle = color;
      tg.fillRect(0, 0, W, H);
      tg.globalCompositeOperation = 'source-over';
      g.save();
      g.globalAlpha = alpha;
      g.translate(W / 2 + dx, H / 2 + dy);
      g.scale(scale, scale);
      g.translate(-W / 2, -H / 2);
      g.drawImage(t, 0, 0);
      g.restore();
      return;
    }
    if (!s.mask || !s.view) return;
    const m = s.mask.at(s.maskNow ?? s.now, delayMs);
    if (!m) return;
    const tc = this.tint;
    if (tc.width !== m.width || tc.height !== m.height) {
      tc.width = m.width;
      tc.height = m.height;
    }
    const tg = tc.getContext('2d');
    tg.globalCompositeOperation = 'source-over';
    tg.clearRect(0, 0, tc.width, tc.height);
    tg.fillStyle = color;
    tg.fillRect(0, 0, tc.width, tc.height);
    tg.globalCompositeOperation = 'destination-in';
    tg.drawImage(m, 0, 0);
    tg.globalCompositeOperation = 'source-over';
    g.save();
    g.globalAlpha = alpha;
    g.translate(W / 2 + dx, H / 2 + dy);
    g.scale(scale, scale);
    g.translate(-W / 2, -H / 2);
    applyVideoTransform(g, s.view);
    g.drawImage(tc, 0, 0, s.view.videoW, s.view.videoH);
    g.restore();
  }

  /** Effects overlay mode: the live camera shown through a window in the world. */
  drawPortal(g, s, o) {
    const W = this.W;
    const H = this.H;
    const T = this.temp(2);
    const tg = T.getContext('2d');
    tg.setTransform(1, 0, 0, 1, 0, 0);
    tg.globalCompositeOperation = 'source-over';
    tg.globalAlpha = 1;
    tg.clearRect(0, 0, W, H);
    this.drawRoomLive(tg, s);
    if (o.grade && o.gradeAlpha) {
      tg.globalCompositeOperation = 'source-atop';
      tg.fillStyle = rgba(o.grade, o.gradeAlpha);
      tg.fillRect(0, 0, W, H);
    }
    tg.globalCompositeOperation = 'destination-in';
    tg.fillStyle = '#fff';
    const { cx, cy, rx, ry } = o;
    if (o.edge === 'rect') {
      tg.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
    } else if (o.edge === 'torn' || o.edge === 'liquid') {
      const pts = [];
      const n = 72;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        const j = o.edge === 'torn' ? 1 + (((Math.sin(i * 12.9898) * 43758.5453) % 1) + 1) % 1 * 0.07 - 0.035 : 1 + Math.sin(a * 5 + (o.t || 0) * 2) * 0.025 + Math.sin(a * 9 - (o.t || 0) * 1.3) * 0.015;
        pts.push([cx + Math.cos(a) * rx * j, cy + Math.sin(a) * ry * j]);
      }
      polygon(tg, pts);
      tg.fill();
    } else {
      tg.save();
      tg.translate(cx, cy);
      tg.scale(1, ry / rx);
      const gr = tg.createRadialGradient(0, 0, 0, 0, 0, rx);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(clamp01(1 - (o.feather || 40) / rx), 'rgba(255,255,255,1)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      tg.fillStyle = gr;
      tg.beginPath();
      tg.arc(0, 0, rx, 0, TAU);
      tg.fill();
      tg.restore();
    }
    tg.globalCompositeOperation = 'source-over';
    g.save();
    g.globalAlpha = o.alpha ?? 1;
    g.drawImage(T, 0, 0);
    g.restore();
  }

  // ---------- hand feedback ----------

  drawHands(g, s) {
    if (!s.hands || !s.hands.length) return;
    for (const h of s.hands) {
      const a = h.alpha ?? 1;
      if (a <= 0.02) continue;
      g.save();
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.strokeStyle = `rgba(111,239,255,${(0.7 * a).toFixed(3)})`;
      g.lineWidth = s.teach ? 2.6 : 2;
      if (!s.low) {
        g.shadowColor = 'rgba(111,239,255,0.75)';
        g.shadowBlur = 8;
      }
      g.beginPath();
      for (const [i, j] of HAND_CONNECTIONS) {
        g.moveTo(h.pts[i][0], h.pts[i][1]);
        g.lineTo(h.pts[j][0], h.pts[j][1]);
      }
      g.stroke();
      g.shadowBlur = 0;
      const r = s.teach ? 4.2 : 2.6;
      g.fillStyle = `rgba(232,252,255,${(0.92 * a).toFixed(3)})`;
      for (let k = 0; k < h.pts.length; k++) {
        const p = h.pts[k];
        g.beginPath();
        g.arc(p[0], p[1], [4, 8, 12, 16, 20].includes(k) ? r * 1.25 : r, 0, TAU);
        g.fill();
      }
      g.restore();
    }
  }

  // ---------- frame ----------

  render(now, s) {
    this.frameId += 1;
    const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.shadowBlur = 0;
    s.now = now;
    s.time = now / 1000;
    if (s.preview) {
      this.renderPreview(g, s);
    } else if (s.cast) {
      this.renderCast(g, s);
    } else {
      this.drawRoomLive(g, s);
      if (s.showHands) this.drawHands(g, s);
      if (s.charge && s.hands && s.hands.length) {
        const a = anchorsFromHands(s.hands);
        if (a) moduleFor(s.charge.domain).charge(g, { a, low: s.low, reduced: s.reduced, W: this.W, H: this.H }, s.charge.p, s.time);
      }
    }
    if (s.cast) this.credit(g);
    if (s.sim) this.watermark(g);
  }

  // Signature in the corner of every cast. In the stage composite rather than
  // the page chrome, so it rides along on the PNG and the clip, which are the
  // things that leave the browser.
  credit(g) {
    g.save();
    g.font = `500 13px ${FONTS.mono}`;
    g.textBaseline = 'alphabetic';
    g.textAlign = 'right';
    const x = this.W - 20;
    const y = this.H - 18;
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillText('@hollynst', x + 1, y + 1);
    g.fillStyle = 'rgba(236,231,219,0.62)';
    g.fillText('@hollynst', x, y);
    g.restore();
  }

  renderCast(g, s) {
    const run = s.cast;
    const t = run.t(s.now);
    if (s.clips) s.clips.sync(run.module.id, t);
    const ph = phases(t, !!run.record.reduced);
    const live = s.hands && s.hands.length ? anchorsFromHands(s.hands) : null;
    const a = run.anchors(s.now, live) || anchorsFromHands(handsToCanvas(this.standIn.frameFor(run.record.domainId, 0), this.simView));
    const f = this.env(s, {
      t,
      ph,
      a,
      a0: run.anchor0 || a,
      low: !!run.record.low,
      reduced: !!run.record.reduced,
      hist: (d) => run.anchorsAtTime(t - d),
    });
    this.particleCall = (gg) => this.drawParticles(gg, run, s, t, a);
    run.module.render(g, run.state, f);
    // a domain that never called f.particles gets them over the top anyway
    if (this.particleCall) this.particleCall(g);
    this.particleCall = null;
  }

  /**
   * Builds the particle layer and one point cloud per domain before the first
   * cast needs it. Building a cloud mid-cast costs a visible frame.
   */
  prewarmParticles(low = false) {
    if (this.particlesWarm || !ParticleLayerClass) return this.particlesWarm === true;
    if (!this.particles) {
      this.particles = new ParticleLayerClass(this.W, this.H);
      if (!this.particles.ok) {
        this.particlesWarm = true;
        return true;
      }
    }
    // render each cloud once so the buffers reach the GPU and the shaders
    // compile here, off-cast, not on the first frame that shows them
    for (const id of Object.keys(PARTICLE_FIELDS)) {
      this.particles.build(id, low);
      this.particles.render();
    }
    this.particles.build('unlimited-void', low);
    this.particleFor = 'unlimited-void';
    this.particlesWarm = true;
    return true;
  }

  drawParticles(g, run, s, t, a) {
    if (s.low && s.reduced) return;
    if (!this.particles) {
      if (!ParticleLayerClass) return;
      this.particles = new ParticleLayerClass(this.W, this.H);
      if (!this.particles.ok) return;
    }
    const layer = this.particles;
    if (!layer.ok) return;
    layer.resize(this.W, this.H);
    const id = run.module.id;
    if (this.particleFor !== id || !layer.points) {
      layer.build(id, !!s.low);
      this.particleFor = id;
    }
    const dt = this.lastParticleAt ? Math.min(0.06, Math.max(0, t - this.lastParticleAt)) : 1 / 60;
    this.lastParticleAt = t;
    layer.update(dt, t, a ? a.mid : null);
    const canvas = layer.render();
    if (!canvas) return;
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.85;
    g.drawImage(canvas, 0, 0, this.W, this.H);
    g.restore();
  }

  env(s, extra) {
    return {
      W: this.W,
      H: this.H,
      room: { draw: (gg, o) => this.drawRoom(gg, s, o) },
      person: {
        available: this.personAvailable(s),
        center: this.personCenter(s),
        draw: (gg, o) => this.drawPerson(gg, s, o),
        silhouette: (gg, o) => this.drawSilhouette(gg, s, o),
      },
      portalRoom: (gg, o) => this.drawPortal(gg, s, o),
      temp: (i) => this.temp(i),
      // domains call this where the particle field belongs in their own stack,
      // behind the performer
      particles: (gg) => {
        const call = this.particleCall;
        this.particleCall = null;
        if (call) call(gg);
      },
      clip: s.clip || null,
      overlay: !this.personAvailable(s),
      ...extra,
    };
  }

  /** Landing loop: PREVIEW_ORDER in two seconds, eight with reduced motion, stand-in performer. */
  renderPreview(g, s) {
    const loop = s.reduced ? 8 : 2;
    const slot = loop / PREVIEW_ORDER.length;
    const fade = s.reduced ? 0.6 : 0.16;
    const tau = s.time % loop;
    const idx = Math.min(PREVIEW_ORDER.length - 1, Math.floor(tau / slot));
    const local = tau - idx * slot;
    const cur = PREVIEW_ORDER[idx];
    this.previewFrame(g, s, cur, 2.4 + local * 0.8);
    if (local > slot - fade) {
      const nxt = PREVIEW_ORDER[(idx + 1) % PREVIEW_ORDER.length];
      const T = this.temp(3);
      const tg = T.getContext('2d');
      tg.setTransform(1, 0, 0, 1, 0, 0);
      this.previewFrame(tg, s, nxt, 2.4);
      g.save();
      g.globalAlpha = ease.inOut((local - (slot - fade)) / fade);
      g.drawImage(T, 0, 0);
      g.restore();
    }
  }

  previewFrame(g, s, domainId, t) {
    const mod = DOMAIN_MODULES[domainId];
    if (!this.previewStates[domainId]) this.previewStates[domainId] = mod.init(makeRng(`preview-${domainId}`).fork('init'), { W: this.W, H: this.H, low: true, reduced: false });
    const hands = handsToCanvas(this.standIn.frameFor(domainId, s.time), this.simView);
    const ps = { ...s, hands, preview: true };
    this.frameId += 1;
    const a = anchorsFromHands(hands);
    const f = this.env(ps, { t, ph: phases(t, false), a, a0: a, low: true, reduced: false, hist: () => a });
    mod.render(g, this.previewStates[domainId], f);
  }

  watermark(g) {
    g.save();
    g.translate(26, 34);
    g.rotate(-0.04);
    g.strokeStyle = 'rgba(255,90,60,0.9)';
    g.lineWidth = 2;
    g.strokeRect(0, 0, 330, 56);
    g.fillStyle = 'rgba(255,90,60,0.9)';
    g.font = `700 22px ${FONTS.mono}`;
    g.textBaseline = 'top';
    g.fillText('SIMULATION', 14, 8);
    g.font = `500 12px ${FONTS.mono}`;
    g.fillText('stand-in · no hand recognition', 14, 34);
    g.restore();
  }

  // copy of the current composite, for the peak-frame PNG
  snapshot(target) {
    const tg = target.getContext('2d');
    tg.setTransform(1, 0, 0, 1, 0, 0);
    tg.drawImage(this.canvas, 0, 0);
    return target;
  }
}
