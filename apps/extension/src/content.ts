import { mountCabin, type CabinController } from '@aida/core-widget';
import { detectProduct } from './adapters';

declare const chrome: any;

const API_BASE = 'https://metaaida.pages.dev';

let cabin: CabinController | null = null;
let injected = false;
let scope: 'image' | 'page' = 'image';

function removeWidget() {
  document.querySelectorAll('[data-cabin="tryon-button"]').forEach((e) => e.remove());
  document.querySelectorAll('[data-cabin-overlay]').forEach((e) => e.remove());
  document.getElementById('cabin-root')?.remove();
  injected = false;
  cabin = null;
}

function tryInject(): boolean {
  if (injected) return true;
  const product = detectProduct();
  if (!product || !product.addToCart) return false;
  cabin = mountCabin({ apiBase: API_BASE, buttonMode: 'branded', fullPageEnabled: false, scope });
  cabin.attachButton(
    product.actions,
    { garmentImageUrl: product.garmentImageUrl, pageUrl: location.href, name: product.name, imageEl: product.productImage },
    product.addToCart,
  );
  injected = true;
  return true;
}

function startWatching() {
  if (tryInject()) return;
  const obs = new MutationObserver(() => {
    if (tryInject()) obs.disconnect();
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => obs.disconnect(), 15000);
}

async function getSettings(): Promise<{ enabled: boolean; scope: 'image' | 'page' }> {
  try {
    const r = await chrome.storage.local.get(['cabinEnabled', 'cabinScope']);
    return {
      enabled: r.cabinEnabled !== false,
      scope: r.cabinScope === 'page' ? 'page' : 'image',
    };
  } catch {
    return { enabled: true, scope: 'image' };
  }
}

async function boot() {
  const s = await getSettings();
  scope = s.scope;
  if (s.enabled) startWatching();
  else removeWidget();
}

// React live to popup changes (on/off, scope) — re-mount with the new settings.
try {
  chrome.storage?.onChanged?.addListener((changes: any, area: string) => {
    if (area !== 'local') return;
    // Another person → every try-on on the page changes → reload the page.
    if (changes.cabinProfileSwitch && injected) return location.reload();
    if (changes.cabinEnabled || changes.cabinScope) {
      removeWidget();
      boot();
    }
  });
} catch {
  /* no chrome outside the extension */
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
