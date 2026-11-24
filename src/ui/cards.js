// Gesture library: one paper pose card per domain, shown before training and
// again from Live. The badge spells its state out in words, never colour alone.

import { h, button, ICON } from './dom.js';
import { poseSVG } from './posecard.js';
import { DOMAINS } from '../domains/catalog.js';

// Frames this app rendered itself, grabbed off the real stage in simulation
// mode. The card should show what the sign opens, not another hand.
const STILL = {
  gojo: { src: '/stills/gojo-3p2.jpg', alt: 'Unlimited Void mid-cast: red and violet arcs rushing outward through a field of white motes.' },
  sukuna: { src: '/stills/sukuna-3p2.jpg', alt: 'Malevolent Shrine mid-cast: red cords strung over a dark shrine standing in still water.' },
  megumi: { src: '/stills/megumi-5p6.jpg', alt: 'Chimera Shadow Garden mid-cast: pale blue arcs thrown outward over a dark grid.' },
};

function kindLine(app, d) {
  const variant = app.settings.variant[d.id] || 'friendly';
  if (variant === 'custom') {
    const n = app.settings.customHands[d.id] || d.hands;
    return h('p', { class: 'card-kind' }, h('b', null, `Custom trigger for ${d.character}`), ` · your own ${n === 1 ? 'one' : 'two'}-hand pose`);
  }
  if (d.researchStatus === 'fan-made') return h('p', { class: 'card-kind' }, h('b', null, 'Fan-made trigger'), ' · canon hand anatomy not verified');
  if (variant === 'canonical') return h('p', { class: 'card-kind' }, h('b', null, 'Researched pose'), ' · may merge hands on camera');
  return h('p', { class: 'card-kind' }, h('b', null, 'Camera-friendly approximation'), ' · of a researched sign');
}

export function renderCards(app) {
  const root = app.dom.cards;
  root.replaceChildren();
  for (const d of DOMAINS) {
    const flipped = !!app.settings.flipped[d.id];
    const variant = app.settings.variant[d.id] || 'friendly';
    const expanded = !!app.expanded[d.id];
    const detailsId = `card-details-${d.id}`;
    const card = h(
      'article',
      { class: 'card', id: `card-${d.id}`, style: { '--accent': d.accent }, 'aria-labelledby': `card-title-${d.id}` },
      STILL[d.id]
        ? h('div', { class: 'card-still' }, h('img', { src: STILL[d.id].src, alt: STILL[d.id].alt, width: 1600, height: 900, loading: 'lazy' }))
        : null,
      h(
        'header',
        { class: 'card-head' },
        h(
          'div',
          { class: 'card-title' },
          h('h3', { id: `card-title-${d.id}` }, d.character),
          h('p', { class: 'card-sub' }, h('span', { class: 'jp', lang: 'ja' }, d.kanji), d.domainName),
        ),
        h('span', { class: 'badge tone-none', id: `badge-${d.id}` }, 'Not trained'),
      ),
      h('div', { class: 'card-drawing', svg: poseSVG(d.id, { variant: variant === 'canonical' ? 'canonical' : 'friendly', flipped, size: 300 }) }),
      kindLine(app, d),
      h(
        'div',
        { class: 'card-actions' },
        button('Teach this sign', () => app.openTeach(d.id), { kind: 'primary', small: true, id: `teach-${d.id}` }),
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn-secondary btn-small',
            'aria-expanded': String(expanded),
            'aria-controls': detailsId,
            onClick: () => {
              app.expanded[d.id] = !app.expanded[d.id];
              renderCards(app);
              updateBadges(app);
              const again = document.querySelector(`#card-${d.id} [aria-controls="${detailsId}"]`);
              if (again) again.focus();
            },
          },
          expanded ? 'Hide how to pose' : 'How to pose',
        ),
        button(flipped ? 'Unflip' : 'Flip for left hand', () => app.toggleFlip(d.id), { small: true, pressed: flipped, ariaLabel: `Mirror the ${d.character} card for your other hand` }),
        h('a', { class: 'btn btn-secondary btn-small', href: d.officialRef.url, target: '_blank', rel: 'noopener noreferrer', title: d.officialRef.label }, 'Official reference', h('span', { class: 'ext-icon', svg: ICON.external }), h('span', { class: 'sr-only' }, ' (opens in a new tab)')),
      ),
      h(
        'div',
        { class: 'card-details', id: detailsId, hidden: !expanded },
        h(
          'dl',
          null,
          h('dt', null, 'Hands'),
          h('dd', null, d.hands === 1 ? 'One' : 'Two'),
          h('dt', null, 'View'),
          h('dd', null, 'Front camera, mirrored like a selfie'),
          h('dt', null, 'Wrist gap'),
          h('dd', null, d.wristGap),
          h('dt', null, 'Keep visible'),
          h('dd', null, d.mustSee),
        ),
        h('p', null, h('strong', null, 'Copy this')),
        h('ol', null, d.steps.map((s) => h('li', null, flipped ? s.replace(/\bright\b/g, '§').replace(/\bleft\b/g, 'right').replace(/§/g, 'left') : s))),
        h('p', { class: 'research' }, d.researched),
        h('p', null, d.approximation),
        h('p', null, d.friendlyNote),
        h('p', null, 'Reference: ', h('a', { href: d.officialRef.url, target: '_blank', rel: 'noopener noreferrer' }, d.officialRef.label), d.secondaryRef ? [' · ', h('a', { href: d.secondaryRef.url, target: '_blank', rel: 'noopener noreferrer' }, d.secondaryRef.label)] : null),
      ),
    );
    root.append(card);
  }
  updateBadges(app);
}

export function updateBadges(app) {
  for (const d of DOMAINS) {
    const b = app.badge(d.id);
    const el = document.getElementById(`badge-${d.id}`);
    if (el) {
      el.textContent = b.text;
      el.className = `badge tone-${b.tone}`;
    }
    const card = document.getElementById(`card-${d.id}`);
    if (card) card.classList.toggle('active', !!(app.teach && app.teach.domain === d.id && app.mode === 'teach'));
    const teach = document.getElementById(`teach-${d.id}`);
    if (teach) {
      const trained = app.positives(d.id).length > 0;
      teach.textContent = app.teach && app.teach.domain === d.id && app.mode === 'teach' ? 'Teaching now' : trained ? 'Retake / review' : 'Teach this sign';
      teach.disabled = !!app.run || app.rec.phase !== 'idle';
    }
  }
}
