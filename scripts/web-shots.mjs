// Screenshot the web app: landing (desktop+mobile), profile, dashboard.
//   node scripts/web-shots.mjs [baseUrl]   (default http://localhost:4321 — run `pnpm web:dev` first)
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const BASE = process.argv[2] || 'http://localhost:4321';
const OUT = fileURLToPath(new URL('../shots/', import.meta.url));
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const shoot = async (page, name, full = false) => {
  await page.screenshot({ path: `${OUT}${name}.jpg`, type: 'jpeg', quality: 82, fullPage: full });
  console.log('shot', name);
};

// landing desktop (full page) + mobile
let ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
let page = await ctx.newPage();
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
await shoot(page, 'web-landing-desktop', true);
await ctx.close();

ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
page = await ctx.newPage();
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
await shoot(page, 'web-landing-mobile');
await ctx.close();

// profile (desktop)
ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
page = await ctx.newPage();
await page.goto(`${BASE}/profile`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await shoot(page, 'web-profile-desktop', true);
await ctx.close();

// dashboard
ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
page = await ctx.newPage();
await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await shoot(page, 'web-dashboard-desktop');
await ctx.close();

await browser.close();
console.log('DONE');
