// Fonts are bundled from @fontsource (OFL), so nothing loads from a font CDN.
import '@fontsource/schibsted-grotesk/latin-400.css';
import '@fontsource/schibsted-grotesk/latin-600.css';
import '@fontsource/schibsted-grotesk/latin-800.css';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-700.css';
import '@fontsource/instrument-serif/latin-400.css';
import '@fontsource/instrument-serif/latin-400-italic.css';
import '@fontsource/anton/latin-400.css';
import '@fontsource/caveat/latin-500.css';
import './styles.css';
import { App } from './app.js';

async function loadFonts() {
  if (!document.fonts || !document.fonts.load) return;
  const faces = ['800 40px "Schibsted Grotesk"', '600 20px "Schibsted Grotesk"', '400 17px "Schibsted Grotesk"', '400 40px "Instrument Serif"', 'italic 400 40px "Instrument Serif"', '400 40px Anton', '700 20px "IBM Plex Mono"', '500 20px "IBM Plex Mono"', '500 20px Caveat'];
  await Promise.race([Promise.all(faces.map((f) => document.fonts.load(f).catch(() => null))), new Promise((r) => setTimeout(r, 2500))]);
}

// .reveal sections are in the DOM and visible by default; this only runs the
// entrance, so nothing stays hidden if the observer or the script fails.
function revealOnScroll() {
  const targets = document.querySelectorAll('.reveal');
  if (!targets.length) return;
  if (!('IntersectionObserver' in window)) {
    for (const el of targets) el.classList.add('seen');
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('seen');
        io.unobserve(e.target);
      }
    },
    { rootMargin: '0px 0px -12% 0px', threshold: 0.12 },
  );
  for (const el of targets) io.observe(el);
}

loadFonts().then(() => {
  const app = new App();
  app.init();
  revealOnScroll();
});
