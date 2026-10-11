// Regenerates the four original pose-card SVGs in src/assets/pose-cards from
// the procedural hand model. Run: node scripts/build-pose-cards.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { poseCardFile } from '../src/ui/posecard.js';
import { DOMAIN_IDS } from '../src/domains/catalog.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'src', 'assets', 'pose-cards');
mkdirSync(out, { recursive: true });
for (const id of DOMAIN_IDS) {
  writeFileSync(join(out, `${id}.svg`), poseCardFile(id));
  console.log(`wrote src/assets/pose-cards/${id}.svg`);
}
