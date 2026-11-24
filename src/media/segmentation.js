// Image Segmenter confidence masks to a small feathered alpha mask, smoothed
// over time, plus a short history for the delayed-silhouette effect. In memory
// only, never stored.

export class PersonMask {
  constructor({ width = 160 } = {}) {
    this.mw = width;
    this.mh = Math.round((width * 3) / 4);
    this.canvas = makeCanvas(this.mw, this.mh);
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: false });
    this.smooth = null;
    this.available = false;
    this.lastUpdate = 0;
    this.history = [];
    this.pool = [];
    this.videoW = 640;
    this.videoH = 480;
    this.bbox = null;
  }

  reset() {
    this.available = false;
    this.smooth = null;
    this.history = [];
    this.bbox = null;
  }

  /** mask: Float32Array (w*h) of person probability, row-major, raw video orientation (not mirrored). */
  update(mask, w, h, now) {
    const mw = this.mw;
    const mh = Math.max(1, Math.round((mw * h) / w));
    if (mh !== this.mh) {
      this.mh = mh;
      this.canvas = makeCanvas(mw, mh);
      this.ctx = this.canvas.getContext('2d');
      this.smooth = null;
      this.history = [];
    }
    this.videoW = w;
    this.videoH = h;
    const n = mw * mh;
    if (!this.smooth || this.smooth.length !== n) this.smooth = new Float32Array(n);
    const sx = w / mw;
    const sy = h / mh;
    const first = !this.available;
    let minX = mw;
    let minY = mh;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < mh; y++) {
      const y0 = Math.floor(y * sy);
      const y1 = Math.min(h, Math.floor((y + 1) * sy));
      for (let x = 0; x < mw; x++) {
        const x0 = Math.floor(x * sx);
        const x1 = Math.min(w, Math.floor((x + 1) * sx));
        let s = 0;
        let c = 0;
        for (let yy = y0; yy < y1; yy += 2) {
          const row = yy * w;
          for (let xx = x0; xx < x1; xx += 2) {
            s += mask[row + xx];
            c++;
          }
        }
        const v = c ? s / c : 0;
        const i = y * mw + x;
        this.smooth[i] = first ? v : this.smooth[i] * 0.4 + v * 0.6;
        if (this.smooth[i] > 0.5) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    const img = this.ctx.createImageData(mw, mh);
    const d = img.data;
    for (let i = 0; i < n; i++) {
      const p = this.smooth[i];
      const a = p <= 0.3 ? 0 : p >= 0.72 ? 1 : ((p - 0.3) / 0.42) ** 2 * (3 - 2 * ((p - 0.3) / 0.42));
      d[i * 4] = 255;
      d[i * 4 + 1] = 255;
      d[i * 4 + 2] = 255;
      d[i * 4 + 3] = Math.round(a * 255);
    }
    this.ctx.putImageData(img, 0, 0);
    this.bbox = maxX >= 0 ? { x0: (minX / mw) * w, y0: (minY / mh) * h, x1: ((maxX + 1) / mw) * w, y1: ((maxY + 1) / mh) * h } : null;
    this.available = true;
    this.lastUpdate = now;
    // keep ~1.2 s of history for delayed silhouettes
    const snap = this.pool.pop() || makeCanvas(mw, mh);
    if (snap.width !== mw || snap.height !== mh) {
      snap.width = mw;
      snap.height = mh;
    }
    const sctx = snap.getContext('2d');
    sctx.clearRect(0, 0, mw, mh);
    sctx.drawImage(this.canvas, 0, 0);
    this.history.push({ t: now, canvas: snap });
    while (this.history.length && now - this.history[0].t > 1200) this.pool.push(this.history.shift().canvas);
  }

  at(now, delayMs) {
    if (!this.history.length) return null;
    const target = now - delayMs;
    let best = this.history[0];
    for (const h of this.history) if (h.t <= target) best = h;
    return best.canvas;
  }

  /** false once segmentation stops producing updates */
  fresh(now, maxAgeMs = 1500) {
    return this.available && now - this.lastUpdate < maxAgeMs;
  }
}

export function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined' && typeof document === 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
