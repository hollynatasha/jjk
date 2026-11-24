// Offline accuracy report for the pose matcher. No camera anywhere; the hands
// come from src/handmodel.
//
// Default run trains the matcher the way the app does (twelve taught captures
// per sign across the capture views, plus the neutral set) then classifies
// held-out synthetic frames: fresh seeds, every view, a range of tracker noise,
// canonical poses and the friendlier ones people are actually taught. Reports
// recall per sign, false accepts on neutrals and on the other signs, margin.
//
// --data <export.json> scores a real export from the Training data dialog
// instead. Twelve captures per sign is too few to hold any back, so that mode
// runs leave-one-capture-out: withhold a capture, rebuild from the rest,
// classify the withheld frames cold. Honest number for whoever recorded it.
//
//   node scripts/eval-matcher.mjs [--json] [--noise 1,1.5,2] [--trials 40]
//   node scripts/eval-matcher.mjs --data ~/Downloads/domain-expansion-training-*.json

import { readFileSync } from 'node:fs';
import { PoseMatcher, NEUTRAL } from '../src/core/matcher.js';
import { trainDomain, neutralCaptures, featFor, LABELS, SIGN_SCENES, NEUTRAL_SCENES } from '../tests/fixtures/hands.js';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : '1']);
    return acc;
  }, []),
);
const IDS = ['gojo', 'sukuna', 'megumi'];
const VIEWS = ['center', 'left', 'right', 'near', 'far', 'mid'];
const NOISES = (args.noise || '1,1.6,2.2').split(',').map(Number);
const TRIALS = Number(args.trials || 40);
// far from the training seeds, so nothing gets scored on a frame it learnt
const HELD_OUT = 900000;

function train() {
  const caps = [...neutralCaptures()];
  let t = 10;
  for (const d of IDS) {
    caps.push(...trainDomain(d, { baseSeed: 1000 + t * 100, createdAt: t }));
    t += 20;
  }
  const m = new PoseMatcher();
  m.setData(caps, LABELS);
  return m;
}

const pct = (n, d) => (d ? (100 * n) / d : 0);

function evaluate(m) {
  const rows = {};
  const margins = [];
  let seed = HELD_OUT;

  // --- recall: the sign should fire when it is made -------------------------
  for (const d of IDS) {
    const row = { accepted: 0, total: 0, byView: {}, byNoise: {}, rejectReasons: {}, wrongLabel: 0 };
    for (const variant of ['friendly', 'canonical']) {
      const scene = SIGN_SCENES[d][variant];
      if (!scene) continue;
      for (const view of VIEWS) {
        for (const noise of NOISES) {
          for (let i = 0; i < TRIALS; i++) {
            const feat = featFor(scene, (seed += 7), { view, noise });
            const r = m.classify(feat);
            row.total++;
            row.byView[view] = row.byView[view] || { a: 0, n: 0 };
            row.byView[view].n++;
            row.byNoise[noise] = row.byNoise[noise] || { a: 0, n: 0 };
            row.byNoise[noise].n++;
            if (r.accepted && r.best === d) {
              row.accepted++;
              row.byView[view].a++;
              row.byNoise[noise].a++;
              margins.push(r.margin);
            } else if (r.accepted) {
              row.wrongLabel++;
              row.rejectReasons[`fired as ${r.best}`] = (row.rejectReasons[`fired as ${r.best}`] || 0) + 1;
            } else {
              row.rejectReasons[r.reason] = (row.rejectReasons[r.reason] || 0) + 1;
            }
          }
        }
      }
    }
    rows[d] = row;
  }

  // --- false accepts: neutral poses must never fire anything ---------------
  const neutral = { fired: 0, total: 0, as: {} };
  for (const [name, scene] of Object.entries(NEUTRAL_SCENES)) {
    for (const view of VIEWS) {
      for (const noise of NOISES) {
        for (let i = 0; i < Math.ceil(TRIALS / 2); i++) {
          const r = m.classify(featFor(scene, (seed += 11), { view, noise }));
          neutral.total++;
          if (r.accepted) {
            neutral.fired++;
            neutral.as[`${name}->${r.best}`] = (neutral.as[`${name}->${r.best}`] || 0) + 1;
          }
        }
      }
    }
  }
  margins.sort((a, b) => a - b);
  return { rows, neutral, marginP10: margins[Math.floor(margins.length * 0.1)] ?? 0, marginMedian: margins[Math.floor(margins.length * 0.5)] ?? 0 };
}

/**
 * Leave-one-capture-out over a real export. Negatives are scored against the
 * full matcher, since that is how the app uses them.
 */
function evaluateReal(path) {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const all = raw.captures || raw;
  const labels = Object.fromEntries(Object.keys(raw.domains || {}).map((d) => [d, d]));
  const signs = [...new Set(all.filter((c) => c.kind === 'positive').map((c) => c.domain))].sort();

  const full = new PoseMatcher();
  full.setData(all, { ...LABELS, ...labels });

  const rows = {};
  for (const d of signs) {
    const row = { accepted: 0, total: 0, reasons: {}, wrong: {}, perCapture: [] };
    for (const held of all.filter((c) => c.kind === 'positive' && c.domain === d)) {
      // withholding one leaves eleven, under the normal minimum, so relax the
      // minimum by exactly one for the fold
      const m = new PoseMatcher({ minCaptures: 11 });
      m.setData(all.filter((c) => c !== held), { ...LABELS, ...labels });
      if (!m.isTrained(d)) {
        row.reasons['sign not learned without this capture'] = (row.reasons['sign not learned without this capture'] || 0) + 1;
        row.total += held.vectors.length;
        continue;
      }
      let ok = 0;
      for (const v of held.vectors) {
        const feat = { count: held.handCount, variants: [Float32Array.from(v)], chirality: held.chirality, chiralityScore: 1 };
        const r = m.classify(feat);
        row.total++;
        if (r.accepted && r.best === d) {
          row.accepted++;
          ok++;
        } else if (r.accepted) {
          row.wrong[r.best] = (row.wrong[r.best] || 0) + 1;
          row.reasons[`fired as ${r.best}`] = (row.reasons[`fired as ${r.best}`] || 0) + 1;
        } else {
          row.reasons[r.reason] = (row.reasons[r.reason] || 0) + 1;
        }
      }
      row.perCapture.push({ slot: held.slot, view: held.view, ok, of: held.vectors.length });
    }
    rows[d] = row;
  }

  // negatives must not fire anything
  const neutral = { fired: 0, total: 0, as: {} };
  for (const c of all.filter((x) => x.kind === 'negative')) {
    for (const v of c.vectors) {
      const feat = { count: c.handCount, variants: [Float32Array.from(v)], chirality: c.chirality, chiralityScore: 1 };
      const r = full.classify(feat);
      neutral.total++;
      if (r.accepted) {
        neutral.fired++;
        const key = `${c.prompt || 'neutral'}->${r.best}`;
        neutral.as[key] = (neutral.as[key] || 0) + 1;
      }
    }
  }
  return { signs, rows, neutral, full };
}

if (args.data) {
  const path = args.data.replace('~', process.env.HOME);
  const { signs, rows, neutral, full } = evaluateReal(path);
  console.log(`matcher accuracy, REAL captures, leave-one-capture-out\n${path}\n`);
  console.log(`${'sign'.padEnd(8)} ${'recall'.padStart(8)} ${'thr'.padStart(7)}  ${'status'.padEnd(12)} top reason it missed`);
  let A = 0;
  let T = 0;
  for (const d of signs) {
    const r = rows[d];
    A += r.accepted;
    T += r.total;
    const rep = full.reports[d] || {};
    const reason = Object.entries(r.reasons).sort((a, b) => b[1] - a[1])[0];
    console.log(
      `${d.padEnd(8)} ${pct(r.accepted, r.total).toFixed(1).padStart(7)}% ${(rep.threshold ? rep.threshold.toFixed(4) : '-').padStart(7)}  ${(rep.status || '-').padEnd(12)} ${reason ? `${reason[0]} (${reason[1]})` : '-'}`,
    );
  }
  console.log(`\noverall recall            ${pct(A, T).toFixed(1)}%  (${A}/${T})`);
  console.log(`neutral false accepts     ${pct(neutral.fired, neutral.total).toFixed(1)}%  (${neutral.fired}/${neutral.total})`);
  if (neutral.fired) console.log(`  ${Object.entries(neutral.as).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} x${v}`).join(', ')}`);
  for (const d of signs) {
    const rep = full.reports[d];
    if (rep && rep.status !== 'learned') console.log(`\n!! ${d}: ${rep.message}`);
    const weak = rows[d].perCapture.filter((c) => c.ok < c.of);
    if (weak.length) console.log(`   ${d} weak captures: ${weak.map((c) => `${c.view || '?'}#${c.slot} ${c.ok}/${c.of}`).join(', ')}`);
  }
  process.exit(0);
}

const m = train();
const untrained = IDS.filter((d) => !m.isTrained(d));
const out = evaluate(m);

if (args.json) {
  console.log(JSON.stringify({ untrained, ...out }, null, 1));
} else {
  console.log('matcher accuracy, held-out synthetic frames\n');
  if (untrained.length) console.log(`!! not learned from the taught set: ${untrained.join(', ')}\n`);
  console.log(`${'sign'.padEnd(8)} ${'recall'.padStart(8)} ${'thr'.padStart(7)}   weakest view        top reject reason`);
  for (const d of IDS) {
    const r = out.rows[d];
    const views = Object.entries(r.byView).map(([v, x]) => [v, pct(x.a, x.n)]).sort((a, b) => a[1] - b[1]);
    const reason = Object.entries(r.rejectReasons).sort((a, b) => b[1] - a[1])[0];
    const thr = m.reports[d] && m.reports[d].threshold;
    console.log(
      `${d.padEnd(8)} ${pct(r.accepted, r.total).toFixed(1).padStart(7)}% ${(thr ? thr.toFixed(4) : '-').padStart(7)}   ` +
        `${views[0] ? `${views[0][0]} ${views[0][1].toFixed(0)}%`.padEnd(18) : '-'.padEnd(18)}  ${reason ? `${reason[0]} (${reason[1]})` : '-'}`,
    );
  }
  const noiseCols = NOISES.map((n) => {
    const a = IDS.reduce((s, d) => s + (out.rows[d].byNoise[n] ? out.rows[d].byNoise[n].a : 0), 0);
    const t = IDS.reduce((s, d) => s + (out.rows[d].byNoise[n] ? out.rows[d].byNoise[n].n : 0), 0);
    return `noise ${n}: ${pct(a, t).toFixed(1)}%`;
  });
  console.log(`\nrecall by tracker noise   ${noiseCols.join('   ')}`);
  const allA = IDS.reduce((s, d) => s + out.rows[d].accepted, 0);
  const allT = IDS.reduce((s, d) => s + out.rows[d].total, 0);
  const cross = IDS.reduce((s, d) => s + out.rows[d].wrongLabel, 0);
  console.log(`overall recall            ${pct(allA, allT).toFixed(1)}%  (${allA}/${allT})`);
  console.log(`fired as the wrong sign   ${pct(cross, allT).toFixed(2)}%  (${cross}/${allT})`);
  console.log(`neutral false accepts     ${pct(out.neutral.fired, out.neutral.total).toFixed(2)}%  (${out.neutral.fired}/${out.neutral.total})`);
  if (out.neutral.fired) console.log(`  ${Object.entries(out.neutral.as).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k} x${v}`).join(', ')}`);
  console.log(`decision margin           p10 ${out.marginP10.toFixed(3)}   median ${out.marginMedian.toFixed(3)}`);
}
