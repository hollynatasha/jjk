// Pulls Google's MediaPipe model files into public/models so the app, built or
// not, never has to reach Google storage at runtime. Size and SHA-256 for each
// file go to stdout and into public/models/MODELS.json.
//
//   npm run fetch-models            both models
//   npm run fetch-models -- hand    only the hand landmarker
//   npm run fetch-models -- seg     only the selfie segmenter
//
// Restart `npm run dev` (or rebuild) afterwards: vite.config.js checks which
// local copies exist when it starts.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'public', 'models');

export const MODELS = {
  hand: {
    url: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
    file: 'hand_landmarker.task',
    about: 'MediaPipe Hand Landmarker (float16, version 1), Apache-2.0',
    looksRight: (b) => b.length > 1e6 && b.subarray(0, 64).includes(Buffer.from('PK\x03\x04', 'latin1')), // .task files are zip bundles
  },
  seg: {
    url: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite',
    file: 'selfie_segmenter.tflite',
    about: 'MediaPipe Selfie Segmenter (float16, latest), Apache-2.0',
    looksRight: (b) => b.length > 1e5 && b.subarray(4, 8).toString('latin1') === 'TFL3', // TFLite flatbuffer
  },
};

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const wanted = process.argv.slice(2).filter((a) => MODELS[a]);
  const ids = wanted.length ? wanted : Object.keys(MODELS);
  const manifestPath = join(dir, 'MODELS.json');
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
  let failed = 0;
  for (const id of ids) {
    const m = MODELS[id];
    process.stdout.write(`${m.file} <- ${m.url}\n`);
    try {
      const buf = await download(m.url);
      if (!m.looksRight(buf)) throw new Error(`downloaded ${buf.length} bytes that do not look like a ${m.file} (a proxy or captive portal page?)`);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, m.file), buf);
      const hash = sha256(buf);
      manifest[m.file] = { source: m.url, about: m.about, bytes: buf.length, sha256: hash, fetchedAt: new Date().toISOString() };
      process.stdout.write(`  ${buf.length.toLocaleString('en-US')} bytes  sha256 ${hash}\n`);
    } catch (e) {
      failed++;
      process.stdout.write(`  failed: ${e.message}${e.cause ? ` (${e.cause.code || e.cause.message})` : ''}\n`);
    }
  }
  if (failed < ids.length) writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  if (failed) {
    process.stdout.write('\nSome downloads failed. The app still works: it fetches models from Google storage at runtime, or uses any local copy already in public/models.\n');
    process.exit(1);
  }
  process.stdout.write('\nDone. Restart `npm run dev` or rebuild so the app picks up the local copies.\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
