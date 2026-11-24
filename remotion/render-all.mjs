// Renders every domain background into ../public/domains/.
import { execFileSync } from 'node:child_process';
import { mkdirSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'public', 'domains');
mkdirSync(out, { recursive: true });

const CLIPS = [
  ['UnlimitedVoid', 'unlimited-void'],
  ['MalevolentShrine', 'malevolent-shrine'],
  ['ChimeraShadowGarden', 'chimera-shadow-garden'],
];

/**
 * The app plays these against the cast clock and sometimes has to seek. A seek
 * lands the decoder on the previous keyframe and it runs forward from there
 * before it can present anything, so with one keyframe per clip every
 * correction stalls and the backdrop tears into offset blocks. -g 15 puts a
 * keyframe every half second, which makes a seek cheap. yuv420p keeps the
 * range flags off, faster than Remotion's yuvj420p in some decoders.
 */
function stampKeyframes(file) {
  const src = join(out, `${file}.mp4`);
  const tmp = join(out, `${file}.seekable.mp4`);
  execFileSync('ffmpeg', ['-v', 'error', '-i', src, '-c:v', 'libx264', '-crf', '23', '-preset', 'slow', '-g', '15', '-keyint_min', '15', '-sc_threshold', '0', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-y', tmp], { stdio: 'inherit' });
  renameSync(tmp, src);
}

for (const [id, file] of CLIPS) {
  console.log(`rendering ${id}`);
  execFileSync('npx', ['remotion', 'render', 'src/index.ts', id, join(out, `${file}.mp4`), '--codec=h264', '--crf=23', '--concurrency=4', `--browser-executable=${process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}`, '--gl=angle'], { cwd: here, stdio: 'inherit' });
  stampKeyframes(file);
}
