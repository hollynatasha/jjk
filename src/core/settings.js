// Small persisted preferences.
const KEY = 'hrd-settings-v1';

export const DEFAULT_SETTINGS = {
  muted: false,
  effects: 'high',
  motion: 'auto', // 'auto' follows prefers-reduced-motion, or 'reduced' / 'full'
  cameraQuality: '480p',
  aspect: 'landscape', // stage shape: 'landscape' is 16:9, 'portrait' is 9:16
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
