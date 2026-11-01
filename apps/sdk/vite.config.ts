import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { resolve } from 'node:path';

// Builds the embeddable loader as a single classic IIFE (cabin.js) and copies the
// retailer demo page (public/index.html) next to it in dist/.
export default defineConfig({
  plugins: [preact()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, 'src/loader.ts'),
      name: 'Cabin',
      formats: ['iife'],
      fileName: () => 'cabin.js',
    },
  },
});
