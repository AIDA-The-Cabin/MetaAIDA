import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { resolve } from 'node:path';

// Builds the content script as a single self-contained IIFE bundle (content.js),
// and Vite copies public/ (manifest.json + icons) into dist/.
export default defineConfig({
  plugins: [preact()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, 'src/content.ts'),
      name: 'CabinContent',
      formats: ['iife'],
      fileName: () => 'content.js',
    },
  },
});
