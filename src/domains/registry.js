// domain id -> animation module
import unlimitedVoid from './unlimited-void.js';
import malevolentShrine from './malevolent-shrine.js';
import chimeraShadowGarden from './chimera-shadow-garden.js';

export const DOMAIN_MODULES = {
  gojo: unlimitedVoid,
  sukuna: malevolentShrine,
  megumi: chimeraShadowGarden,
};

export function moduleFor(domainId) {
  const m = DOMAIN_MODULES[domainId];
  if (!m) throw new Error(`No animation for domain "${domainId}"`);
  return m;
}
