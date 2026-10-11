import { describe, it, expect } from 'vitest';
import { computeView, toCanvas, applyVideoTransform, viewMatrix, handsToCanvas, onStage } from '../src/render/geometry.js';

/** Minimal context that tracks the current transform, like a real 2D canvas. */
function matrixContext() {
  let m = [1, 0, 0, 1, 0, 0];
  const mul = ([a, b, c, d, e, f], [a2, b2, c2, d2, e2, f2]) => [a * a2 + c * b2, b * a2 + d * b2, a * c2 + c * d2, b * c2 + d * d2, a * e2 + c * f2 + e, b * e2 + d * f2 + f];
  return {
    translate: (x, y) => (m = mul(m, [1, 0, 0, 1, x, y])),
    scale: (x, y) => (m = mul(m, [x, 0, 0, y, 0, 0])),
    get matrix() {
      return m;
    },
  };
}
const apply = ([a, b, c, d, e, f], [x, y]) => [a * x + c * y + e, b * x + d * y + f];

describe('camera frame to 9:16 stage', () => {
  it('crops the centre of a 640x480 frame to 9:16', () => {
    const v = computeView(640, 480, 720, 1280, true);
    expect(v.cw).toBeCloseTo(270, 6);
    expect(v.ch).toBe(480);
    expect(v.cx).toBeCloseTo(185, 6);
    expect(v.cy).toBe(0);
    expect(v.scale).toBeCloseTo(720 / 270, 9);
  });

  it('handles 16:9 landscape and native portrait cameras', () => {
    const land = computeView(1280, 720, 720, 1280, true);
    expect(land.cw).toBeCloseTo(405, 6);
    expect(land.cx).toBeCloseTo(437.5, 6);
    const port = computeView(720, 1280, 720, 1280, false);
    expect(port.cx).toBe(0);
    expect(port.cy).toBe(0);
    expect(port.scale).toBe(1);
  });

  it('maps landmarks exactly where the transformed video pixel lands', () => {
    for (const mirror of [true, false]) {
      const v = computeView(640, 480, 720, 1280, mirror);
      const g = matrixContext();
      applyVideoTransform(g, v);
      expect(g.matrix.map((x) => +x.toFixed(9))).toEqual(viewMatrix(v).map((x) => +x.toFixed(9)));
      for (const [nx, ny] of [[0.5, 0.5], [0.3, 0.2], [0.65, 0.9], [185 / 640, 0], [455 / 640, 1]]) {
        const viaLandmark = toCanvas(v, nx, ny);
        const viaVideo = apply(g.matrix, [nx * 640, ny * 480]);
        expect(viaLandmark[0]).toBeCloseTo(viaVideo[0], 6);
        expect(viaLandmark[1]).toBeCloseTo(viaVideo[1], 6);
      }
    }
  });

  it('mirrors exactly once: the left edge of the crop lands on the right edge of the stage', () => {
    const v = computeView(640, 480, 720, 1280, true);
    expect(toCanvas(v, 185 / 640, 0.5)[0]).toBeCloseTo(720, 6);
    expect(toCanvas(v, 455 / 640, 0.5)[0]).toBeCloseTo(0, 6);
    const raw = computeView(640, 480, 720, 1280, false);
    expect(toCanvas(raw, 185 / 640, 0.5)[0]).toBeCloseTo(0, 6);
    // a raw point and its mirrored twin are symmetric about the stage centre
    const a = toCanvas(v, 0.4, 0.5)[0];
    const b = toCanvas(raw, 0.4, 0.5)[0];
    expect(a + b).toBeCloseTo(720, 6);
  });

  it('keeps hands outside the crop flagged as off stage', () => {
    const v = computeView(640, 480, 720, 1280, true);
    const hands = handsToCanvas({ hands: [{ landmarks: Array.from({ length: 21 }, () => ({ x: 0.05, y: 0.5, z: 0 })), handedness: 'Left', score: 0.9 }] }, v);
    expect(onStage(v, hands[0].pts[0])).toBe(false);
    expect(onStage(v, toCanvas(v, 0.5, 0.5))).toBe(true);
  });
});
