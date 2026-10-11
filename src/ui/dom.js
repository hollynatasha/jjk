// Minimal DOM helpers. No framework; panels are rebuilt on mode changes and
// live readouts are patched in place.

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'svg') el.innerHTML = v; // only ever our own generated SVG markup
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);

let liveRegion = null;
let lastAnnounce = '';
export function announce(text) {
  if (!liveRegion) liveRegion = document.getElementById('sr-live');
  if (!liveRegion || !text || text === lastAnnounce) return;
  lastAnnounce = text;
  liveRegion.textContent = '';
  setTimeout(() => {
    liveRegion.textContent = text;
  }, 30);
}

export function button(label, onClick, { kind = 'secondary', id = null, disabled = false, title = null, small = false, pressed = null, ariaLabel = null, keyHint = null } = {}) {
  return h(
    'button',
    {
      type: 'button',
      class: `btn btn-${kind}${small ? ' btn-small' : ''}`,
      id,
      disabled,
      title,
      'aria-pressed': pressed === null ? null : String(pressed),
      'aria-label': ariaLabel,
      onClick,
    },
    label,
    keyHint ? h('kbd', { class: 'kbd', 'aria-hidden': 'true' }, keyHint) : null,
  );
}

export function meter(id, label, value = 0, { tone = 'lime' } = {}) {
  return h(
    'div',
    { class: 'meter', id },
    h('div', { class: 'meter-label' }, h('span', null, label), h('span', { class: 'meter-value', id: `${id}-v` }, `${Math.round(value * 100)}%`)),
    h('div', { class: `meter-track tone-${tone}`, role: 'progressbar', 'aria-label': label, 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(value * 100)) }, h('div', { class: 'meter-fill', id: `${id}-f`, style: { width: `${value * 100}%` } })),
  );
}

export function setMeter(id, value, text = null) {
  const f = document.getElementById(`${id}-f`);
  const v = document.getElementById(`${id}-v`);
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  if (f) {
    f.style.width = `${pct}%`;
    const track = f.parentElement;
    if (track) track.setAttribute('aria-valuenow', String(pct));
  }
  if (v) v.textContent = text ?? `${pct}%`;
}

export function setText(id, text) {
  const el = document.getElementById(id);
  if (el && el.textContent !== text) el.textContent = text;
}

/** Inline icons drawn for this app (simple geometric strokes). */
export const ICON = {
  external: '<svg viewBox="0 0 16 16" aria-hidden="true" width="12" height="12" focusable="false"><path d="M6 3H3v10h10v-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M9 2h5v5M14 2 7.5 8.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  sound: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 8h3l4-3v10l-4-3H3z" fill="currentColor"/><path d="M13 7c1.2 1.6 1.2 4.4 0 6M15.5 5c2.2 2.8 2.2 7.2 0 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  muted: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 8h3l4-3v10l-4-3H3z" fill="currentColor"/><path d="M13 8l4 4M17 8l-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  spark: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2v5M10 13v5M2 10h5M13 10h5M5 5l2.5 2.5M12.5 12.5L15 15M15 5l-2.5 2.5M7.5 12.5L5 15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  motion: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 10h9M3 6h5M3 14h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="15" cy="10" r="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  folder: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2.5 5.5h5l1.5 1.5h8.5v8.5h-15z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
};
