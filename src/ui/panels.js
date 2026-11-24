// Right-hand panel, one view per mode, plus the DOM overlays on the stage.
// A mode change rebuilds the panel. Anything that moves per frame is patched
// by id instead, see updateReadouts at the bottom.

import { h, button, meter, setMeter, setText } from './dom.js';
import { poseSVG } from './posecard.js';
import { DOMAINS, DOMAIN_IDS, domainById } from '../domains/catalog.js';
import { tipFor } from '../core/feedback.js';
import { SLOT_VIEWS, NEG_PROMPTS } from '../core/prompts.js';
import { recordingSupported, pickMimeType, extensionFor } from '../media/recorder.js';

const name = (id) => (id === 'neutral' ? 'a neutral pose' : id ? domainById(id).character : 'nothing');
const fmtPct = (x) => `${Math.round(x * 100)}%`;

export function renderPanel(app) {
  const p = app.dom.panel;
  const view = VIEWS[app.mode] || VIEWS.landing;
  p.replaceChildren(h('div', { class: 'panel-inner' }, view(app)));
  updateReadouts(app, performance.now());
}


const VIEWS = {
  landing(app) {
    const onFile = app.captures.length;
    return [
      h('h1', null, 'Domain Expansion'),
      h('p', { class: 'lede' }, 'Teach your webcam three hand signs. Hold one, and that domain opens around you.'),
      h(
        'div',
        { class: 'row' },
        button('Start camera', () => app.startCamera(), { kind: 'primary', id: 'start-camera' }),
        button('Preview effects', () => app.openSimulation(), { id: 'open-sim' }),
      ),
      onFile ? h('p', { class: 'fine' }, `${onFile} captures on file from an earlier visit.`) : null,
      h('p', { class: 'fine' }, 'By @hollynst. Nothing leaves this browser.'),
    ];
  },

  loading(app) {
    const m = app.models;
    const cam = app.cam.status;
    const mark = (s) => (s === 'ready' || s === 'on' ? '✓' : s === 'error' || s === 'failed' || s === 'slow' ? '✗' : '…');
    const cls = (s) => (s === 'ready' || s === 'on' ? 'done' : s === 'error' || s === 'failed' ? 'fail' : 'wait');
    return [
      h('h2', null, 'Opening the department'),
      h('p', null, 'If the browser asks for the camera, choose Allow. No microphone is requested.'),
      h(
        'ul',
        { class: 'checklist' },
        h('li', { class: cls(cam) }, h('span', { class: 'mark', 'aria-hidden': 'true' }, mark(cam)), h('div', null, `Camera: ${cam === 'on' ? 'on' : 'waiting for permission'}`, h('small', null, '640×480 requested, cropped to 9:16 on the stage'))),
        h('li', { class: cls(m.runtime) }, h('span', { class: 'mark', 'aria-hidden': 'true' }, mark(m.runtime)), h('div', null, 'Hand tracker runtime', h('small', null, 'MediaPipe WebAssembly, served from this app'))),
        h('li', { class: cls(m.hand) }, h('span', { class: 'mark', 'aria-hidden': 'true' }, mark(m.hand)), h('div', null, 'Hand landmark model', h('small', { id: 'hand-src' }, m.handSrc || 'local copy first, official URL as fallback'))),
        h('li', { class: cls(m.seg) }, h('span', { class: 'mark', 'aria-hidden': 'true' }, mark(m.seg)), h('div', null, 'Person segmenter (optional)', h('small', null, m.seg === 'failed' ? `unavailable: overlay mode` : 'loads after tracking starts'))),
      ),
      meter('load-hand', 'Hand model download', m.handProgress),
    ];
  },

  error(app) {
    const e = app.cam.error || { title: 'Something went wrong', detail: '', fixes: [] };
    return [
      h('h2', null, e.title),
      h('p', { class: 'warnbox', role: 'alert' }, e.detail),
      h('ol', { class: 'fixes' }, (e.fixes || []).map((f) => h('li', null, f))),
      h('div', { class: 'row' }, button('Try again', () => app.startCamera(), { kind: 'primary', id: 'retry-camera' }), button('Preview effects (simulation)', () => app.openSimulation())),
      h('p', { class: 'fine' }, `Error code: ${e.code || 'unknown'}`),
    ];
  },

  library(app) {
    const trained = app.trainedDomains();
    const ready = DOMAIN_IDS.filter((d) => app.meta.domains[d] && app.meta.domains[d].verified && app.meta.domains[d].verified.ready);
    const next = DOMAIN_IDS.find((d) => !app.positives(d).length) || DOMAIN_IDS.find((d) => !trained.includes(d));
    const negs = app.negatives().length;
    return [
      h('h2', null, 'The desk is open'),
      h(
        'dl',
        { class: 'readout' },
        h('dt', null, 'Signs learned'),
        h('dd', null, `${trained.length}/${DOMAIN_IDS.length}`),
        h('dt', null, 'Ready (tested)'),
        h('dd', null, `${ready.length}/${DOMAIN_IDS.length}`),
        h('dt', null, 'Neutral poses'),
        h('dd', null, `${Math.min(negs, 8)}/8`),
        h('dt', null, 'Person segmenter'),
        h('dd', { id: 'lib-seg' }, segLabel(app)),
      ),
      h('p', null, trained.length ? 'Teach the rest whenever you like. Untrained signs never fire.' : 'Start with any card. One sign is enough to go live.'),
      h(
        'div',
        { class: 'row' },
        next ? button(`Teach ${domainById(next).character}`, () => app.openTeach(next), { kind: trained.length ? 'secondary' : 'primary', id: 'teach-next' }) : null,
        button('Test my signs', () => app.startChallenge(), { kind: trained.length && !ready.length ? 'primary' : 'secondary', disabled: !trained.length, id: 'start-test' }),
        button('Go live', () => app.goLive(), { kind: ready.length ? 'primary' : 'secondary', disabled: !trained.length, id: 'go-live' }),
      ),
      negs < 8 ? h('p', { class: 'fine' }, 'Your first Teach starts with eight neutral poses (open palm, fist, relaxed hands…), so the matcher learns what is not a sign.') : button('Retake neutral poses', () => app.openNegatives(), { small: true }),
      h('section', null, h('h3', null, 'Matcher check'), h('p', { id: 'lib-seen', class: 'tip' }, '')),
      h('div', { class: 'row' }, button('Switch camera', () => app.switchCamera(), { small: true }), button('Stop camera', () => app.stopCamera(), { small: true })),
    ];
  },

  teach(app) {
    const T = app.teach;
    if (!T) return [h('h2', null, 'Teach'), button('Back to library', () => app.goLibrary())];
    const d = domainById(T.domain);
    const filled = T.slots.filter(Boolean).length;
    const variantBtn = (v, label) =>
      h('button', { type: 'button', 'aria-pressed': String(T.variant === v), onClick: () => T.variant !== v && app.setVariant(T.domain, v, v === 'custom' ? T.hands : null) }, label);
    const out = [
      h('h2', null, `Teach: ${d.character}`),
      h('p', null, `${d.domainName} · ${T.hands === 1 ? 'one hand' : 'two hands'} · ${T.variant === 'custom' ? `custom trigger for ${d.character}` : T.variant === 'canonical' ? 'researched pose' : d.researchStatus === 'fan-made' ? 'fan-made trigger' : 'camera-friendly variant'}`),
      h('div', { class: 'segmented', role: 'group', 'aria-label': 'Which pose to teach' }, variantBtn('friendly', 'Camera-friendly'), d.researchStatus === 'fan-made' ? null : variantBtn('canonical', 'Researched'), variantBtn('custom', 'Custom trigger')),
    ];
    if (T.variant === 'custom') {
      out.push(
        h(
          'div',
          { class: 'row' },
          h('span', { class: 'fine' }, 'Custom pose uses:'),
          button('One hand', () => app.setVariant(T.domain, 'custom', 1), { small: true, pressed: T.hands === 1 }),
          button('Two hands', () => app.setVariant(T.domain, 'custom', 2), { small: true, pressed: T.hands === 2 }),
        ),
        h('p', { class: 'fine' }, `Any consistent pose works. If it looks like another sign, validation will say so.`),
      );
    }
    if (T.mismatch && filled) {
      out.push(h('p', { class: 'warnbox' }, 'Saved captures use a different pose or hand count. Retake all to switch.'), button('Retake all 12', () => app.retakeAll(T.domain), { kind: 'danger' }));
    }
    if (T.phase === 'capturing') {
      out.push(
        h(
          'div',
          { class: 'prompt-card' },
          h('div', { class: 'phase' }, `CAPTURE ${filled + 1} OF 12`),
          h('div', { class: 'target' }, SLOT_VIEWS[T.slot].label),
          h('p', null, `Make the ${d.character} sign and hold still. Captures take themselves after ~0.4 s of steady, high-confidence ${T.hands === 2 ? 'hands' : 'hand'}.`),
          meter('teach-hold', 'Steady', 0),
          h('p', { class: 'tip', id: 'teach-tip', role: 'status' }, ''),
        ),
      );
    } else {
      const r = T.report;
      if (r) {
        const good = r.status === 'learned';
        out.push(h('div', { class: good ? 'okbox' : 'warnbox', role: 'status' }, h('strong', null, good ? 'Learned. ' : `${statusWord(r.status)}. `), good ? `Threshold ${r.threshold.toFixed(3)}; leave-one-capture-out found no repeated confusion.` : r.message));
        const conf = Object.entries(r.confusions || {});
        if (conf.length) {
          out.push(
            h(
              'div',
              { class: 'confusion' },
              h('h3', null, 'Confusion preview (leave one capture out)'),
              conf.map(([k, n]) => h('div', { class: 'bar' }, h('span', null, name(k)), h('span', null, h('i', { style: { width: `${(n / r.captures) * 100}%` } })), h('span', null, `${n}/${r.captures}`))),
            ),
          );
        }
      }
      out.push(
        h(
          'div',
          { class: 'row' },
          r && r.flagged && r.flagged.length ? button(`Retake flagged (${r.flagged.length})`, () => app.retakeFlagged(), { kind: 'primary' }) : null,
          r && r.status === 'learned' ? button('Test my signs', () => app.startChallenge(), { kind: 'primary' }) : null,
          r && r.status === 'learned' ? button('Go live', () => app.goLive()) : null,
          button('Retake all', () => app.retakeAll(T.domain)),
          button(`Delete ${d.character}`, () => app.deleteSign(T.domain), { kind: 'danger' }),
        ),
      );
      const nextD = DOMAIN_IDS.find((x) => x !== T.domain && !app.positives(x).length);
      if (nextD) out.push(button(`Teach ${domainById(nextD).character} next`, () => app.openTeach(nextD)));
    }
    out.push(
      h('h3', null, 'Captures (click one to retake it)'),
      h(
        'div',
        { class: 'slots', role: 'group', 'aria-label': 'Twelve capture slots' },
        T.slots.map((c, i) => {
          const flagged = c && T.report && (T.report.flagged || []).includes(c.id);
          return h(
            'button',
            {
              type: 'button',
              class: `slot${c ? ' filled' : ''}${flagged ? ' flagged' : ''}${T.phase === 'capturing' && i === T.slot ? ' current' : ''}`,
              'aria-label': `Capture ${i + 1}, ${SLOT_VIEWS[i].label}: ${c ? (flagged ? 'flagged, retake' : 'taken, retake') : 'empty'}`,
              onClick: () => app.retakeSlot(i),
            },
            SLOT_VIEWS[i].short,
            h('small', null, c ? (flagged ? 'flag' : 'ok') : '—'),
          );
        }),
      ),
      h('div', { class: 'row' }, button('Back to library', () => app.goLibrary())),
    );
    return out;
  },

  negatives(app) {
    const T = app.teach;
    const have = new Set(app.negatives().map((c) => c.prompt));
    const p = NEG_PROMPTS[Math.min(T.index, NEG_PROMPTS.length - 1)];
    return [
      h('h2', null, 'Neutral poses'),
      h('p', null, 'Show the department what is not a sign. Eight quick poses, about forty seconds. Hold each until it captures.'),
      h('div', { class: 'prompt-card' }, h('div', { class: 'phase' }, `POSE ${Math.min(have.size + 1, 8)} OF 8`), h('div', { class: 'target' }, p.text), meter('teach-hold', 'Steady', 0), h('p', { class: 'tip', id: 'teach-tip', role: 'status' }, '')),
      h('ul', { class: 'checklist' }, NEG_PROMPTS.map((q) => h('li', { class: have.has(q.id) ? 'done' : 'wait' }, h('span', { class: 'mark', 'aria-hidden': 'true' }, have.has(q.id) ? '✓' : '·'), h('div', null, q.text, h('small', null, `${q.hands === 1 ? 'one hand' : 'two hands'}${have.has(q.id) ? ' · captured' : ''}`))))),
      h('div', { class: 'row' }, button('Back to library', () => app.goLibrary())),
    ];
  },

  test(app) {
    const res = app.challengeResults;
    if (res) {
      const rows = Object.entries(res.perSign).map(([d, s]) =>
        h(
          'tr',
          null,
          h('td', null, name(d)),
          h('td', null, `${s.success}/${s.attempts}`),
          h('td', null, String(s.misses)),
          h('td', null, Object.entries(s.confusions).map(([k, n]) => `${name(k)} ×${n}`).join(', ') || '—'),
          h('td', null, String(s.falsePositives)),
          h('td', null, res.ready[d] ? 'Ready' : 'Not yet'),
        ),
      );
      return [
        h('h2', null, 'Test results'),
        h('p', null, 'A sign is ready after at least 4/5 recognitions, no confusions either way, and at most one false positive.'),
        h('table', { class: 'results' }, h('thead', null, h('tr', null, ['Sign', 'OK', 'Missed', 'Seen as', 'False +', 'Badge'].map((x) => h('th', { scope: 'col' }, x)))), h('tbody', null, rows)),
        res.falsePositives.length ? h('p', { class: 'warnbox' }, `False positives during rest: ${res.falsePositives.map((f) => name(f.domain)).join(', ')}.`) : h('p', { class: 'fine' }, 'No false positives during rest phases.'),
        res.weak.length ? h('div', { class: 'row' }, res.weak.map((d) => button(`Retrain ${name(d)}`, () => app.retakeAll(d).then(() => app.openTeach(d)), { kind: 'primary' }))) : null,
        h('div', { class: 'row' }, button('Go live', () => app.goLive(), { kind: res.weak.length ? 'secondary' : 'primary' }), button('Run the test again', () => app.startChallenge()), button('Back to library', () => app.goLibrary())),
      ];
    }
    const s = app.challengeSnap || {};
    return [
      h('h2', null, 'Test my signs'),
      h('p', null, `Five attempts per trained sign, random order. Rest between prompts: anything cast during rest counts as a false positive.`),
      h('div', { class: 'prompt-card' }, h('div', { class: 'phase', id: 'test-phase' }, ''), h('div', { class: 'target', id: 'test-target' }, ''), meter('test-time', 'Time left', 1, { tone: 'ivory' }), meter('test-hold', 'Hold', 0), h('p', { class: 'tip', id: 'test-seen', role: 'status' }, '')),
      h('p', { class: 'fine', id: 'test-tally' }, ''),
      h('div', { class: 'row' }, button('Stop test', () => app.goLibrary())),
      s.done ? null : null,
    ];
  },

  live(app) {
    const trained = app.trainedDomains();
    const canRec = recordingSupported(app.dom.canvas);
    return [
      h('h2', null, 'Live'),
      h('p', null, `Hold a taught sign for 0.7 s. Armed: ${trained.map(name).join(', ') || 'none'}. Untrained signs never fire.`),
      h('div', { class: 'big-match', id: 'live-match', 'aria-live': 'off' }, '—'),
      meter('live-conf', 'Confidence', 0),
      meter('live-hold', 'Hold', 0, { tone: 'amber' }),
      h('dl', { class: 'readout' }, h('dt', null, 'Gate'), h('dd', { id: 'live-gate' }, 'armed'), h('dt', null, 'Hands'), h('dd', { id: 'live-hands' }, '0'), h('dt', null, 'Segmenter'), h('dd', { id: 'live-seg' }, segLabel(app))),
      h('p', { class: 'tip', id: 'live-tip', role: 'status' }, ''),
      h(
        'div',
        { class: 'row' },
        button('Record clip', () => app.startRecording(), { kind: 'primary', id: 'btn-record', disabled: !canRec || app.rec.phase !== 'idle', keyHint: 'R' }),
        button('Save image', () => app.saveImage(), { id: 'btn-png' }),
      ),
      canRec ? h('p', { class: 'fine' }, `Clips record as .${extensionFor(pickMimeType())} (${pickMimeType() || 'browser default'}): a 3-second countdown, then one cast plus a second of aftermath.`) : h('p', { class: 'warnbox' }, 'This browser cannot record the canvas. Save image gives a full-resolution PNG instead.'),
      h('div', { class: 'row' }, button('Guide cards', () => document.getElementById('library').scrollIntoView({ behavior: app.reduced ? 'auto' : 'smooth' }), { small: true }), button('Switch camera', () => app.switchCamera(), { small: true }), button('Delete training…', () => app.openDataDialog(), { small: true, kind: 'danger' }), button('Back to library', () => app.goLibrary(), { small: true })),
    ];
  },

  cast(app) {
    const r = app.run && app.run.record;
    const d = r ? domainById(r.domainId) : null;
    return [
      h('h2', null, d ? d.title.charAt(0) + d.title.slice(1).toLowerCase() : 'Casting'),
      h('p', { class: 'lede' }, r && r.simulated ? 'Simulation playing. No hand was recognised.' : r && r.replayOf ? 'Replaying the captured cast.' : 'Domain open. Controls unlock when the reveal finishes.'),
      meter('cast-progress', 'Reveal', 0, { tone: 'ivory' }),
      h('div', { class: 'row' }, button('Replay', () => {}, { disabled: true }), button('Save image', () => {}, { disabled: true }), button('Try another sign', () => {}, { disabled: true })),
    ];
  },

  result(app) {
    const r = app.lastRecord;
    const d = r ? domainById(r.domainId) : null;
    const clip = app.clip;
    const canRec = recordingSupported(app.dom.canvas);
    return [
      h('h2', null, d ? `${d.domainName} granted` : 'Cast complete'),
      r ? h('p', null, `Seed ${r.seed} · ${r.low ? 'low' : 'high'} effects · ${r.reduced ? 'reduced' : 'full'} motion. Replay re-runs this cast's seed and hand path; it does not ask for a new sign.`) : null,
      h(
        'div',
        { class: 'row' },
        button('Replay', () => app.replay(), { kind: 'primary', id: 'btn-replay', disabled: !r }),
        button('Save image (PNG)', () => app.saveImage(), { id: 'btn-png' }),
        clip ? button(`Save clip (.${clip.ext})`, () => app.saveClip(), { id: 'btn-clip' }) : canRec ? button('Record replay', () => app.startRecording({ replay: true }), { id: 'btn-record-replay', disabled: !r }) : null,
        button('Try another sign', () => app.goLive(), { id: 'btn-again' }),
      ),
      clip ? h('p', { class: 'fine' }, `Clip: ${(clip.durationMs / 1000).toFixed(1)} s, ${clip.mime}, ${clip.hasAudio ? 'with the synthesized sound' : 'silent (no audio track)'}.`) : canRec ? null : h('p', { class: 'warnbox' }, 'Video recording is unavailable in this browser; Save image exports the full-resolution peak frame.'),
      h('p', { class: 'fine' }, 'The camera is still live: you can cast another sign straight from here.'),
      h('div', { class: 'big-match', id: 'live-match' }, ''),
      meter('live-conf', 'Confidence', 0),
      meter('live-hold', 'Hold', 0, { tone: 'amber' }),
      h('p', { class: 'tip', id: 'live-tip', role: 'status' }, ''),
    ];
  },

  sim(app) {
    const canRec = recordingSupported(app.dom.canvas);
    return [
      h('h2', null, 'Simulation'),
      h('p', { class: 'warnbox' }, h('strong', null, 'SIMULATION. '), 'No camera and no hand recognition: these buttons play the effects on a stand-in. Training and recognition stay unverified until you use a real camera.'),
      h(
        'div',
        { class: 'stack' },
        DOMAINS.map((d, i) => button(`Preview ${d.domainName}`, () => app.previewSim(d.id), { id: `sim-${d.id}`, disabled: !!app.run || app.rec.phase !== 'idle', keyHint: String(i + 1) })),
      ),
      h(
        'div',
        { class: 'row' },
        button(`Record ${domainById(app.simDomain).domainName}`, () => app.startRecording(), { disabled: !canRec || app.rec.phase !== 'idle' || !!app.run, id: 'btn-record' }),
        button('Save image', () => app.saveImage(), { id: 'btn-png' }),
        app.clip ? button(`Save clip (.${app.clip.ext})`, () => app.saveClip(), { id: 'btn-clip' }) : null,
      ),
      h('div', { class: 'row' }, button('Start camera', () => app.startCamera(), { kind: 'primary' }), button('Back', () => app.setMode('landing'))),
    ];
  },
};

function statusWord(s) {
  return { confusable: 'Too similar', hidden: 'Hands hidden', inconsistent: 'Needs retakes', incomplete: 'Incomplete' }[s] || s;
}

function segLabel(app) {
  const m = app.models.seg;
  if (m === 'ready' && app.segEnabled) return 'on: you stay in front of the domain';
  if (m === 'loading') return 'loading…';
  if (m === 'slow') return 'off (too slow): overlay mode';
  if (m === 'failed') return 'unavailable: overlay mode';
  return 'off';
}

// Stage overlays. DOM, not canvas, so none of this lands in an export.
export function renderStageUi(app) {
  const ui = app.dom.stageUi;
  const kids = [];
  const sim = app.mode === 'sim' || (app.run && app.run.record.simulated);
  if (sim) kids.push(h('div', { class: 'sim-banner', role: 'status' }, 'SIMULATION · NO HAND RECOGNITION'));
  if ((app.mode === 'teach' || app.mode === 'negatives') && app.teach) {
    if (app.mode === 'teach') {
      const T = app.teach;
      kids.push(h('div', { class: 'ghost', 'aria-hidden': 'true' }, h('div', { svg: poseSVG(T.domain, { variant: T.variant === 'canonical' ? 'canonical' : 'friendly', flipped: T.flipped, size: 260, ghost: true }) }), h('p', null, T.variant === 'custom' ? 'guide (your custom pose)' : 'guide · not exported')));
    }
    kids.push(h('div', { class: 'capture-ring', id: 'capture-ring', 'aria-hidden': 'true' }, h('span', { id: 'capture-ring-label' }, '0.4 s')));
  }
  if (app.rec.phase === 'countdown') kids.push(h('div', { class: 'stage-countdown', 'aria-live': 'assertive' }, h('div', null, h('span', { id: 'countdown-n' }, '3'), h('small', null, app.rec.replay ? 'replay recording' : app.rec.mode === 'sim' ? 'simulation recording' : 'get your sign ready'))));
  if (app.rec.phase === 'recording') kids.push(h('div', { class: 'rec-dot', id: 'rec-dot' }, '● REC'));
  if (app.rec.phase === 'saving') kids.push(h('div', { class: 'rec-dot' }, 'saving…'));
  const n = app.notices[app.notices.length - 1];
  if (n) kids.push(h('div', { class: 'stage-notice', role: 'status' }, n.text));
  ui.replaceChildren(...kids);
}

export function updateReadouts(app, now) {
  // stage caption
  const hands = app.hand.feat ? app.hand.feat.count : 0;
  const st = app.tracker.stats;
  let status;
  if (app.mode === 'sim' || (app.run && app.run.record.simulated)) status = 'Simulation: stand-in performer, no recognition. Exports carry a SIMULATION stamp.';
  else if (!app.cameraOn) status = 'Stage 9:16. This frame is exactly what Save image and Record export.';
  else status = `Tracking ${hands} hand${hands === 1 ? '' : 's'} · ${Math.round(st.handMs || 0)} ms/frame · ${app.tracker.delegate || ''} · segmentation ${app.segEnabled ? 'on' : 'off (overlay mode)'}`;
  setText('stage-status', status);

  if (app.mode === 'loading') {
    setMeter('load-hand', app.models.handProgress);
    if (app.models.handSrc) setText('hand-src', app.models.handSrc);
  }

  // countdown + rec timer
  if (app.rec.phase === 'countdown') setText('countdown-n', String(Math.max(1, Math.ceil((app.rec.end - now) / 1000))));
  if (app.rec.phase === 'recording') setText('rec-dot', `● REC ${((now - app.rec.startedAt) / 1000).toFixed(1)} s`);

  // a notice that expired or got replaced needs the overlay rebuilt
  const ui = app.dom.stageUi;
  const shown = ui.querySelector('.stage-notice');
  const latest = app.notices[app.notices.length - 1];
  if ((shown && !latest) || (latest && (!shown || shown.textContent !== latest.text))) renderStageUi(app);

  // capture flash
  if (app.flashAt && now - app.flashAt < 60 && !ui.querySelector('.flash')) {
    const f = document.createElement('div');
    f.className = 'flash';
    ui.append(f);
    setTimeout(() => f.remove(), 520);
  }

  if (app.mode === 'teach' || app.mode === 'negatives') {
    const T = app.teach;
    if (!T) return;
    const s = T.status || {};
    const prog = s.status === 'steadying' ? s.progress : s.status === 'captured' ? 1 : 0;
    setMeter('teach-hold', prog);
    const ring = document.getElementById('capture-ring');
    if (ring) ring.style.setProperty('--p', String(prog));
    setText('capture-ring-label', s.status === 'need-release' ? 'drop' : prog > 0 ? `${Math.round(prog * 100)}%` : 'hold');
    const expected = app.mode === 'teach' ? T.hands : NEG_PROMPTS[Math.min(T.index, NEG_PROMPTS.length - 1)].hands;
    const tip = s.status === 'steadying' || s.status === 'need-release' ? s.tip : tipFor({ feat: app.hand.feat, expected, brightness: app.brightness }) || s.tip || '';
    setText('teach-tip', tip || '');
    return;
  }

  if (app.mode === 'test' && app.challengeSnap && !app.challengeResults) {
    const s = app.challengeSnap;
    const dur = s.phase === 'rest' ? 1800 : s.phase === 'trial' ? 7000 : 1100;
    setText('test-phase', s.phase === 'rest' ? `REST · NEXT ${s.index + 1}/${s.total}` : s.phase === 'trial' ? `TRIAL ${s.index + 1}/${s.total}` : `RESULT ${s.index + 1}/${s.total}`);
    setText('test-target', s.phase === 'rest' ? 'Relax your hands' : s.phase === 'trial' ? `Show: ${name(s.target)}` : feedbackText(s, app));
    setMeter('test-time', s.remainingMs / dur, `${(s.remainingMs / 1000).toFixed(1)} s`);
    setMeter('test-hold', s.holdProgress || 0);
    const cls = app.hand.cls;
    setText('test-seen', cls && cls.best ? `Seeing ${name(cls.best)} · ${fmtPct(cls.confidence)}${cls.accepted ? '' : ` (${cls.reason})`}` : tipFor({ feat: app.hand.feat, cls, brightness: app.brightness }) || 'Seeing no sign');
    const recs = app.challenge ? app.challenge.records : [];
    setText('test-tally', `${recs.filter((r) => r.type === 'success').length} recognised · ${recs.filter((r) => r.type === 'confusion').length} confused · ${recs.filter((r) => r.type === 'miss').length} missed · ${app.challenge ? app.challenge.falsePositives.length : 0} false positives`);
    return;
  }

  if (app.mode === 'cast' && app.run) {
    setMeter('cast-progress', app.run.t(now) / app.run.total);
    return;
  }

  if (app.mode === 'live' || app.mode === 'result') {
    const cls = app.hand.cls;
    const g = app.hand.gate;
    setText('live-match', cls && cls.best && cls.confidence > 0.05 ? `${name(cls.best)}${cls.accepted ? '' : '?'}` : 'No sign');
    setMeter('live-conf', cls ? cls.confidence : 0);
    setMeter('live-hold', g && g.state === 'holding' ? g.progress : 0);
    const gateText = !g ? 'armed' : g.state === 'holding' ? `holding ${name(g.domain)} ${fmtPct(g.progress)}` : g.state === 'cooldown' ? 'cooling down' : g.state === 'release' ? 'release the sign to re-arm' : g.state === 'locked' ? 'locked (countdown)' : g.state;
    setText('live-gate', gateText);
    setText('live-hands', String(hands));
    const tip = cls && cls.accepted ? (g && g.state === 'release' ? 'Drop your hands to re-arm.' : 'Hold it…') : tipFor({ feat: app.hand.feat, cls, brightness: app.brightness }) || (hands ? 'Shape not matched to a taught sign.' : '');
    setText('live-tip', tip);
    return;
  }

  if (app.mode === 'library') {
    const cls = app.hand.cls;
    setText('lib-seen', cls && cls.best ? `Seeing ${name(cls.best)} · ${fmtPct(cls.confidence)} (nothing casts here; go live to cast)` : tipFor({ feat: app.hand.feat, cls, brightness: app.brightness }) || 'Show a sign to see what the matcher thinks.');
  }
}

function feedbackText(s, app) {
  const last = app.challenge && app.challenge.records[app.challenge.records.length - 1];
  if (!last) return '';
  if (last.type === 'success') return `✓ ${name(last.target)} recognised`;
  if (last.type === 'confusion') return `✗ saw ${name(last.detected)}`;
  return `✗ ${name(last.target)} not recognised`;
}
