// Harness for Mode A (full-page showcase): overlay the "you" try-on on every category thumbnail.
// Uses the already-cached Busem product repeated, so every overlay is a free cache hit.
import { mountCabin } from './index';

const API = 'http://localhost:8787';
const GARMENT =
  'https://fdcdn.akamaized.net/m/390x585/products/114045/114044388/images/res_fefab61320f6cbd35b26b7642c8fa710.jpg?s=fBiHc48XHi-M';
const PAGE = 'https://www.fashiondays.ro/p/rochie-midi-neagra-textil-negru-femei-busem-p23171973-1/';

document.body.style.cssText = 'margin:0;font-family:system-ui,-apple-system,sans-serif;background:#f4f1ec;color:#1a1a1a';
const card = `
  <div style="background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e6e0d5">
    <img class="thumb" referrerpolicy="no-referrer" src="${GARMENT}" alt="Rochie midi neagră"
      style="width:100%;display:block;aspect-ratio:390/585;object-fit:cover;background:#e6e1d8" />
    <div style="padding:12px">
      <p style="margin:0;font-size:12px;color:#b09a76;letter-spacing:.1em">BUSEM</p>
      <p style="margin:4px 0 0;font-size:15px">Rochie midi neagră</p>
      <p style="margin:6px 0 0;font-weight:600">129,99 lei</p>
    </div>
  </div>`;
document.body.innerHTML = `
  <header style="padding:16px 28px;border-bottom:1px solid #e3ddd2;font-weight:700;letter-spacing:.2em;font-size:14px">
    FASHION&nbsp;DAYS <span style="color:#aaa;font-weight:400;letter-spacing:0">· Rochii / Femei — mock category (full-page mode ON)</span>
  </header>
  <main style="max-width:1100px;margin:0 auto;padding:30px 24px">
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:22px">${card.repeat(6)}</div>
  </main>`;

const cabin = mountCabin({ apiBase: API, buttonMode: 'branded', fullPageEnabled: true });
const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('img.thumb'));
cabin.bakePage(imgs.map((el) => ({ el, product: { garmentImageUrl: GARMENT, pageUrl: PAGE, name: 'Rochie midi neagră' } })));
(window as unknown as { cabin: typeof cabin }).cabin = cabin;
