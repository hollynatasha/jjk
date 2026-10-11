// One coordinate transform for everything on the stage. The camera frame,
// the segmentation mask, every landmark-anchored effect and the exported
// footage all go through computeView(): a centred 9:16 crop of the raw camera
// frame, mirrored exactly once for a front camera.

export function computeView(videoW, videoH, W, H, mirror) {
  const target = W / H;
  let cw;
  let ch;
  if (videoW / videoH > target) {
    ch = videoH;
    cw = videoH * target;
  } else {
    cw = videoW;
    ch = videoW / target;
  }
  return { videoW, videoH, cx: (videoW - cw) / 2, cy: (videoH - ch) / 2, cw, ch, scale: W / cw, mirror: !!mirror, W, H };
}

/** Normalised landmark (relative to the full raw frame) -> stage pixels. */
export function toCanvas(view, nx, ny) {
  let x = (nx * view.videoW - view.cx) * view.scale;
  const y = (ny * view.videoH - view.cy) * view.scale;
  if (view.mirror) x = view.W - x;
  return [x, y];
}

/** Applies the same mapping to a 2D context, so drawImage(video, 0, 0, vw, vh) lands exactly where toCanvas says. */
export function applyVideoTransform(ctx, view) {
  if (view.mirror) {
    ctx.translate(view.W, 0);
    ctx.scale(-1, 1);
  }
  ctx.scale(view.scale, view.scale);
  ctx.translate(-view.cx, -view.cy);
}

/** The matrix applyVideoTransform builds, as [a, b, c, d, e, f] (for tests and debugging). */
export function viewMatrix(view) {
  const s = view.scale;
  const sx = view.mirror ? -s : s;
  const e = view.mirror ? view.W + view.cx * s : -view.cx * s;
  return [sx, 0, 0, s, e, -view.cy * s];
}

export function handsToCanvas(frame, view) {
  if (!frame || !frame.hands) return [];
  return frame.hands.map((h) => ({
    pts: h.landmarks.map((l) => toCanvas(view, l.x, l.y)),
    score: h.score ?? 1,
    handedness: h.handedness,
  }));
}

/** Is a canvas point inside the visible stage? */
export function onStage(view, p, margin = 0) {
  return p[0] >= -margin && p[0] <= view.W + margin && p[1] >= -margin && p[1] <= view.H + margin;
}
