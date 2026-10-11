// Header toggles and the training-data dialog.
import { h, button, ICON } from './dom.js';
import { DOMAINS } from '../domains/catalog.js';

let wired = false;

export function renderHeader(app) {
  const mute = document.getElementById('btn-mute');
  const fx = document.getElementById('btn-effects');
  const motion = document.getElementById('btn-motion');
  const data = document.getElementById('btn-data');
  const muted = app.settings.muted;
  mute.innerHTML = `${muted ? ICON.muted : ICON.sound}<span class="tool-label">${muted ? 'Sound off' : 'Sound on'}</span>`;
  mute.setAttribute('aria-pressed', String(muted));
  mute.setAttribute('aria-label', muted ? 'Sound is off. Turn sound on (M)' : 'Sound is on. Mute (M)');
  fx.innerHTML = `${ICON.spark}<span class="tool-label">Effects: ${app.low ? 'low' : 'high'}</span>`;
  fx.setAttribute('aria-label', `Effects ${app.low ? 'low' : 'high'}. Toggle (E)`);
  const m = app.settings.motion;
  motion.innerHTML = `${ICON.motion}<span class="tool-label">Motion: ${m === 'auto' ? `auto (${app.reduced ? 'reduced' : 'full'})` : m}</span>`;
  motion.setAttribute('aria-label', `Motion ${m}${m === 'auto' ? `, currently ${app.reduced ? 'reduced' : 'full'}` : ''}. Change`);
  data.innerHTML = `${ICON.folder}<span class="tool-label">Training data</span>`;
  data.setAttribute('aria-label', 'Training data: export, import or delete');
  if (!wired) {
    wired = true;
    mute.addEventListener('click', () => {
      app.audio.unlock();
      app.toggleMute();
    });
    fx.addEventListener('click', () => app.toggleEffects());
    motion.addEventListener('click', () => app.cycleMotion());
    data.addEventListener('click', () => app.openDataDialog());
  }
}

/** Builds the training-data dialog; rebuilt after an import or delete so counts and buttons stay true. */
export function renderDataDialog(app, message = '') {
  const dlg = app.dom.dialog;
  const counts = DOMAINS.map((d) => `${d.character} ${app.positives(d.id).length}/12`).join(' · ');
  let armed = false;
  const status = h('p', { class: 'fine', id: 'data-status', role: 'status' }, message);
  const refresh = (msg) => {
    renderDataDialog(app, msg);
    const title = dlg.querySelector('#data-title');
    if (title) {
      title.setAttribute('tabindex', '-1');
      title.focus();
    }
  };
  const del = button('Delete all training data', async () => {
    if (!armed) {
      armed = true;
      del.textContent = 'Press again to delete everything';
      status.textContent = 'This removes every capture and test result. It cannot be undone.';
      return;
    }
    await app.deleteAllTraining();
    refresh('Deleted. No training data is stored in this browser now.');
  }, { kind: 'danger', disabled: app.captures.length === 0 });
  const file = h('input', {
    type: 'file',
    accept: 'application/json,.json',
    class: 'sr-only',
    id: 'import-file',
    onChange: async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      try {
        const n = await app.importTraining(f);
        refresh(`Imported ${n} captures.`);
      } catch (err) {
        status.textContent = err.message;
      }
    },
  });
  dlg.replaceChildren(
    h('h2', { id: 'data-title' }, 'Training data'),
    h('p', null, `Stored in this browser (${app.store ? app.store.kind : 'memory'}): feature vectors only, never images or video.`),
    h('p', { class: 'fine' }, `${counts} · neutral poses ${app.negatives().length}/8${app.staleCaptures ? ` · ${app.staleCaptures} captures from an older version ignored` : ''}`),
    h(
      'div',
      { class: 'stack' },
      button('Export training data (.json)', () => app.exportTraining(), { kind: 'secondary' }),
      h('label', { class: 'btn btn-secondary', for: 'import-file', tabindex: '0', onKeydown: (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), file.click()) }, 'Import training data…'),
      file,
      del,
      button('Close', () => dlg.close(), { kind: 'primary' }),
    ),
    status,
  );
}
