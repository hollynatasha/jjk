// Small persisted preferences (mute, effects level, motion, card flips).
const KEY = 'hrd-settings-v1';

export const DEFAULT_SETTINGS = {
  muted: false,
  effects: 'high',
  motion: 'auto', // 'auto' follows prefers-reduced-motion, or 'reduced' / 'full'
  cameraQuality: '480p',
  flipped: {},
  variant: {},
  customHands: {},
};

export function loadSettings(storage = globalThis.localStorage) {
  try {
    const raw = storage && storage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return { ...DEFAULT_SETTINGS, ...parsed, flipped: { ...(parsed.flipped || {}) }, variant: { ...(parsed.variant || {}) }, customHands: { ...(parsed.customHands || {}) } };
  } catch {
    return { ...DEFAULT_SETTINGS, flipped: {}, variant: {}, customHands: {} };
  }
}

export function saveSettings(settings, storage = globalThis.localStorage) {
  try {
    storage && storage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* storage may be unavailable; settings stay in memory */
  }
}
