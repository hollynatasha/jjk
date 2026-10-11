import { defineConfig } from 'vite';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const has = (p) => existsSync(fileURLToPath(new URL(p, import.meta.url)));

// Tell the app which model files are vendored in public/models, at build time,
// so it never probes for a missing file (which would log a 404).
const LOCAL_MODELS = {
  hand: has('./public/models/hand_landmarker.task'),
  seg: has('./public/models/selfie_segmenter.tflite'),
};

export default defineConfig({
  base: './',
  define: {
    __LOCAL_MODELS__: JSON.stringify(LOCAL_MODELS),
  },
  server: {
    host: 'localhost',
    port: 5173,
  },
  preview: {
    port: 4173,
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
  optimizeDeps: {
    exclude: ['@mediapipe/tasks-vision'],
  },
});
