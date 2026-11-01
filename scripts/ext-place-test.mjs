// Verify the built extension: button injected RIGHT AFTER the add-to-cart button, clickable, tab at ~20%.
//   pnpm --filter @aida/extension build && node scripts/ext-place-test.mjs
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../shots/', import.meta.url));
const PAGE = new URL('../apps/extension/test-page/index.html', import.meta.url).href;
const CONTENT = fileURLToPath(new URL('../apps/extension/dist/content.js', import.meta.url));
await mkdir(OUT, { recursive: true });

const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
p.on('console', (m) => m.type() === 'error' && console.log('console.error:', m.text()));
p.on('pageerror', (e) => console.log('pageerror:', e.message));

await p.goto(PAGE, { waitUntil: 'load' });
await p.addScriptTag({ path: CONTENT });
await p.waitForSelector('[data-cabin="tryon-button"]', { timeout: 8000 });
await p.waitForTimeout(500);

const placement = await p.evaluate(() => {
  const add = document.getElementById('add');
  const next = add?.nextElementSibling;
  return {
    addText: add?.textContent?.trim(),
    nextIsCabinButton: next?.getAttribute('data-cabin') === 'tryon-button',
    sameContainer: next?.parentElement === add?.parentElement,
  };
});
console.log('placement:', JSON.stringify(placement));

const tabTop = await p.evaluate(() => {
  const t = document.getElementById('cabin-root')?.shadowRoot?.querySelector('.cabin-tab');
  return t ? Math.round(t.getBoundingClientRect().top) : null;
});
console.log('tab top px (viewport h=800, expect ~160):', tabTop);

await p.screenshot({ path: OUT + 'ext-placement.jpg', type: 'jpeg', quality: 82 });
console.log('shot ext-placement');
await b.close();
console.log('DONE');
