// Camera access with errors a person can act on. No microphone, ever.

export function cameraSupport() {
  const secure = typeof window !== 'undefined' ? window.isSecureContext !== false : true;
  const media = !!(typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  const wasm = typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function';
  const canvas = typeof HTMLCanvasElement !== 'undefined' && !!HTMLCanvasElement.prototype.getContext;
  return { secure, media, wasm, canvas };
}

export const QUALITY = {
  '480p': { width: 640, height: 480 },
  '720p': { width: 1280, height: 720 },
};

export async function openCamera({ deviceId = null, facingMode = 'user', quality = '480p' } = {}) {
  const q = QUALITY[quality] || QUALITY['480p'];
  const video = {
    width: { ideal: q.width },
    height: { ideal: q.height },
    frameRate: { ideal: 30, max: 30 },
  };
  if (deviceId) video.deviceId = { exact: deviceId };
  else video.facingMode = facingMode;
  const stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
  const track = stream.getVideoTracks()[0];
  const settings = track && track.getSettings ? track.getSettings() : {};
  // Front cameras (and unlabelled desktop webcams) are mirrored once, on the stage.
  const facing = settings.facingMode || (deviceId ? 'unknown' : facingMode);
  return { stream, track, settings, facing, mirror: facing !== 'environment' };
}

export async function listCameras() {
  try {
    const devs = await navigator.mediaDevices.enumerateDevices();
    return devs.filter((d) => d.kind === 'videoinput').map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` }));
  } catch {
    return [];
  }
}

export function stopStream(stream) {
  if (!stream) return;
  for (const t of stream.getTracks()) t.stop();
}

/** Maps getUserMedia failures (and missing APIs) to a title, a cause and fixes. */
export function describeCameraError(err, support = cameraSupport()) {
  if (!support.secure) {
    return {
      code: 'insecure',
      title: 'Camera needs a secure page',
      detail: 'Browsers only allow the camera on https:// pages or on localhost. This page was opened over plain http from another address.',
      fixes: ['Open it at http://localhost:5173 on the computer running npm run dev.', 'Or deploy it to an https:// host (GitHub Pages, Netlify, Vercel) and open that link.', 'A file:// copy will not work either; use the dev server or a deployed build.'],
    };
  }
  if (!support.media) {
    return {
      code: 'unsupported',
      title: 'This browser has no camera API',
      detail: 'navigator.mediaDevices.getUserMedia is missing, so the department cannot see your hands here.',
      fixes: ['Use a current Chrome, Edge, Safari or Firefox.', 'In-app browsers (Instagram, WeChat) often block cameras; open the link in the real browser.'],
    };
  }
  if (!support.wasm) {
    return {
      code: 'unsupported',
      title: 'This browser cannot run the hand tracker',
      detail: 'WebAssembly is unavailable, and MediaPipe runs on WebAssembly.',
      fixes: ['Use a current Chrome, Edge, Safari or Firefox.', 'Turn off any policy or extension that disables WebAssembly.'],
    };
  }
  const name = (err && err.name) || '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return {
      code: 'denied',
      title: 'Camera permission is blocked',
      detail: 'The browser (or the operating system) said no to the camera.',
      fixes: ['Click the camera icon in the address bar and choose Allow, then press Try again.', 'On macOS: System Settings > Privacy & Security > Camera > enable your browser.', 'On Windows: Settings > Privacy > Camera > allow desktop apps.'],
    };
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
    return {
      code: 'no-device',
      title: 'No camera found',
      detail: 'No video input device matched. It may be unplugged, disabled, or the selected camera disappeared.',
      fixes: ['Plug in or enable a webcam, then press Try again.', 'Close the lid-mode or external-display setups that disable the built-in camera.'],
    };
  }
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
    return {
      code: 'busy',
      title: 'The camera is busy',
      detail: 'Another app or tab is holding the camera.',
      fixes: ['Quit Zoom, Teams, OBS or other tabs using the camera, then press Try again.'],
    };
  }
  if (name === 'SecurityError') {
    return {
      code: 'insecure',
      title: 'Camera blocked by page security',
      detail: 'The camera is disabled for this page (often an iframe without camera permission, or a non-https origin).',
      fixes: ['Open the app directly in its own tab on https:// or localhost.'],
    };
  }
  return {
    code: 'unknown',
    title: 'The camera did not start',
    detail: (err && err.message) || 'Unknown error.',
    fixes: ['Press Try again. If it keeps failing, reload the page.'],
  };
}
