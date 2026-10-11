// Copies the MediaPipe Tasks Vision WASM fileset out of node_modules into
// public/mediapipe/wasm so the app never depends on a CDN at runtime.
// The fileset version always matches the pinned @mediapipe/tasks-vision in
// package-lock.json, which keeps the JS API and the WASM binary in lockstep.
// Only the two variants FilesetResolver.forVisionTasks() picks from are copied
// (SIMD and no-SIMD); the ES-module worker variant is never loaded by this app.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkgDir = join(root, 'node_modules', '@mediapipe', 'tasks-vision');
const src = join(pkgDir, 'wasm');
const dest = join(root, 'public', 'mediapipe', 'wasm');

if (!existsSync(src)) {
  console.warn('[copy-wasm] @mediapipe/tasks-vision is not installed yet; skipping.');
  process.exit(0);
}

const version = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')).version;
const label = `${version} (simd + nosimd)`;
const stamp = join(dest, 'VERSION');
if (existsSync(stamp) && readFileSync(stamp, 'utf8').trim() === label) {
  process.exit(0);
}

const files = readdirSync(src).filter((f) => /^vision_wasm(_nosimd)?_internal\.(js|wasm)$/.test(f));
if (files.length !== 4) {
  console.error(`[copy-wasm] expected 4 runtime files in ${src}, found: ${files.join(', ') || 'none'}`);
  process.exit(1);
}
rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
for (const f of files) copyFileSync(join(src, f), join(dest, f));
writeFileSync(stamp, `${label}\n`);
console.log(`[copy-wasm] copied ${files.length} files from @mediapipe/tasks-vision@${version}`);
