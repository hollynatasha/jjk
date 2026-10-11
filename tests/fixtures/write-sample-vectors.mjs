// Writes tests/fixtures/sample-vectors.json: a SYNTHETIC training export made
// from the procedural hand in src/handmodel (no camera, no person). It shows
// exactly what the app stores (labelled landmark-derived vectors, nothing
// else) and feeds the import and matcher tests. Run: npm run vectors
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeCapture, trainDomain, SIGN_SCENES, NEUTRAL_SCENES } from './hands.js';
import { serializeCapture, EXPORT_FORMAT } from '../../src/core/storage.js';
import { FEATURE_VERSION } from '../../src/core/features.js';
import { SLOT_VIEWS, NEG_PROMPTS } from '../../src/core/prompts.js';

// Which synthetic neutral pose stands for each neutral prompt.
const NEG_SCENE = { 'open-palm': 'openR', fist: 'fistR', peace: 'peaceR', wave: 'openL', relaxed: 'relaxedBoth', palms: 'openBoth', clap: 'prayerBoth', fists: 'fistBoth' };

export function buildSampleExport() {
  const captures = [];
  for (const [di, domain] of ['gojo', 'sukuna', 'megumi', 'higuruma'].entries()) {
    const caps = trainDomain(domain, { scene: SIGN_SCENES[domain].friendly, baseSeed: 2000 + di * 400, createdAt: 1_700_000_000_000 + di * 1000 });
    caps.forEach((c, i) => {
      captures.push(serializeCapture({ ...c, id: `synthetic-${domain}-${i}`, variant: 'friendly', flipped: false, slot: i, view: SLOT_VIEWS[i].id }));
    });
  }
  NEG_PROMPTS.forEach((p, i) => {
    const c = makeCapture({ scene: NEUTRAL_SCENES[NEG_SCENE[p.id]], kind: 'negative', seed: 9000 + i * 31, view: ['center', 'left', 'right'][i % 3], createdAt: 1_700_000_000_000 - 1000 + i });
    captures.push(serializeCapture({ ...c, id: `synthetic-neg-${p.id}`, prompt: p.id }));
  });
  return {
    format: EXPORT_FORMAT,
    featureVersion: FEATURE_VERSION,
    exportedAt: '2026-10-12T00:00:00.000Z',
    synthetic: true,
    note: 'SYNTHETIC sample: vectors computed from the procedural hand model in src/handmodel, not from any camera or person. Landmark-derived feature vectors only; no images or video. Importing it does not make a sign "ready": only the Test my signs challenge can, and these shapes will not match a real hand well.',
    captures,
    domains: {},
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = fileURLToPath(new URL('./sample-vectors.json', import.meta.url));
  const data = buildSampleExport();
  writeFileSync(out, `${JSON.stringify(data, null, 1)}\n`);
  console.log(`wrote ${data.captures.length} synthetic captures to ${out}`);
}
