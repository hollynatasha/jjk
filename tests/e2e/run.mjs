// End-to-end browser checks for Domain Permit.
//
//   CHROME_PATH=/path/to/chrome node tests/e2e/run.mjs [--base http://localhost:5173] [--out e2e-out]
//              [--feed-dir photos/ --feed-boxes boxes.json] [--seg-model path.tflite --seg-photo person.jpg] [--only a,b]
//
// Without --feed-dir it covers UI, error states, simulation, recording and
// accessibility. With --feed-dir it also drives the REAL MediaPipe pipeline
// from a canvas "camera" showing hand photos: neutral poses, teaching four
// stand-in signs, the Test my signs challenge, live casts and a recorded clip.
// Photos are never committed; see README for the expected file names.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync, copyFileSync, rmSync, statSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import puppeteer from 'puppeteer-core';
import { installFeed } from './feed.js';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : '1']);
    return acc;
  }, []),
);
const BASE = (args.base || 'http://localhost:5173').replace(/\/$/, '');
const OUT = resolve(args.out || 'e2e-out');
const ONLY = args.only ? new Set(args.only.split(',')) : null;
const ROOT = resolve(new URL('../..', import.meta.url).pathname);
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'downloads'), { recursive: true });

const CHROME = process.env.CHROME_PATH;
if (!CHROME) {
  console.error('Set CHROME_PATH to a Chrome/Chromium executable.');
  process.exit(2);
}
const EXTRA = (process.env.CHROME_ARGS || '').split(' ').filter(Boolean);

const results = [];
const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function record(name, ok, details = {}) {
  results.push({ name, ok, ...details });
  log(`${ok ? 'PASS' : 'FAIL'} ${name}${details.note ? ` · ${details.note}` : ''}`);
}

async function launch(extra = []) {
  return puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    protocolTimeout: 240000,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--disable-accelerated-2d-canvas', ...EXTRA, ...extra],
  });
}

async function openPage(browser, { path = '/', viewport = { width: 1440, height: 900 }, feed = true, reducedMotion = false, before = null } = {}) {
  const page = await browser.newPage();
  const errors = [];
  const blocked = [];
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => {
    const u = r.url();
    (u.includes('storage.googleapis.com') ? blocked : errors).push(`${u} ${r.failure() && r.failure().errorText}`);
  });
  await page.setViewport(viewport);
  if (reducedMotion) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  if (feed) await page.evaluateOnNewDocument(installFeed);
  if (before) await page.evaluateOnNewDocument(before);
  const client = await page.createCDPSession();
  await client.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: join(OUT, 'downloads') }).catch(() => {});
  await page.goto(`${BASE}${path}`, { waitUntil: 'load', timeout: 90000 });
  await page.waitForFunction(() => window.__domainPermit && window.__domainPermit.raf, { timeout: 30000 });
  return { page, errors, blocked, requests };
}

/** Requests to anything other than this app, inline data, or Google's MediaPipe model bucket. */
function thirdParty(requests) {
  return requests.filter((u) => !u.startsWith(BASE) && !/^(data|blob):/.test(u) && !u.startsWith('https://storage.googleapis.com/mediapipe-models/'));
}

/** Console errors not explained by the sandbox blocking storage.googleapis.com. */
function unexplainedErrors(errors, blocked) {
  let allowance = blocked.length;
  return errors.filter((e) => {
    if (allowance > 0 && /^Failed to load resource: net::ERR_(TUNNEL_CONNECTION_FAILED|PROXY|CONNECTION|NAME_NOT_RESOLVED)/.test(e)) {
      allowance--;
      return false;
    }
    return true;
  });
}

const app = (page, fn, ...a) => page.evaluate(fn, ...a);
const raf2 = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

async function canvasPng(page, file) {
  const data = await page.evaluate(() => document.getElementById('stage-canvas').toDataURL('image/png'));
  writeFileSync(file, Buffer.from(data.split(',')[1], 'base64'));
  return file;
}

async function clickText(page, text, scope = 'button') {
  const ok = await page.$$eval(scope, (els, t) => {
    const el = els.find((e) => e.textContent.trim().startsWith(t) && !e.disabled);
    if (el) el.click();
    return !!el;
  }, text);
  if (!ok) throw new Error(`no enabled ${scope} "${text}"`);
}

function want(name) {
  return !ONLY || ONLY.has(name);
}

async function step(name, fn) {
  if (!want(name.split(':')[0])) return;
  try {
    await fn();
  } catch (e) {
    record(name, false, { note: e.message.split('\n')[0] });
  }
}

function waitDownload(prefix, ext, sinceMs, timeout = 30000) {
  const dir = join(OUT, 'downloads');
  const t0 = Date.now();
  return new Promise((res, rej) => {
    const tick = () => {
      const f = readdirSync(dir).filter((n) => n.startsWith(prefix) && n.endsWith(`.${ext}`) && statSync(join(dir, n)).mtimeMs >= sinceMs - 1000);
      if (f.length) return res(join(dir, f.sort().pop()));
      if (Date.now() - t0 > timeout) return rej(new Error(`no ${prefix}*.${ext} download`));
      setTimeout(tick, 250);
    };
    tick();
  });
}

function probe(file) {
  try {
    const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=format_name,duration:stream=codec_type,codec_name,width,height', '-of', 'json', file], { encoding: 'utf8' });
    return JSON.parse(out);
  } catch (e) {
    return { error: e.message };
  }
}

// ---------------------------------------------------------------------------

async function landingAndLayout(browser) {
  for (const vp of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile-390', width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]) {
    await step(`landing:${vp.name}`, async () => {
      const { page, errors, requests } = await openPage(browser, { viewport: vp, feed: false });
      await sleep(1200);
      await page.screenshot({ path: join(OUT, `landing-${vp.name}.png`) });
      const m = await page.evaluate(() => {
        const doc = document.documentElement;
        const cards = [...document.querySelectorAll('.card')];
        const vw = window.innerWidth;
        const clipped = cards.filter((c) => {
          const r = c.getBoundingClientRect();
          return r.left < -1 || r.right > vw + 1;
        }).length;
        const small = [...document.querySelectorAll('button, a.btn, .tool')].filter((b) => {
          const r = b.getBoundingClientRect();
          return r.width > 0 && (r.height < 43.5 || r.width < 43.5);
        }).map((b) => b.textContent.trim().slice(0, 30));
        const banned = ['ma', 'hito'].join('');
        return {
          scrollW: doc.scrollWidth,
          vw,
          cards: cards.length,
          clipped,
          refs: [...document.querySelectorAll('.card a[href^="https://jujutsukaisen.jp/"]')].length,
          small,
          bannedName: document.body.innerText.toLowerCase().includes(banned),
          stage: (() => {
            const r = document.getElementById('stage').getBoundingClientRect();
            return { w: Math.round(r.width), h: Math.round(r.height), ratio: +(r.width / r.height).toFixed(4) };
          })(),
        };
      });
      const third = thirdParty(requests);
      const ok = m.scrollW <= m.vw && m.cards === 4 && m.clipped === 0 && m.refs >= 4 && !m.bannedName && Math.abs(m.stage.ratio - 9 / 16) < 0.01 && errors.length === 0 && m.small.length === 0 && third.length === 0;
      record(`landing:${vp.name}`, ok, { metrics: m, errors, third, note: `scrollWidth ${m.scrollW}/${m.vw}, stage ${m.stage.w}x${m.stage.h}, cards ${m.cards}, small targets ${m.small.length}, console errors ${errors.length}, third-party requests ${third.length}` });
      await page.close();
    });
  }
}

// Opening the built index.html straight from disk must explain itself, not sit blank.
async function fileOpen(browser) {
  const file = join(ROOT, 'dist', 'index.html');
  if (!existsSync(file)) return;
  await step('file-open:explains', async () => {
    const page = await browser.newPage();
    try {
      await page.goto(`file://${file}`, { waitUntil: 'load', timeout: 30000 });
      await sleep(6000);
      const r = await page.evaluate(() => {
        const late = document.querySelector('.boot-late');
        return { started: !!window.__domainPermit, text: late ? late.textContent.trim() : '', visible: late ? getComputedStyle(late).opacity === '1' : false };
      });
      record('file-open:explains', !r.started && r.visible && /npm run dev/.test(r.text), { r, note: r.started ? 'app started from file:// (unexpected)' : `app did not start; message shown: ${r.visible}` });
    } finally {
      await page.close();
    }
  });
}

async function cameraErrors(browser) {
  const cases = [
    { name: 'denied', before: null, err: { name: 'NotAllowedError' }, expect: /permission is blocked/i },
    { name: 'no-device', before: null, err: { name: 'NotFoundError' }, expect: /No camera found/i },
    { name: 'busy', before: null, err: { name: 'NotReadableError' }, expect: /camera is busy/i },
    { name: 'insecure', before: () => Object.defineProperty(window, 'isSecureContext', { get: () => false }), err: null, expect: /secure page/i },
    { name: 'unsupported-wasm', before: () => Object.defineProperty(window, 'WebAssembly', { value: undefined }), err: null, expect: /cannot run the hand tracker/i },
  ];
  for (const c of cases) {
    await step(`camera-error:${c.name}`, async () => {
      const { page } = await openPage(browser, { before: c.before });
      if (c.err) await page.evaluate((e) => (window.__feed.error = e), c.err);
      await page.click('#start-camera');
      await page.waitForFunction(() => window.__domainPermit.mode === 'error', { timeout: 20000 });
      const text = await page.$eval('#panel', (p) => p.innerText);
      const hasRetry = !!(await page.$('#retry-camera'));
      await page.screenshot({ path: join(OUT, `error-${c.name}.png`) });
      record(`camera-error:${c.name}`, c.expect.test(text) && hasRetry, { note: text.split('\n')[0] });
      await page.close();
    });
  }
  await step('camera-error:model-load-failure', async () => {
    const { page } = await openPage(browser, { path: '/?noLocalModels=1&offline=1' });
    await page.click('#start-camera');
    await page.waitForFunction(() => window.__domainPermit.mode === 'error', { timeout: 30000 });
    const text = await page.$eval('#panel', (p) => p.innerText);
    record('camera-error:model-load-failure', /did not load/i.test(text), { note: text.split('\n')[0] });
    await page.close();
  });
}

async function simulation(browser, { reducedMotion = false, tag = 'sim' } = {}) {
  await step(`${tag}:four-domains`, async () => {
    const { page, errors } = await openPage(browser, { path: '/?debug=1', reducedMotion, feed: false });
    await page.click('#open-sim');
    await page.waitForFunction(() => window.__domainPermit.mode === 'sim');
    const banner = await page.$eval('.sim-banner', (b) => b.textContent).catch(() => '');
    const seen = {};
    for (const [i, id] of ['gojo', 'sukuna', 'megumi', 'higuruma'].entries()) {
      // keyboard shortcut 1-4 for half the domains, buttons for the rest
      if (i % 2) await page.keyboard.press(String(i + 1));
      else await page.click(`#sim-${id}`);
      await page.waitForFunction(() => window.__domainPermit.run && window.__domainPermit.run.startedAt !== null, { timeout: 10000 });
      const info = await app(page, () => ({ id: window.__domainPermit.run.module.id, sim: !!window.__domainPermit.run.record.simulated, reduced: !!window.__domainPermit.run.record.reduced, total: window.__domainPermit.run.total, locked: [...document.querySelectorAll('#panel button')].every((b) => b.disabled || b.textContent.includes('Sound')) }));
      seen[id] = info;
      for (const t of [0.2, 1.0, 3.0, 6.6]) {
        await app(page, (tt) => window.__domainPermit.freezeCastAt(tt), t);
        await raf2(page);
        await canvasPng(page, join(OUT, `${tag}-${id}-${t}.png`));
      }
      await app(page, () => window.__domainPermit.freezeCastAt(7.95));
      await raf2(page);
      await app(page, () => window.__domainPermit.releaseClock());
      await page.waitForFunction(() => !window.__domainPermit.run, { timeout: 15000 });
    }
    const ids = Object.values(seen).map((s) => s.id);
    const ok = new Set(ids).size === 4 && Object.values(seen).every((s) => s.sim && s.reduced === reducedMotion && s.locked) && /SIMULATION/.test(banner) && errors.length === 0;
    record(`${tag}:four-domains`, ok, { seen, errors, note: `animation ids ${ids.join(', ')}; reduced=${reducedMotion}; banner "${banner}"` });
    await page.close();
  });
}

async function toggles(browser) {
  await step('settings:mute-effects-motion-persist', async () => {
    const { page } = await openPage(browser, { feed: false });
    try {
      await page.keyboard.press('m');
      await page.click('#btn-effects');
      await page.click('#btn-motion');
      const s1 = await app(page, () => ({ ...window.__domainPermit.settings, audioMuted: window.__domainPermit.audio.muted }));
      await page.reload({ waitUntil: 'load', timeout: 90000 });
      await page.waitForFunction(() => window.__domainPermit && window.__domainPermit.raf, { timeout: 30000 });
      const s2 = await app(page, () => ({ ...window.__domainPermit.settings, label: document.getElementById('btn-mute').textContent }));
      const ok = s1.muted && s1.audioMuted && s1.effects === 'low' && s1.motion === 'reduced' && s2.muted && s2.effects === 'low' && s2.motion === 'reduced' && /Sound off/.test(s2.label);
      record('settings:mute-effects-motion-persist', ok, { note: `after reload: muted=${s2.muted} effects=${s2.effects} motion=${s2.motion}` });
    } finally {
      await page.evaluate(() => localStorage.clear()).catch(() => {});
      await page.close();
    }
  });
  await step('keyboard:tab-and-activate', async () => {
    const { page } = await openPage(browser, { feed: false });
    const order = [];
    for (let i = 0; i < 9; i++) {
      await page.keyboard.press('Tab');
      order.push(await page.evaluate(() => {
        const a = document.activeElement;
        const st = getComputedStyle(a);
        return { label: (a.getAttribute('aria-label') || a.textContent || '').trim().slice(0, 32), outline: st.outlineStyle !== 'none' && parseFloat(st.outlineWidth) >= 2 };
      }));
    }
    // Activate simulation from the keyboard
    await page.focus('#open-sim');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__domainPermit.mode === 'sim', { timeout: 5000 });
    const ok = order.some((o) => /Start camera/.test(o.label)) && order.filter((o) => o.label).every((o) => o.outline);
    record('keyboard:tab-and-activate', ok, { order, note: order.map((o) => o.label).join(' | ') });
    await page.close();
  });
}

async function recordingSim(browser) {
  await step('record:simulation-clips', async () => {
    const { page } = await openPage(browser, { feed: false });
    await page.click('#open-sim');
    const clips = [];
    for (const id of ['higuruma', 'gojo']) {
      await page.click(`#sim-${id}`);
      await page.waitForFunction(() => !window.__domainPermit.run, { timeout: 20000 });
      const since = Date.now();
      await page.click('#btn-record');
      await page.waitForFunction(() => window.__domainPermit.rec.phase === 'recording', { timeout: 10000 });
      await page.waitForFunction(() => window.__domainPermit.clip, { timeout: 30000 });
      const c = await app(page, () => ({ mime: window.__domainPermit.clip.mime, ext: window.__domainPermit.clip.ext, ms: window.__domainPermit.clip.durationMs, audio: window.__domainPermit.clip.hasAudio, domain: window.__domainPermit.clip.domain }));
      await page.click('#btn-clip');
      const file = await waitDownload('domain-permit-', c.ext, since);
      const p = probe(file);
      clips.push({ ...c, file: basename(file), probe: p });
      // extract a mid-clip frame to prove the domain is in the footage
      try {
        execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', '4', '-i', file, '-frames:v', '1', join(OUT, `clip-${id}-4s.png`)]);
      } catch {
        /* ffmpeg optional */
      }
    }
    const ok = clips.length === 2 && clips.every((c) => c.ms > 7500 && c.ms < 13000 && c.file.endsWith(`.${c.ext}`) && !(c.ext === 'mp4' && /webm/.test(c.mime)) && !c.probe.error);
    record('record:simulation-clips', ok, { clips, note: clips.map((c) => `${c.domain} ${c.ext} ${(c.ms / 1000).toFixed(1)}s ${c.mime} audio=${c.audio}`).join(' | ') });
    // PNG
    const since = Date.now();
    await page.click('#btn-png');
    const png = await waitDownload('domain-permit-', 'png', since);
    const dims = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', png], { encoding: 'utf8' }).trim();
    record('record:png', dims === '720,1280', { note: `${basename(png)} ${dims}` });
    await page.close();
  });
}

// ---------------------------------------------------------------------------
// Real pipeline with hand photos (stand-in signs)

function loadFeed() {
  if (!args['feed-dir'] || !args['feed-boxes']) return null;
  const dir = resolve(args['feed-dir']);
  const boxes = JSON.parse(readFileSync(resolve(args['feed-boxes']), 'utf8'));
  const byClass = {};
  for (const [file, info] of Object.entries(boxes)) {
    if (!info.hands || !info.hands.length) continue;
    const cls = file.split('_')[0];
    // the gesturing hand: the one held highest in the photo
    const hand = info.hands.slice().sort((a, b) => a.box[1] - b.box[1])[0];
    const [x0, y0, x1, y1] = hand.box;
    if (Math.max(x1 - x0, y1 - y0) < 44) continue; // too small to upscale cleanly
    // Square crop 2.6x the hand box, drawn with hard edges: the palm detector
    // needs wrist and forearm context, and feathered edges cost detections.
    const side = Math.max(x1 - x0, y1 - y0) * 2.6;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2 + (y1 - y0) * 0.12;
    const crop = [Math.max(0, cx - side / 2), Math.max(0, cy - side / 2), side, side].map(Math.round);
    crop[2] = Math.min(crop[2], info.w - crop[0]);
    crop[3] = Math.min(crop[3], info.h - crop[1]);
    (byClass[cls] = byClass[cls] || []).push({ file, crop, handSize: Math.max(x1 - x0, y1 - y0), handed: hand.handed });
  }
  return { dir, byClass };
}

// Stand-in signs: real photographed hand shapes, standing in for the four
// domain signs because nobody here can perform the real ones on camera.
// Pairs were chosen from a detection sweep (both hands found in 6/6
// compositions); 'call' pairs only reached 2-4/6, so call appears single-handed.
// Each entry lists the photo class per hand: first = the person's right hand
// (left side of the raw camera frame), second = their left hand.
const STANDIN = {
  gojo: { hands: ['rock'] },
  sukuna: { hands: ['rock', 'rock'] },
  megumi: { hands: ['four', 'four'] },
  higuruma: { hands: ['rock', 'four'] },
};
const NEG = { 'open-palm': ['four'], fist: ['none'], peace: ['call'], wave: ['none'], relaxed: ['none', 'none'], palms: ['none', 'four'], clap: ['four', 'none'], fists: ['none', 'rock'] };
const VIEW_T = [
  { dx: 0, dy: 0, s: 1, rot: 0, sx: 1 },
  { dx: 14, dy: -10, s: 1, rot: 2, sx: 1 },
  { dx: -12, dy: -26, s: 1, rot: -2, sx: 1 },
  { dx: -30, dy: 0, s: 1, rot: -7, sx: 0.88 },
  { dx: -24, dy: 8, s: 1, rot: -9, sx: 0.86 },
  { dx: -34, dy: 22, s: 1, rot: -6, sx: 0.9 },
  { dx: 30, dy: 0, s: 1, rot: 7, sx: 0.88 },
  { dx: 24, dy: 8, s: 1, rot: 9, sx: 0.86 },
  { dx: 34, dy: 22, s: 1, rot: 6, sx: 0.9 },
  { dx: 0, dy: 6, s: 1.2, rot: 0, sx: 1 },
  { dx: 0, dy: -6, s: 0.82, rot: 0, sx: 1 },
  { dx: 6, dy: 0, s: 1.06, rot: 1, sx: 1 },
];

const SLOT_X = { c: 320, l: 210, r: 430 };
const slotOf = (n, i) => (n === 1 ? 'c' : i === 0 ? 'l' : 'r');

/**
 * Calibration pass, like a person checking the camera can see their hands:
 * each photo is shown alone at each hand position and kept for that position
 * only if the tracker finds exactly one hand, confidently, with the intended
 * handedness label. Composed signs then draw from these pools.
 */
async function screenPhotos(page, feed) {
  const ok = {};
  const stats = {};
  for (const [cls, pool] of Object.entries(feed.byClass)) {
    ok[cls] = { c: [], l: [], r: [] };
    for (const it of pool) {
      for (const slot of ['c', 'l', 'r']) {
        const want = slot === 'r' ? 'Right' : 'Left';
        const flip = !!it.handed && it.handed !== want;
        await page.evaluate(() => window.__feed.clear());
        await page.waitForFunction(() => !window.__domainPermit.hand.feat || window.__domainPermit.hand.feat.count === 0, { timeout: 2000, polling: 50 }).catch(() => {});
        const scale = Math.min(1.6, Math.max(0.8, 100 / it.handSize));
        await page.evaluate((item) => window.__feed.set([item]), { img: it.file, crop: it.crop, hard: true, cx: SLOT_X[slot], cy: 262, scale, rot: 0, sx: 1, flip });
        const seen = await page
          .waitForFunction(
            (w) => {
              const a = window.__domainPermit;
              const f = a.hand.feat;
              return !!(f && f.count === 1 && f.info.minScore > 0.85 && a.hand.frame.hands[0].handedness === w);
            },
            { timeout: 1500, polling: 50 },
            want,
          )
          .then(() => true, () => false);
        if (seen) ok[cls][slot].push(it);
      }
    }
    stats[cls] = { photos: pool.length, centre: ok[cls].c.length, left: ok[cls].l.length, right: ok[cls].r.length };
  }
  await page.evaluate(() => window.__feed.clear());
  feed.ok = ok;
  return stats;
}

function composeSign(feed, spec, pick, t = VIEW_T[0]) {
  const n = spec.length;
  return spec.map((cls, i) => {
    const screened = feed.ok && feed.ok[cls] && feed.ok[cls][slotOf(n, i)];
    const pool = screened && screened.length >= 2 ? screened : feed.byClass[cls];
    const it = pool[(pick + i * 3) % pool.length];
    // MediaPipe labels a raw (unmirrored) frame as if it were mirrored, so the
    // person's right hand reads "Left". Flip a photo when its hand is the wrong one.
    const want = i === 0 ? 'Left' : 'Right';
    const flip = !!it.handed && it.handed !== want;
    // ~100 px hands in a 640x480 frame (82-120 px across the distance views),
    // like a webcam at arm's length; never upscale a photo past 1.6x
    const scale = Math.min(1.6, Math.max(0.8, (100 * t.s) / it.handSize));
    const baseX = SLOT_X[slotOf(n, i)];
    return { img: it.file, crop: it.crop, hard: true, cx: baseX + t.dx * (n === 1 ? 1 : 0.6), cy: 262 + t.dy, scale, rot: t.rot, sx: t.sx, flip };
  });
}

async function loadFeedImages(page, feed) {
  const files = new Set(Object.values(feed.byClass).flat().map((x) => x.file));
  for (const f of files) {
    const b64 = readFileSync(join(feed.dir, f)).toString('base64');
    await page.evaluate((name, data) => window.__feed.load(name, data), f, `data:image/jpeg;base64,${b64}`);
  }
}

// Harness bookkeeping: how often the palm detector missed a composed hand and
// the harness had to show a different photo (what a person does by adjusting).
const swaps = { capture: 0, trial: 0, live: 0 };

/** Shows make(attempt) until the app stores a capture; a different photo set per attempt. */
async function captureWith(page, make, { tries = 6, timeout = 9000 } = {}) {
  const before = await app(page, () => window.__domainPermit.captures.length);
  for (let a = 0; a < tries; a++) {
    if (a) swaps.capture++;
    await page.evaluate((it) => window.__feed.set(it), make(a));
    const ok = await page.waitForFunction((b) => window.__domainPermit.captures.length > b, { timeout, polling: 100 }, before).then(() => true, () => false);
    await page.evaluate(() => window.__feed.clear());
    await sleep(ok ? 700 : 500);
    if (ok) return a;
  }
  throw new Error(`no capture after ${tries} photo sets`);
}

/** True when the tracker currently sees the expected number of hands. */
const seesHands = (page, n) => app(page, (k) => !!(window.__domainPermit.hand.feat && window.__domainPermit.hand.feat.count === k), n);

/**
 * Holds a stand-in sign in front of the live gate until it casts. A different
 * photo set is shown only when the detector misses a hand for 1.5 s; a sign that
 * is detected but rejected by the matcher keeps the same photos and counts as a miss.
 */
async function showUntilCast(page, feed, d, pick, timeout = 15000) {
  const n = STANDIN[d].hands.length;
  let p = pick;
  let missSince = null;
  const t0 = Date.now();
  const seen = {};
  await page.evaluate((it) => window.__feed.set(it), composeSign(feed, STANDIN[d].hands, p, VIEW_T[0]));
  while (Date.now() - t0 < timeout) {
    const st = await app(page, () => {
      const a = window.__domainPermit;
      const c = a.hand.cls;
      return { run: !!a.run, gate: a.gate.state, best: c && c.best, accepted: !!(c && c.accepted), reason: c && c.reason, dist: c && c.dist && +c.dist.toFixed(3), thr: c && c.threshold && +c.threshold.toFixed(3) };
    });
    if (st.run) return true;
    const key = `${st.gate}|${st.best}|${st.accepted ? 'accepted' : st.reason}`;
    seen[key] = (seen[key] || 0) + 1;
    showUntilCast.last = { seen, sample: st };
    if (await seesHands(page, n)) missSince = null;
    else {
      missSince = missSince || Date.now();
      if (Date.now() - missSince > 1500) {
        swaps.live++;
        p += 5;
        missSince = null;
        await page.evaluate((it) => window.__feed.set(it), composeSign(feed, STANDIN[d].hands, p, VIEW_T[0]));
      }
    }
    await sleep(80);
  }
  return false;
}

async function realPipeline(browser, feed, { segModel = null, tag = 'real' } = {}) {
  swaps.capture = swaps.trial = swaps.live = 0;
  const testSeg = segModel ? '/__test__/seg.tflite' : null;
  if (segModel) {
    mkdirSync(join(ROOT, 'public', '__test__'), { recursive: true });
    copyFileSync(segModel, join(ROOT, 'public', '__test__', 'seg.tflite'));
  }
  const path = `/?debug=1&delegate=cpu${testSeg ? `&segModel=${encodeURIComponent(testSeg)}` : ''}`;
  const { page, errors, blocked, requests } = await openPage(browser, { path });
  const timeline = [];
  const note = (m) => {
    timeline.push(`${new Date().toISOString().slice(11, 19)} ${m}`);
    log(`   ${m}`);
  };
  try {
    await loadFeedImages(page, feed);
    await page.click('#start-camera');
    await page.waitForFunction(() => window.__domainPermit.mode === 'library', { timeout: 120000 });
    const models = await app(page, () => ({ ...window.__domainPermit.models, delegate: window.__domainPermit.tracker.delegate, handSource: window.__domainPermit.tracker.handSource }));
    note(`camera on; hand model ${models.handSource && models.handSource.label} (${models.handSource && models.handSource.bytes} bytes) on ${models.delegate}`);
    await page.waitForFunction(() => ['ready', 'failed', 'slow'].includes(window.__domainPermit.models.seg), { timeout: 60000 });
    const seg = await app(page, () => ({ seg: window.__domainPermit.models.seg, note: window.__domainPermit.models.segNote, src: window.__domainPermit.models.segSrc }));
    note(`segmentation: ${seg.seg} ${seg.src || ''} ${seg.note || ''}`);
    record(`${tag}:models-load-from-running-app`, models.hand === 'ready', { models, seg, blocked: blocked.slice(0, 4), note: `hand=${models.hand} via ${models.handSource && models.handSource.label}; seg=${seg.seg}` });

    const screen = await screenPhotos(page, feed);
    note(`photo screening (usable at centre/left/right): ${JSON.stringify(screen)}`);
    record(`${tag}:photo-screening`, Object.values(screen).every((x) => x.left >= 2 && x.right >= 2), { screen, note: Object.entries(screen).map(([k, v]) => `${k} ${v.centre}/${v.left}/${v.right} of ${v.photos}`).join(', ') });

    // Hands detected at all?
    await page.evaluate((it) => window.__feed.set(it), composeSign(feed, STANDIN.sukuna.hands, 0));
    await page.waitForFunction(() => window.__domainPermit.hand.feat && window.__domainPermit.hand.feat.count === 2, { timeout: 20000 });
    await sleep(800);
    await canvasPng(page, join(OUT, `${tag}-tracking-two-hands.png`));
    const align = await app(page, () => {
      const a = window.__domainPermit;
      const f = a.hand.frame;
      const v = a.view;
      // Mirror check: each wrist drawn on the stage must sit at the mirrored raw
      // position (applied once), not at the raw one (zero or two flips).
      return f.hands.map((h) => {
        const raw = h.landmarks[0];
        const unflipped = (raw.x * v.videoW - v.cx) * v.scale;
        const y = (raw.y * v.videoH - v.cy) * v.scale;
        // stage hands are sorted by x and smoothed, so match by nearest wrist
        const expectX = v.W - unflipped;
        const drawn = a.hand.canvas.map((c) => c.pts[0]).sort((p, q) => Math.hypot(p[0] - expectX, p[1] - y) - Math.hypot(q[0] - expectX, q[1] - y))[0];
        return { mirror: v.mirror, rawX: +(raw.x * v.videoW).toFixed(1), expectX: Math.round(v.W - unflipped), unflippedX: Math.round(unflipped), drawnX: drawn ? Math.round(drawn[0]) : null, dy: drawn ? Math.round(Math.abs(drawn[1] - y)) : null };
      });
    });
    const mirrorOk = align.length === 2 && align.every((h) => h.mirror && h.drawnX !== null && Math.abs(h.drawnX - h.expectX) < 2 && h.dy < 2 && Math.abs(h.drawnX - h.unflippedX) > 20);
    record(`${tag}:mirror-once`, mirrorOk, { align, note: align.map((h) => `raw x ${h.rawX} -> stage ${h.drawnX} (expected ${h.expectX}, unmirrored would be ${h.unflippedX})`).join('; ') });
    await page.evaluate(() => window.__feed.clear());
    await sleep(600);

    note(`mirror: ${JSON.stringify(align)}`);

    // Teach: first click triggers the neutral-pose collection, then the sign.
    const order = ['gojo', 'sukuna', 'megumi', 'higuruma'];
    const reports = {};
    for (const [di, d] of order.entries()) {
      await page.click(`#teach-${d}`);
      await page.waitForFunction(() => ['negatives', 'teach'].includes(window.__domainPermit.mode), { timeout: 10000 });
      let mode = await app(page, () => window.__domainPermit.mode);
      if (mode === 'negatives') {
        let k = 0;
        while ((await app(page, () => window.__domainPermit.mode)) === 'negatives') {
          const idx = await app(page, () => window.__domainPermit.teach.index);
          const prompt = ['open-palm', 'fist', 'peace', 'wave', 'relaxed', 'palms', 'clap', 'fists'][idx];
          await captureWith(page, (a) => composeSign(feed, NEG[prompt], 7 + k * 2 + a * 5, VIEW_T[k % 12]));
          k++;
        }
        note(`neutral poses captured: ${k}`);
        mode = await app(page, () => window.__domainPermit.mode);
      }
      for (let slot = 0; slot < 12; slot++) {
        const s = await app(page, () => window.__domainPermit.teach && window.__domainPermit.teach.slot);
        if (s === -1 || s === null) break;
        await captureWith(page, (a) => composeSign(feed, STANDIN[d].hands, s + a * 5, VIEW_T[s]));
        if (slot === 3 && d === 'gojo') await canvasPng(page, join(OUT, `${tag}-teach-gojo.png`));
      }
      await page.waitForFunction(() => window.__domainPermit.teach && window.__domainPermit.teach.phase === 'review', { timeout: 15000 });
      const rep = await app(page, (dd) => {
        const r = window.__domainPermit.matcher.reports[dd];
        return r ? { status: r.status, message: r.message, threshold: r.threshold, confusions: r.confusions, misses: r.misses.length, flagged: r.flagged.length } : null;
      }, d);
      reports[d] = rep;
      note(`${d}: ${rep && rep.status} · ${rep && rep.message}`);
      if (di === 0) await page.screenshot({ path: join(OUT, `${tag}-teach-review.png`) });
    }
    const allReports = await app(page, () => Object.fromEntries(Object.entries(window.__domainPermit.matcher.reports).map(([k, r]) => [k, { status: r.status, message: r.message, threshold: r.threshold && +r.threshold.toFixed(4), confusions: r.confusions }])));
    record(`${tag}:teach-four-signs`, Object.keys(allReports).length === 4, { reports: allReports, note: Object.entries(allReports).map(([k, r]) => `${k}=${r.status}`).join(', ') });

    // Retake one slot (UI path), then confirm the sign is still validated.
    await page.click('#teach-higuruma');
    await page.waitForFunction(() => window.__domainPermit.mode === 'teach');
    await page.click('.slot');
    await page.waitForFunction(() => window.__domainPermit.teach.phase === 'capturing');
    await captureWith(page, (a) => composeSign(feed, STANDIN.higuruma.hands, a * 5, VIEW_T[0]));
    await page.waitForFunction(() => window.__domainPermit.teach.phase === 'review', { timeout: 15000 });
    record(`${tag}:retake-slot`, true, { note: `higuruma after retake: ${await app(page, () => window.__domainPermit.matcher.reports.higuruma.status)}` });

    // Test my signs: show the prompted sign (held-out photos) during trials, nothing during rest.
    const trained = await app(page, () => window.__domainPermit.trainedDomains());
    note(`trained (live) signs: ${trained.join(', ')}`);
    await app(page, () => window.__domainPermit.goLibrary());
    await page.waitForFunction(() => window.__domainPermit.mode === 'library');
    await page.click('#start-test');
    await page.waitForFunction(() => window.__domainPermit.mode === 'test');
    let lastKey = '';
    let trial = null;
    const trialDiag = [];
    const t0 = Date.now();
    while (Date.now() - t0 < 400000) {
      const s = await app(page, () => {
        const a = window.__domainPermit;
        if (a.challengeResults) return { done: true };
        const c = a.hand.cls;
        return { ...a.challengeSnap, seen: c ? { count: c.count, best: c.best, reason: c.reason, dist: Number.isFinite(c.dist) ? +c.dist.toFixed(3) : null, thr: c.threshold && +c.threshold.toFixed(3) } : null };
      });
      if (s.done) break;
      if (s.phase === 'trial' && s.seen) {
        // What the app saw during each trial: hand counts and matcher verdicts.
        const d = (trialDiag[s.index] = trialDiag[s.index] || { target: s.target, samples: 0, counts: {}, verdicts: {}, nearest: null });
        d.samples++;
        d.counts[s.seen.count] = (d.counts[s.seen.count] || 0) + 1;
        const v = s.seen.reason === 'match' ? `match:${s.seen.best}` : s.seen.reason === 'no-hands' || s.seen.reason === 'count' ? s.seen.reason : `${s.seen.reason}:${s.seen.best}`;
        d.verdicts[v] = (d.verdicts[v] || 0) + 1;
        if (s.seen.best === s.target && s.seen.dist !== null && (!d.nearest || s.seen.dist < d.nearest.dist)) d.nearest = { dist: s.seen.dist, thr: s.seen.thr };
      }
      const key = `${s.phase}-${s.index}`;
      if (key !== lastKey) {
        lastKey = key;
        if (s.phase === 'trial') {
          // Photos picked differently from the teach captures, at a rotated view.
          trial = { target: s.target, pick: 9 + s.index * 2, view: VIEW_T[(s.index * 5) % 12], shownAt: Date.now(), missSince: null };
          await page.evaluate((it) => window.__feed.set(it), composeSign(feed, STANDIN[s.target].hands, trial.pick, trial.view));
        } else {
          trial = null;
          await page.evaluate(() => window.__feed.clear());
        }
      } else if (trial) {
        // Only when the palm detector cannot find every hand in this photo set
        // (not when the matcher rejects a detected sign) switch photos.
        const n = STANDIN[trial.target].hands.length;
        if (await seesHands(page, n)) trial.missSince = null;
        else if (Date.now() - trial.shownAt > 1200) {
          trial.missSince = trial.missSince || Date.now();
          if (Date.now() - trial.missSince > 1500) {
            swaps.trial++;
            trial.pick += 5;
            trial.missSince = null;
            trial.shownAt = Date.now();
            await page.evaluate((it) => window.__feed.set(it), composeSign(feed, STANDIN[trial.target].hands, trial.pick, trial.view));
          }
        }
      }
      await sleep(80);
    }
    await page.evaluate(() => window.__feed.clear());
    const challenge = await app(page, () => {
      const r = window.__domainPermit.challengeResults;
      return r ? { perSign: r.perSign, ready: r.ready, falsePositives: r.falsePositives, records: r.records } : null;
    });
    await page.screenshot({ path: join(OUT, `${tag}-test-results.png`) });
    if (challenge) {
      for (const r of challenge.records) if (r.trial !== undefined && trialDiag[r.trial]) trialDiag[r.trial].result = r.type === 'success' ? 'success' : `${r.type}${r.detected ? `:${r.detected}` : ''}`;
    }
    note(`trial diagnostics: ${JSON.stringify(trialDiag)}`);
    record(`${tag}:test-my-signs`, !!challenge, { challenge, trials: trialDiag, note: challenge ? Object.entries(challenge.perSign).map(([k, v]) => `${k} ${v.success}/${v.attempts} miss ${v.misses} conf ${JSON.stringify(v.confusions)} fp ${v.falsePositives}`).join(' | ') : 'no results' });

    // Live: cast each trained sign without tapping a domain button.
    await app(page, () => window.__domainPermit.goLive());
    await page.waitForFunction(() => window.__domainPermit.mode === 'live');
    const casts = {};
    for (const d of trained) {
      await page.evaluate(() => window.__feed.clear());
      await page.waitForFunction(() => ['armed'].includes(window.__domainPermit.gate.state) && !window.__domainPermit.run, { timeout: 20000 });
      const tStart = Date.now();
      const ok = await showUntilCast(page, feed, d, 1);
      if (!ok) {
        casts[d] = { cast: false, diag: showUntilCast.last };
        note(`live ${d}: no cast within 15 s · ${JSON.stringify(showUntilCast.last)}`);
        continue;
      }
      const info = await app(page, () => ({ domain: window.__domainPermit.run.record.domainId, anim: window.__domainPermit.run.module.id, seed: window.__domainPermit.run.record.seed }));
      casts[d] = { cast: true, ...info, latencyMs: Date.now() - tStart };
      // hands vanish mid-cast: the sequence must finish on its own, same domain
      await page.evaluate(() => window.__feed.clear());
      for (const t of [0.15, 1.0, 3.0]) {
        await app(page, (tt) => window.__domainPermit.freezeCastAt(tt), t);
        await raf2(page);
        await canvasPng(page, join(OUT, `${tag}-live-${d}-${t}.png`));
      }
      await app(page, () => window.__domainPermit.releaseClock());
      await page.waitForFunction(() => !window.__domainPermit.run, { timeout: 15000 });
      casts[d].finishedDomain = await app(page, () => window.__domainPermit.lastRecord.domainId);
      note(`live ${d}: cast ${casts[d].anim} after ${casts[d].latencyMs} ms`);
    }
    const anims = Object.values(casts).filter((c) => c.cast).map((c) => c.anim);
    record(`${tag}:live-casts`, Object.values(casts).every((c) => c.cast && c.domain === c.finishedDomain) && new Set(anims).size === anims.length, { casts, note: Object.entries(casts).map(([k, c]) => `${k}->${c.anim || 'none'}`).join(', ') });

    // Release-to-rearm: a sign held through its own cast and the cooldown must not recast.
    const d0 = trained[0];
    await page.evaluate(() => window.__feed.clear());
    await page.waitForFunction(() => window.__domainPermit.gate.state === 'armed' && !window.__domainPermit.run, { timeout: 20000 });
    if (!(await showUntilCast(page, feed, d0, 1))) throw new Error(`${d0} did not cast for the hold test`);
    await page.waitForFunction(() => !window.__domainPermit.run, { timeout: 15000 });
    const held = await page.waitForFunction(() => window.__domainPermit.run, { timeout: 5000 }).then(() => true, () => false);
    const gateHeld = await app(page, () => window.__domainPermit.gate.state);
    // dropping the hands re-arms it, and the sign casts again
    await page.evaluate(() => window.__feed.clear());
    await page.waitForFunction(() => window.__domainPermit.gate.state === 'armed', { timeout: 10000 });
    const recast = await showUntilCast(page, feed, d0, 1);
    if (recast) await page.waitForFunction(() => !window.__domainPermit.run, { timeout: 15000 });
    await page.evaluate(() => window.__feed.clear());
    record(`${tag}:hold-does-not-recast`, !held && gateHeld === 'release' && recast, { note: `${held ? 'recast while held (bad)' : `no recast while held (gate: ${gateHeld})`}; after dropping the hands: ${recast ? 'cast again' : 'did not cast'}` });

    // Replay uses the stored record (same seed), not a new sign.
    await page.waitForFunction(() => window.__domainPermit.mode === 'result');
    const seedBefore = await app(page, () => window.__domainPermit.lastRecord.seed);
    await page.click('#btn-replay');
    await page.waitForFunction(() => window.__domainPermit.run, { timeout: 5000 });
    const rep = await app(page, () => ({ seed: window.__domainPermit.run.record.seed, replay: !!window.__domainPermit.run.record.replayOf }));
    await page.waitForFunction(() => !window.__domainPermit.run, { timeout: 15000 });
    record(`${tag}:replay-same-seed`, rep.replay && rep.seed === seedBefore, { note: `seed ${seedBefore} -> ${rep.seed}` });

    // Record a real cast: countdown, sign, cast, +1 s.
    await page.evaluate(() => window.__feed.clear());
    await app(page, () => window.__domainPermit.goLive());
    await page.waitForFunction(() => window.__domainPermit.mode === 'live');
    const since = Date.now();
    await page.click('#btn-record');
    const dRec = trained.includes('megumi') ? 'megumi' : trained[0];
    await page.waitForFunction(() => window.__domainPermit.rec.phase === 'recording', { timeout: 10000 });
    if (!(await showUntilCast(page, feed, dRec, 2))) throw new Error(`${dRec} did not cast while recording`);
    await page.waitForFunction(() => window.__domainPermit.clip, { timeout: 40000 });
    await page.evaluate(() => window.__feed.clear());
    const clip = await app(page, () => ({ mime: window.__domainPermit.clip.mime, ext: window.__domainPermit.clip.ext, ms: window.__domainPermit.clip.durationMs, audio: window.__domainPermit.clip.hasAudio, domain: window.__domainPermit.clip.domain }));
    await page.click('#btn-clip');
    const file = await waitDownload('domain-permit-', clip.ext, since);
    const p = probe(file);
    try {
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', '5', '-i', file, '-frames:v', '1', join(OUT, `${tag}-clip-frame-5s.png`)]);
    } catch {
      /* optional */
    }
    record(`${tag}:recorded-clip`, clip.ms > 7000 && !p.error, { clip, probe: p, note: `${clip.domain} ${clip.ext} ${(clip.ms / 1000).toFixed(1)} s ${clip.mime} audio=${clip.audio}` });

    // Delete training: nothing fires afterwards.
    await app(page, () => window.__domainPermit.deleteAllTraining());
    await sleep(300);
    const after = await app(page, () => ({ caps: window.__domainPermit.captures.length, live: window.__domainPermit.trainedDomains().length }));
    record(`${tag}:delete-training`, after.caps === 0 && after.live === 0, { note: `captures ${after.caps}, live signs ${after.live}` });
    note(`photo swaps after detector misses: ${JSON.stringify(swaps)}`);
    record(`${tag}:detector-swaps`, true, { swaps, note: `teach captures ${swaps.capture}, challenge trials ${swaps.trial}, live ${swaps.live} (harness showed another photo after the palm detector missed a hand)` });
    const bad = unexplainedErrors(errors, blocked);
    record(`${tag}:console-clean`, bad.length === 0, { errors: errors.slice(0, 10), blocked: blocked.length, note: `${bad.length} unexplained console errors (${errors.length - bad.length} from ${blocked.length} sandbox-blocked model requests to storage.googleapis.com)` });
    const third = thirdParty(requests);
    record(`${tag}:no-third-party-requests`, third.length === 0, { third: third.slice(0, 10), total: requests.length, note: `${requests.length} requests, ${third.length} to hosts other than this app and the MediaPipe model bucket${third.length ? `: ${[...new Set(third.map((u) => new URL(u).host))].join(', ')}` : ''}` });
  } catch (e) {
    // Leave enough behind to debug a stall: the stage, the panel and the app state.
    await page.screenshot({ path: join(OUT, `${tag}-failure.png`) }).catch(() => {});
    const state = await app(page, () => {
      const a = window.__domainPermit;
      const T = a.teach;
      return {
        mode: a.mode,
        teach: T && { kind: T.kind, index: T.index, slot: T.slot, phase: T.phase, status: T.status },
        feat: a.hand.feat && { count: a.hand.feat.count, info: a.hand.feat.info },
        hands: a.hand.frame && a.hand.frame.hands.map((h) => ({ label: h.handedness, score: +h.score.toFixed(3) })),
        cls: a.hand.cls,
        gate: a.gate && a.gate.state,
        stats: a.tracker.stats,
        captures: a.captures.length,
        panel: document.getElementById('panel').innerText.slice(0, 400),
      };
    }).catch((err) => ({ error: err.message }));
    writeFileSync(join(OUT, `${tag}-failure-state.json`), JSON.stringify(state, null, 1));
    note(`FAILED: ${e.message.split('\n')[0]} · state ${JSON.stringify(state).slice(0, 600)}`);
    throw e;
  } finally {
    writeFileSync(join(OUT, `${tag}-timeline.txt`), timeline.join('\n'));
    await page.close();
    if (segModel) rmSync(join(ROOT, 'public', '__test__'), { recursive: true, force: true });
  }
}

// Real Image Segmenter in the running app. A full photo of a person is the
// camera; the cast is started by the harness (no sign involved) so this checks
// only the person cutout path. Output images show a real person: they stay in
// the --out folder and are never committed.
async function segmentation(browser, segModel, photo, info) {
  mkdirSync(join(ROOT, 'public', '__test__'), { recursive: true });
  copyFileSync(segModel, join(ROOT, 'public', '__test__', 'seg.tflite'));
  const open = async (extra) => {
    const opened = await openPage(browser, { path: `/?debug=1&delegate=cpu&segModel=${encodeURIComponent('/__test__/seg.tflite')}${extra}` });
    const { page } = opened;
    await page.evaluate((d) => window.__feed.load('person', d), `data:image/jpeg;base64,${readFileSync(photo).toString('base64')}`);
    await page.evaluate((it) => window.__feed.set([it]), { img: 'person', cx: 320, cy: 240, scale: Math.max(640 / info.w, 480 / info.h) });
    await page.click('#start-camera');
    await page.waitForFunction(() => window.__domainPermit.mode === 'library', { timeout: 120000 });
    await page.waitForFunction(() => ['ready', 'failed', 'slow'].includes(window.__domainPermit.models.seg), { timeout: 60000 });
    return opened;
  };
  const state = (page) =>
    app(page, () => {
      const a = window.__domainPermit;
      let on = 0;
      for (const v of a.mask.smooth || []) if (v > 0.5) on++;
      const st = a.tracker.stats;
      return { seg: a.models.seg, src: a.models.segSrc, note: a.models.segNote, segEnabled: a.segEnabled, coverage: a.mask.smooth ? +(on / a.mask.smooth.length).toFixed(3) : 0, segFrames: st.segFrames, segMs: Math.round(st.segMs), handFrames: st.handFrames, handMs: Math.round(st.handMs) };
    });
  try {
    // 1. Hand tracking capped at 6 fps leaves this slow CPU room to segment.
    await step('segmentation:person-cutout', async () => {
      const { page, errors } = await open('&handFps=6');
      try {
        await page.waitForFunction(() => window.__domainPermit.tracker.stats.segFrames > 15 || !window.__domainPermit.segEnabled, { timeout: 45000 }).catch(() => {});
        const m = await state(page);
        if (m.seg !== 'ready' || m.segFrames <= 15) throw new Error(`segmentation did not run: ${JSON.stringify(m)}`);
        await canvasPng(page, join(OUT, 'segmentation-live.png'));
        await app(page, () => window.__domainPermit.startCast('sukuna', performance.now()));
        await sleep(1500);
        const during = await app(page, () => {
          const a = window.__domainPermit;
          const now = performance.now();
          return { person: a.stage.personAvailable({ ...a.stageState(now), now }) };
        });
        await app(page, () => window.__domainPermit.freezeCastAt(3.0));
        await raf2(page);
        await raf2(page);
        const frozen = await app(page, () => {
          const a = window.__domainPermit;
          const now = a.clockOverride ?? performance.now();
          return { person: a.stage.personAvailable({ ...a.stageState(now), now }), seg: a.models.seg, note: a.models.segNote, maskAgeMs: Math.round(now - a.mask.lastUpdate) };
        });
        await canvasPng(page, join(OUT, 'segmentation-cast-3s.png'));
        await app(page, () => window.__domainPermit.releaseClock());
        await page.waitForFunction(() => !window.__domainPermit.run, { timeout: 15000 });
        const after = await state(page);
        const ok = m.coverage > 0.05 && m.coverage < 0.95 && during.person && frozen.person && after.seg === 'ready' && errors.length === 0;
        record('segmentation:person-cutout', ok, { m, during, frozen, after, errors: errors.slice(0, 5), note: `segmenter ${m.src}; person covers ${(m.coverage * 100).toFixed(0)}% of the frame; ${m.segFrames} masks at ~${m.segMs} ms with hands at ~${m.handMs} ms; cutout during the cast: ${during.person} at 1.5 s, ${frozen.person} at 3 s (mask age ${frozen.maskAgeMs} ms); after: ${after.seg}${after.note ? ` (${after.note})` : ''}` });
      } finally {
        await page.close();
      }
    });
    // 2. At the default 18 fps this CPU spends every frame on hands: the app must notice and fall back.
    await step('segmentation:starved-fallback', async () => {
      const { page, errors } = await open('');
      try {
        await page.waitForFunction(() => window.__domainPermit.models.seg === 'slow', { timeout: 20000 }).catch(() => {});
        const m = await state(page);
        const panel = await page.$eval('#stage-status', (e) => e.innerText).catch(() => '');
        const ok = m.seg === 'slow' && !m.segEnabled && errors.length === 0;
        record('segmentation:starved-fallback', ok, { m, panel, note: `seg=${m.seg} after ${m.segFrames} masks, hands at ~${m.handMs} ms; note: ${m.note}` });
      } finally {
        await page.close();
      }
    });
  } finally {
    rmSync(join(ROOT, 'public', '__test__'), { recursive: true, force: true });
  }
}

async function fakeDevice() {
  await step('fake-device:real-getUserMedia', async () => {
    const browser = await launch(['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']);
    try {
      const { page, errors } = await openPage(browser, { path: '/?delegate=cpu', feed: false });
      await page.click('#start-camera');
      await page.waitForFunction(() => window.__domainPermit.mode === 'library', { timeout: 120000 });
      await sleep(2500);
      const s = await app(page, () => ({ w: window.__domainPermit.video.videoWidth, h: window.__domainPermit.video.videoHeight, frames: window.__domainPermit.tracker.stats.handFrames, ms: Math.round(window.__domainPermit.tracker.stats.handMs), mirror: window.__domainPermit.cam.mirror }));
      await page.screenshot({ path: join(OUT, 'fake-device-library.png') });
      record('fake-device:real-getUserMedia', s.w > 0 && s.frames > 10, { s, errors: errors.slice(0, 5), note: `${s.w}x${s.h}, ${s.frames} tracker frames at ~${s.ms} ms, mirror=${s.mirror}` });
      // Stop camera releases tracks
      await clickText(page, 'Stop camera');
      const stopped = await app(page, () => window.__domainPermit.cam.status === 'off' && !window.__domainPermit.video.srcObject);
      record('fake-device:stop-camera', stopped, { note: stopped ? 'tracks stopped, stream detached' : 'camera still attached' });
    } finally {
      await browser.close();
    }
  });
}

// ---------------------------------------------------------------------------

const browser = await launch();
try {
  await landingAndLayout(browser);
  await fileOpen(browser);
  await cameraErrors(browser);
  await simulation(browser, { tag: 'sim' });
  await simulation(browser, { tag: 'sim-reduced', reducedMotion: true });
  await toggles(browser);
  await recordingSim(browser);
  const feed = loadFeed();
  const guarded = async (tag, opts) => {
    try {
      await realPipeline(browser, feed, { tag, ...opts });
    } catch (e) {
      record(`${tag}:pipeline`, false, { note: `stopped early: ${e.message.split('\n')[0]}` });
    }
  };
  if (feed && want('real')) await guarded('real');
  if (feed && args['seg-model'] && want('realseg')) await guarded('realseg', { segModel: resolve(args['seg-model']) });
  if (args['seg-model'] && args['seg-photo']) {
    const photo = resolve(args['seg-photo']);
    const boxes = args['feed-boxes'] ? JSON.parse(readFileSync(resolve(args['feed-boxes']), 'utf8')) : {};
    await segmentation(browser, resolve(args['seg-model']), photo, boxes[basename(photo)] || { w: 640, h: 480 });
  }
} finally {
  await browser.close();
}
await fakeDevice();

writeFileSync(join(OUT, 'results.json'), JSON.stringify({ base: BASE, at: new Date().toISOString(), results }, null, 1));
const failed = results.filter((r) => !r.ok);
log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
