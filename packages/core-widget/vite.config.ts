import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [preact()],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'CabinWidget',
      fileName: 'cabin-widget',
      formats: ['es', 'umd'],
    },
  },
});
