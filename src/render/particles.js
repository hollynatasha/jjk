// WebGL particle layer with a bloom pass, composited over the stage. The motes
// run off the cast clock and drift toward the hand anchor.
//
// three.js and its post-processing passes are MIT. The fields, their motion and
// the per-domain palettes are this project's.
//
// No WebGL means ok stays false and the stage skips the layer entirely.

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

/** How each domain's field behaves. Colours are linear RGB triplets. */
export const FIELDS = {
  'unlimited-void': {
    count: 420,
    mode: 'burst',
    speed: [0.35, 1.5],
    size: [1.6, 5.5],
    colours: [[1, 0.18, 0.42], [0.42, 0.17, 1], [0.84, 0.77, 1], [1, 1, 1]],
    bloom: 1.25,
  },
  'malevolent-shrine': {
    count: 380,
    mode: 'rise',
    speed: [0.12, 0.55],
    size: [1.4, 4.4],
    colours: [[1, 0.47, 0.16], [1, 0.72, 0.36], [0.85, 0.2, 0.08]],
    bloom: 1.0,
  },
  'chimera-shadow-garden': {
    count: 420,
    mode: 'swirl',
    speed: [0.2, 0.8],
    size: [1.3, 4],
    colours: [[0.36, 1, 0.68], [0.43, 0.83, 1], [0.16, 0.42, 1]],
    bloom: 1.15,
  },
};

const rand = (a, b) => a + Math.random() * (b - a);

/** Soft round dot, so a particle reads as light and not a square pixel. */
function moteTexture() {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.75)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.22)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

export class ParticleLayer {
  constructor(W, H) {
    this.ok = false;
    this.W = W;
    this.H = H;
    this.fieldId = null;
    // built clouds, keyed by domain and detail. uploading one to the GPU costs
    // a frame, so build once and swap in afterwards
    this.fields = new Map();
    try {
      this.canvas = document.createElement('canvas');
      this.canvas.width = W;
      this.canvas.height = H;
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: false });
      this.renderer.setClearColor(0x000000, 0);
      this.scene = new THREE.Scene();
      // orthographic so particle coordinates stay in stage pixels
      this.camera = new THREE.OrthographicCamera(0, W, 0, H, -1000, 1000);
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 1.0, 0.8, 0.1);
      this.composer.addPass(this.bloom);
      this.ok = true;
    } catch {
      this.ok = false;
    }
  }

  resize(W, H) {
    if (!this.ok || (this.W === W && this.H === H)) return;
    this.W = W;
    this.H = H;
    this.canvas.width = W;
    this.canvas.height = H;
    this.renderer.setSize(W, H, false);
    this.composer.setSize(W, H);
    this.camera.right = W;
    this.camera.bottom = H;
    this.camera.updateProjectionMatrix();
    // Spawn positions are in stage pixels, so every cached cloud is now stale.
    const active = this.fieldId;
    this.clearFields();
    if (active) this.build(active, this.low);
  }

  clearFields() {
    for (const bundle of this.fields.values()) {
      this.scene.remove(bundle.points);
      bundle.points.geometry.dispose();
      bundle.points.material.dispose();
    }
    this.fields.clear();
    this.points = null;
    this.fieldId = null;
  }

  /** Builds the point cloud for a domain. Safe to call on every cast. */
  build(animationId, low = false) {
    if (!this.ok) return;
    const spec = FIELDS[animationId] || FIELDS['unlimited-void'];
    const key = `${animationId}|${low ? 'low' : 'high'}`;
    this.fieldId = animationId;
    this.low = low;
    this.spec = spec;
    this.bloom.strength = spec.bloom * (low ? 0.6 : 1);
    const cached = this.fields.get(key);
    if (cached) {
      if (this.points && this.points !== cached.points) this.points.visible = false;
      this.points = cached.points;
      this.state = cached.state;
      this.points.visible = true;
      // reuse the buffers but not the motion: a cast opens on a fresh field,
      // otherwise a burst resumes mid-flight from the previous cast
      const attr = this.points.geometry.attributes;
      for (let i = 0; i < this.state.n; i++) this.spawn(i, attr.position.array, attr.color.array, attr.size.array, true);
      attr.position.needsUpdate = true;
      attr.color.needsUpdate = true;
      attr.size.needsUpdate = true;
      return;
    }
    const n = Math.round(spec.count * (low ? 0.35 : 1));
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const siz = new Float32Array(n);
    this.state = {
      n,
      vx: new Float32Array(n),
      vy: new Float32Array(n),
      born: new Float32Array(n),
      life: new Float32Array(n),
      seed: new Float32Array(n),
      hue: new Float32Array(n * 3),
    };
    for (let i = 0; i < n; i++) this.spawn(i, pos, col, siz, true);
    if (this.points) this.points.visible = false;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(siz, 1));
    if (!this.mote) this.mote = moteTexture();
    const mat = new THREE.PointsMaterial({
      size: 9,
      map: this.mote,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: false,
    });
    this.points = new THREE.Points(geo, mat);
    this.scene.add(this.points);
    this.fields.set(key, { points: this.points, state: this.state });
  }

  /** Puts one particle at its start position, per the field's mode. */
  spawn(i, pos, col, siz, initial = false) {
    const { W, H, spec, state } = this;
    const c = spec.colours[(Math.random() * spec.colours.length) | 0];
    const sp = rand(spec.speed[0], spec.speed[1]);
    let x;
    let y;
    let vx;
    let vy;
    if (spec.mode === 'burst') {
      const a = Math.random() * Math.PI * 2;
      const r = initial ? Math.random() * Math.hypot(W, H) * 0.5 : rand(H * 0.04, H * 0.22);
      x = W / 2 + Math.cos(a) * r;
      y = H * 0.46 + Math.sin(a) * r;
      vx = Math.cos(a) * sp * 260;
      vy = Math.sin(a) * sp * 260;
    } else if (spec.mode === 'rise') {
      x = rand(-20, W + 20);
      y = initial ? rand(0, H) : rand(H * 0.6, H + 20);
      vx = rand(-18, 18);
      vy = -sp * 150;
    } else if (spec.mode === 'swirl') {
      const a = Math.random() * Math.PI * 2;
      const r = rand(H * 0.05, H * 0.6);
      x = W / 2 + Math.cos(a) * r;
      y = H * 0.3 + Math.sin(a) * r * 0.6;
      vx = -Math.sin(a) * sp * 90;
      vy = Math.cos(a) * sp * 60 - sp * 40;
    } else {
      x = rand(0, W);
      y = initial ? rand(0, H) : rand(-20, H);
      vx = rand(-30, 30) * sp;
      vy = rand(-40, 10) * sp;
    }
    pos[i * 3] = x;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = 0;
    state.hue[i * 3] = c[0];
    state.hue[i * 3 + 1] = c[1];
    state.hue[i * 3 + 2] = c[2];
    col[i * 3] = c[0];
    col[i * 3 + 1] = c[1];
    col[i * 3 + 2] = c[2];
    siz[i] = rand(spec.size[0], spec.size[1]);
    state.vx[i] = vx;
    state.vy[i] = vy;
    state.born[i] = 0;
    state.life[i] = rand(1.1, 3.4);
    state.seed[i] = Math.random() * Math.PI * 2;
  }

  /** t is the cast clock in seconds, anchor the hand midpoint in stage pixels. Fields drift toward it. */
  update(dt, t, anchor) {
    if (!this.ok || !this.points) return;
    const { state, spec, W, H } = this;
    const pos = this.points.geometry.attributes.position.array;
    const col = this.points.geometry.attributes.color.array;
    const siz = this.points.geometry.attributes.size.array;
    const ax = anchor ? anchor[0] : W / 2;
    const ay = anchor ? anchor[1] : H * 0.45;
    const step = Math.min(0.05, dt);
    for (let i = 0; i < state.n; i++) {
      state.born[i] += step;
      let x = pos[i * 3] + state.vx[i] * step;
      let y = pos[i * 3 + 1] + state.vy[i] * step;
      if (spec.mode === 'burst') {
        // the burst accelerates away from the hands as the cast opens
        const dx = x - ax;
        const dy = y - ay;
        const d = Math.hypot(dx, dy) || 1;
        state.vx[i] += (dx / d) * 110 * step;
        state.vy[i] += (dy / d) * 110 * step;
      } else if (spec.mode === 'swirl') {
        const dx = x - ax;
        const dy = y - ay;
        state.vx[i] += -dy * 0.35 * step;
        state.vy[i] += dx * 0.35 * step - 26 * step;
      } else if (spec.mode === 'rise') {
        state.vx[i] += Math.sin(t * 1.4 + state.seed[i]) * 26 * step;
      }
      const dead = state.born[i] > state.life[i] || x < -40 || x > W + 40 || y < -40 || y > H + 40;
      if (dead) {
        this.spawn(i, pos, col, siz);
        continue;
      }
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      // fade over the particle's life by scaling its colour, which additive
      // blending reads as brightness
      const k = Math.sin((state.born[i] / state.life[i]) * Math.PI);
      const fade = (0.2 + 0.8 * k) * 0.55;
      const base = i * 3;
      col[base] = state.hue[base] * fade;
      col[base + 1] = state.hue[base + 1] * fade;
      col[base + 2] = state.hue[base + 2] * fade;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }

  render() {
    if (!this.ok || !this.points) return null;
    this.composer.render();
    return this.canvas;
  }

  dispose() {
    if (!this.ok) return;
    this.clearFields();
    this.renderer.dispose();
    this.ok = false;
  }
}
