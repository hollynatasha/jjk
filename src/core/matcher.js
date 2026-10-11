// The department's entire "AI": a nearest-neighbour matcher over Holly's own
// captures. Each taught sign keeps its captured vectors as templates; every
// other trained sign plus the neutral poses act as negatives. Thresholds are
// learned per sign from leave-one-capture-out distances.

import { featureDistance } from './features.js';

export const MATCH_DEFAULTS = {
  minCaptures: 12,
  minNegatives: 8,
  margin: 0.12,
  thrScale: 1.4,
  thrPad: 0.015,
  thrMin: 0.05,
  thrMax: 0.6,
  negCap: 0.85,
  handednessGateScore: 0.8,
};

const toF32 = (v) => (v instanceof Float32Array ? v : Float32Array.from(v));

function quantile(arr, q) {
  if (!arr.length) return NaN;
  const a = arr.slice().sort((x, y) => x - y);
  const pos = (a.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return a[lo] + (a[hi] - a[lo]) * (pos - lo);
}

function majority(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  let best = null;
  let n = -1;
  for (const [v, c] of counts) {
    if (c > n) {
      best = v;
      n = c;
    }
  }
  return best;
}

export const NEUTRAL = 'neutral';

export class PoseMatcher {
  constructor(options = {}) {
    this.opts = { ...MATCH_DEFAULTS, ...options };
    this.captures = [];
    this.models = {};
    this.reports = {};
    this.labels = {};
  }

  /**
   * captures: [{ id, kind: 'positive'|'negative', domain, handCount, chirality, vectors, quality }]
   * labels: optional { domainId: 'Display name' } for messages.
   */
  setData(captures, labels = {}) {
    this.labels = labels;
    this.captures = captures
      .filter((c) => c && Array.isArray(c.vectors) && c.vectors.length && (c.handCount === 1 || c.handCount === 2))
      .map((c) => ({ ...c, vectors: c.vectors.map(toF32) }));
    this.validateAll();
    return this.reports;
  }

  name(id) {
    if (id === NEUTRAL) return 'your neutral poses';
    return this.labels[id] || id;
  }

  domainsWithData() {
    return [...new Set(this.captures.filter((c) => c.kind === 'positive').map((c) => c.domain))];
  }

  positives(domain) {
    return this.captures.filter((c) => c.kind === 'positive' && c.domain === domain);
  }

  negatives(count) {
    return this.captures.filter((c) => c.kind === 'negative' && c.handCount === count);
  }

  negativeCount() {
    return this.captures.filter((c) => c.kind === 'negative').length;
  }

  /**
   * Captures that count against this domain: neutral poses plus the positives
   * of the other signs currently in play, restricted to the same hand count.
   */
  others(domain, count, activeSet = null) {
    return this.captures
      .filter((c) => c.handCount === count)
      .filter((c) => (c.kind === 'negative' ? true : c.domain !== domain && (!activeSet || activeSet.has(c.domain))))
      .map((c) => ({ label: c.kind === 'negative' ? NEUTRAL : c.domain, cap: c }));
  }

  lastTrainedAt(domain) {
    let t = 0;
    for (const c of this.positives(domain)) t = Math.max(t, c.createdAt || 0);
    return t;
  }

  static minDistance(v, caps, count) {
    let best = Infinity;
    for (const c of caps) {
      for (const t of c.vectors) {
        if (t.length !== v.length) continue;
        const d = featureDistance(v, t, count);
        if (d < best) best = d;
      }
    }
    return best;
  }

  static nearestLabel(v, labelled, count) {
    let best = { label: null, dist: Infinity };
    for (const { label, cap } of labelled) {
      for (const t of cap.vectors) {
        if (t.length !== v.length) continue;
        const d = featureDistance(v, t, count);
        if (d < best.dist) best = { label, dist: d };
      }
    }
    return best;
  }

  validate(domain, activeSet = null) {
    const o = this.opts;
    const all = this.positives(domain);
    const report = {
      domain,
      captures: all.length,
      handCount: all.length ? majority(all.map((c) => c.handCount)) : null,
      chirality: null,
      status: 'untrained',
      threshold: null,
      confusions: {},
      misses: [],
      flagged: [],
      hidden: [],
      looPos: [],
      looNeg: [],
      negCapped: false,
      message: 'Not taught yet.',
    };
    if (!all.length) return report;
    const count = report.handCount;
    const caps = all.filter((c) => c.handCount === count);
    const wrongCount = all.filter((c) => c.handCount !== count).map((c) => c.id);
    if (count === 1) report.chirality = majority(caps.map((c) => c.chirality).filter(Boolean)) || null;
    if (caps.length < o.minCaptures) {
      report.status = 'incomplete';
      report.flagged = wrongCount;
      report.message = `${caps.length}/${o.minCaptures} captures. Keep going.`;
      return report;
    }

    const others = this.others(domain, count, activeSet);
    const perCapture = [];
    for (const c of caps) {
      const rest = caps.filter((x) => x !== c);
      const pos = [];
      const votes = [];
      let negMin = Infinity;
      let negLabel = null;
      for (const v of c.vectors) {
        const p = PoseMatcher.minDistance(v, rest, count);
        pos.push(p);
        report.looPos.push(p);
        const nb = PoseMatcher.nearestLabel(v, others, count);
        if (nb.label) {
          report.looNeg.push(nb.dist);
          if (nb.dist < negMin) {
            negMin = nb.dist;
            negLabel = nb.label;
          }
        }
        votes.push(nb.label && nb.dist < p ? nb.label : domain);
      }
      perCapture.push({ id: c.id, slot: c.slot, pos: quantile(pos, 0.5), neg: negMin, negLabel, predicted: majority(votes), hidden: !!(c.quality && c.quality.hidden) });
    }

    const q90 = quantile(report.looPos, 0.9);
    let thr = Math.min(o.thrMax, Math.max(o.thrMin, q90 * o.thrScale + o.thrPad));
    if (report.looNeg.length) {
      const negQ = quantile(report.looNeg, 0.1);
      const capped = Math.max(o.thrMin * 0.5, Math.min(thr, o.negCap * negQ));
      report.negCapped = capped < thr - 1e-9;
      thr = capped;
    }
    report.threshold = thr;

    for (const pc of perCapture) {
      if (pc.predicted !== domain) report.confusions[pc.predicted] = (report.confusions[pc.predicted] || 0) + 1;
      if (pc.pos > thr) report.misses.push(pc.id);
      if (pc.hidden) report.hidden.push(pc.id);
    }
    report.perCapture = perCapture;
    let totalConfusion = Object.values(report.confusions).reduce((s, x) => s + x, 0);
    let top = Object.entries(report.confusions).sort((a, b) => b[1] - a[1])[0];
    const n = caps.length;
    // A threshold squeezed by nearby negatives that then rejects several of
    // the sign's own captures is the same problem as an outright confusion:
    // name the neighbour that squeezed it.
    if (totalConfusion < 2 && report.negCapped && report.misses.length >= 3) {
      const squeezed = {};
      for (const pc of perCapture) if (report.misses.includes(pc.id) && pc.negLabel) squeezed[pc.negLabel] = (squeezed[pc.negLabel] || 0) + 1;
      const s = Object.entries(squeezed).sort((a, b) => b[1] - a[1])[0];
      if (s) {
        top = s;
        totalConfusion = s[1];
        report.confusions = { ...report.confusions, [s[0]]: Math.max(report.confusions[s[0]] || 0, s[1]) };
      }
    }
    report.flagged = [
      ...new Set([...wrongCount, ...report.hidden, ...report.misses, ...perCapture.filter((p) => p.predicted !== domain).map((p) => p.id)]),
    ];

    if (report.hidden.length >= 3) {
      report.status = 'hidden';
      report.message = `Hands hidden: retake. ${report.hidden.length}/${n} captures had a merged or hidden hand.`;
    } else if (totalConfusion >= 2 && top) {
      report.status = 'confusable';
      report.confusedWith = top[0];
      const advice = top[0] === NEUTRAL ? 'exaggerate the sign or retrain' : count === 2 ? 'separate wrists or retrain' : 'change the finger shape or retrain';
      report.message = `${this.name(domain)} resembles ${this.name(top[0])} in ${top[1]}/${n} tries—${advice}.`;
    } else if (report.misses.length >= 3) {
      report.status = 'inconsistent';
      report.message = `${report.misses.length}/${n} captures don't match the rest. Retake the flagged ones.`;
    } else {
      report.status = 'learned';
      report.message = 'Learned.';
    }
    return report;
  }

  /**
   * Validates every sign. When two signs collide, the one taught most recently
   * is held back (reported, never live) and the others are re-validated
   * without it, so a bad new capture set can't silently break a working sign.
   */
  validateAll() {
    const reports = {};
    const domains = this.domainsWithData();
    const active = new Set();
    for (const d of domains) {
      const r = this.validate(d, new Set());
      if (r.status === 'incomplete' || r.status === 'untrained') reports[d] = r;
      else active.add(d);
    }
    let round = {};
    while (active.size) {
      round = {};
      for (const d of active) round[d] = this.validate(d, active);
      const failing = [...active].filter((d) => round[d].status !== 'learned');
      if (!failing.length) break;
      const newest = failing.sort((a, b) => this.lastTrainedAt(b) - this.lastTrainedAt(a))[0];
      reports[newest] = round[newest];
      active.delete(newest);
      round = {};
    }
    for (const d of active) reports[d] = round[d];
    const models = {};
    for (const d of active) {
      const r = reports[d];
      if (r && r.status === 'learned') models[d] = { threshold: r.threshold, handCount: r.handCount, chirality: r.chirality, status: r.status };
    }
    this.reports = reports;
    this.models = models;
    return reports;
  }

  isTrained(domain) {
    return !!this.models[domain];
  }

  /**
   * Classify one frame's features. A domain is accepted only if it is inside
   * its learned threshold, clearly closer than every alternative (other signs
   * and neutral poses), and passes the hand-count and handedness gates.
   */
  classify(feat) {
    const o = this.opts;
    const res = {
      count: feat ? feat.count : 0,
      best: null,
      accepted: false,
      dist: Infinity,
      threshold: null,
      margin: 0,
      confidence: 0,
      runnerUp: null,
      runnerUpDist: Infinity,
      reason: 'no-hands',
    };
    if (!feat || !feat.count) return res;
    const trained = Object.entries(this.models);
    if (!trained.length) {
      res.reason = 'untrained';
      return res;
    }
    const candidates = trained.filter(([, m]) => m.handCount === feat.count);
    if (!candidates.length) {
      res.reason = 'count';
      res.expectedCounts = [...new Set(trained.map(([, m]) => m.handCount))];
      return res;
    }
    const scored = candidates.map(([d, m]) => {
      let best = Infinity;
      for (const v of feat.variants) best = Math.min(best, PoseMatcher.minDistance(v, this.positives(d).filter((c) => c.handCount === m.handCount), feat.count));
      return { d, m, dist: best };
    });
    scored.sort((a, b) => a.dist - b.dist);
    const top = scored[0];
    let negDist = Infinity;
    const negs = this.negatives(feat.count);
    for (const v of feat.variants) negDist = Math.min(negDist, PoseMatcher.minDistance(v, negs, feat.count));
    const second = scored[1] ? scored[1].dist : Infinity;
    const alt = Math.min(negDist, second);
    res.best = top.d;
    res.dist = top.dist;
    res.threshold = top.m.threshold;
    res.runnerUp = second <= negDist ? (scored[1] ? scored[1].d : null) : NEUTRAL;
    res.runnerUpDist = alt;
    res.margin = Number.isFinite(alt) ? (alt - top.dist) / Math.max(alt, 1e-9) : 1;
    const thr = top.m.threshold;
    const closeness = Math.min(1, Math.max(0, (1.6 * thr - top.dist) / (1.2 * thr)));
    const separation = Math.min(1, Math.max(0, res.margin / 0.35));
    res.confidence = closeness * (0.35 + 0.65 * separation);

    let handOk = true;
    if (feat.count === 1 && top.m.chirality && feat.chirality && feat.chirality !== top.m.chirality && (feat.chiralityScore ?? 1) >= o.handednessGateScore) {
      handOk = false;
    }
    if (top.dist > thr) res.reason = 'far';
    else if (res.margin < o.margin) res.reason = 'ambiguous';
    else if (!handOk) res.reason = 'handedness';
    else res.reason = 'match';
    res.accepted = res.reason === 'match';
    if (!res.accepted) res.confidence = Math.min(res.confidence, 0.49);
    return res;
  }
}
