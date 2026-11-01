// Dev harness: a mock Fashion Days product page that the widget injects into.
import { mountCabin } from './index';

const API = 'http://localhost:8787';
const GARMENT =
  'https://fdcdn.akamaized.net/m/390x585/products/114045/114044388/images/res_fefab61320f6cbd35b26b7642c8fa710.jpg?s=fBiHc48XHi-M';
const PAGE = 'https://www.fashiondays.ro/p/rochie-midi-neagra-textil-negru-femei-busem-p23171973-1/';
const NAME = 'Rochie midi neagră · Busem';

document.body.style.cssText = 'margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f4f1ec;color:#1a1a1a';
document.body.innerHTML = `
  <header style="padding:16px 28px;border-bottom:1px solid #e3ddd2;font-weight:700;letter-spacing:.2em;font-size:14px">
    FASHION&nbsp;DAYS <span style="color:#aaa;font-weight:400;letter-spacing:0">· mock product page</span>
  </header>
  <main style="max-width:1000px;margin:0 auto;padding:38px 24px">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:44px">
      <div><img id="pdp-img" src="${GARMENT}" referrerpolicy="no-referrer" alt="${NAME}"
        style="width:100%;border-radius:14px;background:#e6e1d8;display:block;aspect-ratio:390/585;object-fit:cover"/></div>
      <div>
        <p style="text-transform:uppercase;letter-spacing:.22em;color:#b09a76;font-size:12px;margin:0 0 8px">Busem</p>
        <h1 style="font-size:28px;margin:0 0 12px;font-weight:600">Rochie midi neagră</h1>
        <p style="font-size:22px;margin:0 0 6px">129,99 lei</p>
        <p style="font-size:13px;color:#888;margin:0 0 26px">Textil · Negru · Mărime M</p>
        <div id="actions" style="max-width:360px">
          <button id="add" style="width:100%;height:50px;border:none;border-radius:11px;background:#1a1a1a;color:#fff;font-size:15px;font-weight:600;cursor:pointer">Adaugă în coș</button>
        </div>
      </div>
    </div>
  </main>`;

const cabin = mountCabin({ apiBase: API, buttonMode: 'branded', fullPageEnabled: true });
const actions = document.getElementById('actions') as HTMLElement;
const addBtn = document.getElementById('add') as HTMLElement;
cabin.attachButton(actions, { garmentImageUrl: GARMENT, pageUrl: PAGE, name: NAME, imageEl: document.getElementById('pdp-img') as HTMLImageElement }, addBtn);

// expose for screenshot scripting
(window as unknown as { cabin: typeof cabin }).cabin = cabin;
