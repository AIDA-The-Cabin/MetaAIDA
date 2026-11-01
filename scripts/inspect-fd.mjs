// Inspect a real Fashion Days product page to find the true Add-to-cart button.
import { chromium } from 'playwright';
const URL = 'https://www.fashiondays.ro/p/rochie-midi-neagra-textil-negru-femei-busem-p23171973-1/';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const b = await chromium.launch();
const p = await (await b.newContext({ userAgent: UA, viewport: { width: 1366, height: 950 }, locale: 'ro-RO' })).newPage();
try {
  await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await p.waitForTimeout(4500);
  console.log('TITLE:', await p.title());
  const cands = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('button, a, [role="button"], input[type="submit"]').forEach((el) => {
      const t = (el.textContent || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 45);
      if (/co[sș]|cart|adaug|bag|cump/i.test(t)) {
        const r = el.getBoundingClientRect();
        out.push({
          tag: el.tagName,
          cls: (el.className || '').toString().slice(0, 90),
          attrs: [...el.attributes].filter((a) => /^data-|^id$|^aria/.test(a.name)).map((a) => `${a.name}=${a.value}`.slice(0, 40)).join(' '),
          text: t,
          box: `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`,
          parentCls: (el.parentElement?.className || '').toString().slice(0, 70),
        });
      }
    });
    return out;
  });
  console.log('CANDIDATES:', JSON.stringify(cands, null, 2));
} catch (e) {
  console.log('ERR:', e.message);
}
await b.close();
console.log('DONE');
