import { tokens } from '@aida/shared';
import { t } from './i18n';

export interface CabinButtonOpts {
  mode: 'native' | 'branded';
  label?: string;
  refButton?: HTMLElement | null;
  onClick: () => void;
}

const STYLE_ID = 'cabin-btn-style';

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent =
    '@keyframes cabin-shine{0%{background-position:0% 50%}100%{background-position:300% 50%}}' +
    '@keyframes cabin-rot{to{transform:rotate(360deg)}}' +
    '.cabin-vt-btn{box-sizing:border-box;display:flex;flex-basis:100%;width:100%;align-items:center;justify-content:center;' +
    "gap:9px;margin:10px 0 0;min-height:48px;padding:0 20px;cursor:pointer;font-family:Inter,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;" +
    'font-size:14px;font-weight:600;letter-spacing:.02em;color:#0B0C0E;border:1px solid #9C7A2E;border-radius:11px;' +
    'background:linear-gradient(110deg,#9C7A2E,#C9A24B,#E7C977,#F8ECC6,#E7C977,#C9A24B,#9C7A2E);background-size:300% 100%;' +
    'animation:cabin-shine 4.5s linear infinite;box-shadow:0 0 22px rgba(201,162,75,.28);transition:filter .2s ease}' +
    '.cabin-vt-btn:hover{filter:brightness(1.07)}' +
    '.cabin-vt-btn[disabled]{cursor:default;opacity:.95}' +
    '.cabin-vt-btn .cabin-spin{width:15px;height:15px;border-radius:50%;border:2px solid rgba(11,12,14,.35);border-top-color:#0B0C0E;animation:cabin-rot .8s linear infinite}';
  (document.head || document.documentElement).appendChild(s);
}

export function createCabinButton(opts: CabinButtonOpts): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.setAttribute('data-cabin', 'tryon-button');
  const label = opts.label ?? 'Try it on';
  btn.innerHTML = '<span aria-hidden="true" style="font-size:15px;line-height:1">&#10209;</span><span>' + label + '</span>';

  if (opts.mode === 'native' && opts.refButton) {
    const cs = getComputedStyle(opts.refButton);
    btn.style.cssText =
      'box-sizing:border-box;display:flex;flex-basis:100%;width:100%;align-items:center;justify-content:center;gap:9px;margin:10px 0 0;cursor:pointer;' +
      `font:${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize}/${cs.lineHeight} ${cs.fontFamily};` +
      `min-height:${cs.height};padding:10px 18px;border:1px solid ${tokens.gold.g500};border-radius:${cs.borderRadius};` +
      `color:${tokens.gold.g100};background:${tokens.bg.base};`;
  } else {
    ensureStyle();
    btn.className = 'cabin-vt-btn';
  }

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!btn.disabled) opts.onClick();
  });
  return btn;
}

export function setButtonLoading(btn: HTMLButtonElement) {
  btn.disabled = true;
  btn.innerHTML = `<span class="cabin-spin" aria-hidden="true"></span><span>${t().generating}</span>`;
}
export function setButtonDone(btn: HTMLButtonElement) {
  btn.disabled = false;
  btn.innerHTML = `<span aria-hidden="true">&#10003;</span><span>${t().inCabin}</span>`;
}
export function setButtonError(btn: HTMLButtonElement) {
  btn.disabled = false;
  btn.innerHTML = `<span aria-hidden="true">&#10209;</span><span>${t().tryAgain}</span>`;
}
