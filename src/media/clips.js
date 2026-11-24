// Pre-rendered domain backdrops. The files in public/domains/ come out of the
// Remotion project in remotion/, where blur stacks and hundreds of layers cost
// nothing. A clip only ever replaces the backdrop: hands, charge, person cutout
// and titles are still drawn live. All optional, so a file that is missing,
// will not decode, or will not play just means the domain draws its own world.

const BASE = 'domains';

export class ClipLibrary {
  constructor(enabled = true) {
    this.enabled = enabled;
    this.clips = new Map();
  }

  /** Starts loading a clip. Safe to call repeatedly. */
  prepare(animationId) {
    if (!this.enabled || !animationId || this.clips.has(animationId)) return this.clips.get(animationId) || null;
    const el = document.createElement('video');
    const clip = { el, ready: false, failed: false, playing: false, bitmapOk: typeof createImageBitmap === 'function' };
    el.src = `${BASE}/${animationId}.mp4`;
    el.muted = true;
    el.loop = false;
    el.playsInline = true;
    el.preload = 'auto';
    el.addEventListener('canplaythrough', () => {
      clip.ready = true;
    }, { once: true });
    // Copy each decoded frame once instead of sampling the <video> every
    // animation frame; drawing a video mid-update can tear.
    const copyFrame = () => {
      if (clip.failed) return;
      const w = el.videoWidth;
      const h = el.videoHeight;
      if (!w || !h) return;
      // createImageBitmap snapshots the decoded frame atomically. drawImage on
      // a playing <video> reads the decoder's surface live, and on a hardware
      // decode path it catches that surface mid-presentation: horizontal bands
      // each holding a different moment of the clip. Copying into a canvas does
      // not help, the copy is what tears, so the snapshot has to be at source.
      if (clip.bitmapOk) {
        if (clip.bitmapPending) return;
        clip.bitmapPending = true;
        createImageBitmap(el).then(
          (bmp) => {
            clip.bitmapPending = false;
            if (clip.failed) {
              bmp.close();
              return;
            }
            if (clip.bitmap) clip.bitmap.close();
            clip.bitmap = bmp;
            clip.hasFrame = true;
          },
          () => {
            // one failure is a hiccup; a browser that never manages it drops
            // to the canvas copy for the rest of the session
            clip.bitmapPending = false;
            clip.bitmapFails = (clip.bitmapFails || 0) + 1;
            if (clip.bitmapFails > 3) clip.bitmapOk = false;
          },
        );
        return;
      }
      if (!clip.frame) {
        clip.frame = document.createElement('canvas');
        clip.frameCtx = clip.frame.getContext('2d', { alpha: false });
      }
      if (clip.frame.width !== w || clip.frame.height !== h) {
        clip.frame.width = w;
        clip.frame.height = h;
      }
      clip.frameCtx.drawImage(el, 0, 0);
      clip.hasFrame = true;
    };
    if (typeof el.requestVideoFrameCallback === 'function') {
      const pump = () => {
        if (clip.failed) return;
        copyFrame();
        el.requestVideoFrameCallback(pump);
      };
      el.requestVideoFrameCallback(pump);
    } else {
      // no requestVideoFrameCallback: copy once per animation frame instead,
      // same work at a coarser cadence
      const pump = () => {
        if (clip.failed) return;
        if (clip.playing) copyFrame();
        requestAnimationFrame(pump);
      };
      requestAnimationFrame(pump);
    }
    el.addEventListener('error', () => {
      clip.failed = true;
    }, { once: true });
    this.clips.set(animationId, clip);
    return clip;
  }

  get(animationId) {
    const clip = this.clips.get(animationId);
    return clip && clip.ready && !clip.failed ? clip : null;
  }

  /** Rewinds and plays the clip for a cast; returns it if it is usable. */
  start(animationId) {
    const clip = this.get(animationId);
    if (!clip) return null;
    try {
      clip.el.currentTime = 0;
      const p = clip.el.play();
      if (p && p.catch) p.catch(() => { clip.failed = true; });
      clip.playing = true;
    } catch {
      clip.failed = true;
      return null;
    }
    return clip;
  }

  /**
   * Keeps a playing clip on the cast's clock. Playback drifts from the
   * animation clock whenever a frame is late, and the backdrop reads as
   * lagging behind the live effects.
   *
   * Correction is a playback-rate nudge. A seek is the last resort: it flushes
   * the decoder, which then has to run forward from the previous keyframe
   * before it can present anything, and meanwhile the compositor can show a
   * half-decoded frame. Seeking on small drift turns one late frame into a
   * seek storm, every frame a seek, backdrop in blocks. Hence the wide
   * threshold and the 1 s cooldown.
   */
  sync(animationId, t) {
    const clip = this.get(animationId);
    if (!clip || !clip.playing) return;
    const el = clip.el;
    const duration = el.duration || 0;
    if (!duration) return;
    const want = Math.max(0, Math.min(t, duration - 0.05));
    const drift = want - el.currentTime;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (Math.abs(drift) > 0.9 && now - (clip.lastSeek || 0) > 1000) {
      try {
        el.currentTime = want;
        el.playbackRate = 1;
        clip.lastSeek = now;
      } catch {
        /* a seek that will not seek is not worth an error */
      }
      return;
    }
    el.playbackRate = Math.max(0.75, Math.min(1.35, 1 + drift * 0.7));
  }

  stop() {
    for (const clip of this.clips.values()) {
      if (!clip.playing) continue;
      clip.playing = false;
      try {
        clip.el.pause();
      } catch {
        /* a paused video that will not pause is not worth an error */
      }
      // the last snapshot holds a decoded frame open, and idle clips sitting
      // on one are memory nothing is going to read
      if (clip.bitmap) {
        clip.bitmap.close();
        clip.bitmap = null;
        clip.hasFrame = false;
      }
    }
  }
}

/** Draws a clip frame the way `object-fit: cover` would: fill the stage, crop the overflow. */
export function drawClipCover(g, clip, W, H, zoom = 1) {
  const el = clip && clip.el ? clip.el : clip;
  if (!el) return false;
  // Only ever the copied frame. Reading a playing <video> here catches it
  // mid-update and tears the backdrop into offset blocks. No copy yet reports
  // false, and the domain draws its own world instead.
  const source = clip && clip.el ? (clip.hasFrame ? clip.bitmap || clip.frame : null) : el;
  if (!source) return false;
  const vw = el.videoWidth;
  const vh = el.videoHeight;
  if (!vw || !vh) return false;
  const scale = Math.max(W / vw, H / vh) * zoom;
  const w = vw * scale;
  const h = vh * scale;
  g.drawImage(source, (W - w) / 2, (H - h) / 2, w, h);
  return true;
}
