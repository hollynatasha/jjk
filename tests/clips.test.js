import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ClipLibrary, drawClipCover } from '../src/media/clips.js';

/** A stand-in for a <video> plus the frame copy the library keeps beside it. */
function fakeClip({ hasFrame = true, currentTime = 0, duration = 7.5, bitmap = null } = {}) {
  const el = { videoWidth: 1280, videoHeight: 720, currentTime, duration, playbackRate: 1 };
  return { el, ready: true, failed: false, playing: true, hasFrame, bitmap, frame: { width: 1280, height: 720 } };
}

function libraryWith(clip) {
  const lib = new ClipLibrary();
  lib.clips.set('x', clip);
  return lib;
}

describe('clip playback stays on the cast clock', () => {
  beforeEach(() => {
    vi.spyOn(performance, 'now').mockReturnValue(10_000);
  });

  it('nudges the playback rate for small drift instead of seeking', () => {
    const clip = fakeClip({ currentTime: 1.0 });
    libraryWith(clip).sync('x', 1.2);
    expect(clip.el.currentTime).toBe(1.0); // no seek
    expect(clip.el.playbackRate).toBeGreaterThan(1);
  });

  it('seeks only once the gap is past saving', () => {
    const clip = fakeClip({ currentTime: 1.0 });
    libraryWith(clip).sync('x', 3.0);
    expect(clip.el.currentTime).toBeCloseTo(3.0, 5);
  });

  it('will not seek again inside the cooldown, so one late frame cannot start a seek storm', () => {
    const clip = fakeClip({ currentTime: 1.0 });
    const lib = libraryWith(clip);
    lib.sync('x', 3.0);
    expect(clip.el.currentTime).toBeCloseTo(3.0, 5);
    clip.el.currentTime = 1.0; // the decoder has not caught up yet
    lib.sync('x', 5.0);
    expect(clip.el.currentTime).toBe(1.0); // held off by the cooldown
  });

  it('keeps the playback rate within a range that does not audibly scrub', () => {
    const clip = fakeClip({ currentTime: 1.0 });
    libraryWith(clip).sync('x', 1.85);
    expect(clip.el.playbackRate).toBeLessThanOrEqual(1.35);
    expect(clip.el.playbackRate).toBeGreaterThanOrEqual(0.75);
  });
});

describe('drawing a clip frame', () => {
  it('refuses a clip with no copied frame rather than sampling the live video', () => {
    // Reading a playing <video> mid-update tears the backdrop into offset
    // blocks; the domain draws its own world for those frames instead.
    const calls = [];
    const g = { drawImage: (...a) => calls.push(a) };
    expect(drawClipCover(g, fakeClip({ hasFrame: false }), 1280, 720)).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('draws the copied frame once it exists', () => {
    const calls = [];
    const g = { drawImage: (...a) => calls.push(a) };
    const clip = fakeClip({ hasFrame: true });
    expect(drawClipCover(g, clip, 1280, 720)).toBe(true);
    expect(calls[0][0]).toBe(clip.frame);
  });

  it('prefers the atomic bitmap snapshot over the canvas copy', () => {
    // a canvas copied from a playing <video> can itself be torn into bands,
    // the ImageBitmap is the one safe to draw
    const calls = [];
    const g = { drawImage: (...a) => calls.push(a) };
    const bitmap = { width: 1280, height: 720 };
    const clip = fakeClip({ hasFrame: true, bitmap });
    expect(drawClipCover(g, clip, 1280, 720)).toBe(true);
    expect(calls[0][0]).toBe(bitmap);
    expect(calls[0][0]).not.toBe(clip.frame);
  });

  it('covers the stage, cropping the overflow', () => {
    const calls = [];
    const g = { drawImage: (...a) => calls.push(a) };
    drawClipCover(g, fakeClip(), 720, 720); // square stage, 16:9 source
    const [, dx, dy, dw, dh] = calls[0];
    expect(dh).toBeCloseTo(720, 5); // short side filled
    expect(dw).toBeGreaterThan(720); // long side cropped
    expect(dy).toBeCloseTo(0, 5);
    expect(dx).toBeLessThan(0); // centred, overflow split either side
  });
});
