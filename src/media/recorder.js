// MediaRecorder over the composited 9:16 canvas plus the synthesized sound.
// The extension follows the real container, so a WebM is never called .mp4.

// H.264 MP4 first (plays everywhere, uploads to Reels), then WebM. A bare
// "video/mp4" comes last because some Chromium builds fill it with VP9, which
// many players and upload pages reject inside an MP4.
const CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4;codecs=avc1.42E01E,opus',
  'video/mp4;codecs=avc1,opus',
  'video/mp4;codecs=avc1',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4',
];

export function pickMimeType(isSupported = (t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) {
  for (const t of CANDIDATES) {
    try {
      if (isSupported(t)) return t;
    } catch {
      /* keep looking */
    }
  }
  return '';
}

export function extensionFor(mime) {
  const m = (mime || '').toLowerCase();
  if (m.startsWith('video/mp4')) return 'mp4';
  if (m.startsWith('video/webm')) return 'webm';
  if (m.startsWith('video/x-matroska')) return 'mkv';
  if (m.startsWith('video/quicktime')) return 'mov';
  return 'bin';
}

export function recordingSupported(canvas) {
  return typeof MediaRecorder !== 'undefined' && !!canvas && typeof canvas.captureStream === 'function';
}

export class ClipRecorder {
  constructor(canvas, audioDesk) {
    this.canvas = canvas;
    this.audio = audioDesk;
    this.rec = null;
    this.chunks = [];
    this.startedAt = 0;
  }

  get supported() {
    return recordingSupported(this.canvas);
  }

  get active() {
    return !!this.rec && this.rec.state === 'recording';
  }

  start() {
    if (!this.supported) throw new Error('MediaRecorder or canvas.captureStream is not available in this browser.');
    const stream = this.canvas.captureStream(30);
    const audioTrack = this.audio && this.audio.audioTrack ? this.audio.audioTrack() : null;
    this.hasAudio = !!audioTrack;
    if (audioTrack) stream.addTrack(audioTrack);
    const mimeType = pickMimeType();
    this.requested = mimeType;
    this.rec = mimeType ? new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 }) : new MediaRecorder(stream);
    this.stream = stream;
    this.chunks = [];
    this.rec.ondataavailable = (e) => {
      if (e.data && e.data.size) this.chunks.push(e.data);
    };
    this.rec.start(250);
    this.startedAt = performance.now();
  }

  stop() {
    return new Promise((resolve, reject) => {
      if (!this.rec) {
        reject(new Error('not recording'));
        return;
      }
      const rec = this.rec;
      rec.onstop = () => {
        const mime = rec.mimeType || this.requested || 'video/webm';
        const blob = new Blob(this.chunks, { type: mime.split(';')[0] });
        const durationMs = performance.now() - this.startedAt;
        this.cleanup();
        resolve({ blob, mime, ext: extensionFor(mime), durationMs, hasAudio: this.hasAudio });
      };
      rec.onerror = (e) => {
        this.cleanup();
        reject(e.error || new Error('recording failed'));
      };
      try {
        rec.stop();
      } catch (e) {
        this.cleanup();
        reject(e);
      }
    });
  }

  cancel() {
    if (!this.rec) return;
    try {
      this.rec.onstop = null;
      this.rec.stop();
    } catch {
      /* already stopped */
    }
    this.cleanup();
  }

  cleanup() {
    if (this.stream) {
      // stop the canvas video track only; the audio track belongs to the AudioContext
      for (const t of this.stream.getVideoTracks()) t.stop();
    }
    this.stream = null;
    this.rec = null;
    this.chunks = [];
  }
}

/** Saves a blob locally, then revokes the temporary URL. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function stampForFilename(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
