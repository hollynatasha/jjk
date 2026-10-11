// Domain id -> animation module. Four entries, one per taught sign.
import unlimitedVoid from './unlimited-void.js';
import malevolentShrine from './malevolent-shrine.js';
import chimeraShadowGarden from './chimera-shadow-garden.js';
import deadlySentencing from './deadly-sentencing.js';

export const DOMAIN_MODULES = {
  gojo: unlimitedVoid,
  sukuna: malevolentShrine,
  megumi: chimeraShadowGarden,
  higuruma: deadlySentencing,
};

export function moduleFor(domainId) {
  const m = DOMAIN_MODULES[domainId];
  if (!m) throw new Error(`No animation for domain "${domainId}"`);
  return m;
}
