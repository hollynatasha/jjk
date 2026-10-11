// Entry point. Fonts are bundled from @fontsource (OFL), so nothing loads
// from a font CDN and the canvas titles render in their intended faces.
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
  const faces = ['400 40px "Instrument Serif"', 'italic 400 40px "Instrument Serif"', '400 40px Anton', '700 20px "IBM Plex Mono"', '500 20px "IBM Plex Mono"', '400 16px "IBM Plex Sans"', '500 20px Caveat'];
  await Promise.race([Promise.all(faces.map((f) => document.fonts.load(f).catch(() => null))), new Promise((r) => setTimeout(r, 2500))]);
}

loadFonts().then(() => {
  const app = new App();
  app.init();
});
