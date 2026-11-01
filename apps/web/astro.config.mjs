import { defineConfig } from 'astro/config';

// Static site. Same-origin API in production (the combined Pages worker routes /v1/*);
// in dev, proxy /v1 to the local Worker on :8787.
export default defineConfig({
  server: { port: 4321 },
  vite: { server: { proxy: { '/v1': 'http://localhost:8787' } } },
});
