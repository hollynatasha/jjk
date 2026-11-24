// Injected before the app loads (puppeteer evaluateOnNewDocument): getUserMedia
// hands back a 640x480 canvas stream the test draws into, so the real
// HandLandmarker runs on real photos. Set __feed.error to make it throw instead.
// Never shipped in the app bundle.
export function installFeed() {
  const W = 640;
  const H = 480;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  const state = { items: [], imgs: {}, bg: '#3a3430', frames: 0 };
  const soft = new Map();

  function softCrop(name, crop) {
    const key = `${name}:${crop.join(',')}`;
    if (soft.has(key)) return soft.get(key);
    const im = state.imgs[name];
    const [sx, sy, sw, sh] = crop;
    const c = document.createElement('canvas');
    c.width = sw;
    c.height = sh;
    const cg = c.getContext('2d');
    cg.drawImage(im, sx, sy, sw, sh, 0, 0, sw, sh);
    cg.globalCompositeOperation = 'destination-in';
    const gr = cg.createRadialGradient(sw / 2, sh / 2, Math.min(sw, sh) * 0.4, sw / 2, sh / 2, Math.min(sw, sh) * 0.5);
    gr.addColorStop(0, 'rgba(0,0,0,1)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    cg.fillStyle = gr;
    cg.fillRect(0, 0, sw, sh);
    soft.set(key, c);
    return c;
  }

  function hardCrop(name, crop) {
    const key = `hard:${name}:${crop.join(',')}`;
    if (soft.has(key)) return soft.get(key);
    const im = state.imgs[name];
    const [sx, sy, sw, sh] = crop;
    const c = document.createElement('canvas');
    c.width = sw;
    c.height = sh;
    c.getContext('2d').drawImage(im, sx, sy, sw, sh, 0, 0, sw, sh);
    soft.set(key, c);
    return c;
  }

  function draw() {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = state.bg;
    g.fillRect(0, 0, W, H);
    for (const it of state.items) {
      const im = state.imgs[it.img];
      if (!im) continue;
      const src = it.crop ? (it.hard ? hardCrop(it.img, it.crop) : softCrop(it.img, it.crop)) : im;
      g.save();
      g.translate(it.cx, it.cy);
      g.rotate(((it.rot || 0) * Math.PI) / 180);
      g.scale((it.flip ? -1 : 1) * it.scale * (it.sx || 1), it.scale);
      g.drawImage(src, -src.width / 2, -src.height / 2);
      g.restore();
    }
    state.frames++;
  }
  setInterval(draw, 33);
  draw();
  const stream = canvas.captureStream(30);

  window.__feed = {
    async load(name, dataUrl) {
      const im = new Image();
      im.src = dataUrl;
      await im.decode();
      state.imgs[name] = im;
    },
    set(items) {
      state.items = items;
    },
    clear() {
      state.items = [];
    },
    frames: () => state.frames,
    canvas,
    error: null,
  };

  if (navigator.mediaDevices) {
    navigator.mediaDevices.getUserMedia = async () => {
      const e = window.__feed.error;
      if (e) throw new DOMException(e.message || 'test error', e.name);
      return stream;
    };
    navigator.mediaDevices.enumerateDevices = async () => [{ kind: 'videoinput', deviceId: 'test-feed', label: 'Test feed (canvas)', groupId: 'feed' }];
  }
}
