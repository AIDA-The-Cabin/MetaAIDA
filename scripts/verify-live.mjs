// Live check: upload a body photo through the real Profile page (converted to WebP in the browser),
// then run ONE try-on through the API (1 credit, one Muse Image generation).
//   node scripts/verify-live.mjs <bodyPhoto> [baseUrl]
import { chromium } from 'playwright';

const PHOTO = process.argv[2];
if (!PHOTO) throw new Error('usage: node scripts/verify-live.mjs <bodyPhoto> [baseUrl]');
const BASE = process.argv[3] || 'https://metaaida.pages.dev';
const GARMENT = 'https://fdcdn.akamaized.net/m/390x585/products/114045/114044388/images/res_fefab61320f6cbd35b26b7642c8fa710.jpg?s=fBiHc48XHi-M';
const PAGE = 'https://www.fashiondays.ro/p/rochie-midi-neagra-textil-negru-femei-busem-p23171973-1/';

const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
p.on('pageerror', (e) => console.log('pageerror:', e.message));

await p.goto(BASE + '/profile', { waitUntil: 'networkidle' });
await p.check('#consent');
await p.setInputFiles('#file', PHOTO); // the page converts it to WebP client-side
await p.waitForFunction(() => document.getElementById('photo-status')?.style.display === 'block', null, { timeout: 30000 });
console.log('✓ body photo uploaded as WebP');

const t0 = Date.now();
const tryon = await p.evaluate(async ([g, pg]) => {
  const r = await fetch('/v1/tryon', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ garmentImageUrl: g, pageUrl: pg }) });
  return await r.json();
}, [GARMENT, PAGE]);
console.log(`tryon (${((Date.now() - t0) / 1000).toFixed(1)}s):`, JSON.stringify(tryon));

if (tryon.resultUrl) {
  const info = await p.evaluate(async (u) => {
    const r = await fetch(u);
    const blob = await r.blob();
    return { contentType: r.headers.get('content-type'), bytes: blob.size };
  }, tryon.resultUrl);
  console.log('result image in R2:', JSON.stringify(info));
}
await b.close();
console.log('DONE');
