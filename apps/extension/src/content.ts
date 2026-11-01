import { mountCabin, planPage, watchPageImages, type CabinController } from '@aida/core-widget';
import { detectProduct } from './adapters';

declare const chrome: any;

const API_BASE = 'https://metaaida.pages.dev';

let cabin: CabinController | null = null;
let injected = false;
let scope: 'image' | 'page' = 'image';
let enabled = true;
let stopWatching: (() => void) | null = null;

/** The widget (Cabin tab + panel), mounted on first need: a product page, or a whole-page conversion. */
function ensureCabin(): CabinController {
  if (!cabin) cabin = mountCabin({ apiBase: API_BASE, buttonMode: 'branded', fullPageEnabled: false, scope });
  return cabin;
}

function removeWidget() {
  document.querySelectorAll('[data-cabin="tryon-button"]').forEach((e) => e.remove());
  document.querySelectorAll('[data-cabin-overlay]').forEach((e) => e.remove());
  document.getElementById('cabin-root')?.remove();
  stopWatching?.();
  stopWatching = null;
  injected = false;
  cabin = null;
}

function tryInject(): boolean {
  if (injected) return true;
  const product = detectProduct();
  if (!product || !product.addToCart) return false;
  // A button left by an earlier copy of this script (the extension was updated while the tab was open).
  document.querySelectorAll('[data-cabin="tryon-button"]').forEach((e) => e.remove());
  ensureCabin().attachButton(
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
  enabled = s.enabled;
  if (!s.enabled) return removeWidget();
  // The Cabin tab is on every page of a supported store, not only on product pages.
  ensureCabin();
  startWatching();
  // Every page: show the try-ons this customer already has for its photos (cache-only, free).
  stopWatching ??= watchPageImages(API_BASE);
}

// The popup's "This page" buttons: a dry run (what converting would cost) and the whole-page conversion.
try {
  chrome.runtime?.onMessage?.addListener((msg: any, _sender: unknown, reply: (r: unknown) => void) => {
    if (!enabled) {
      reply({ error: 'The Cabin is turned off.' });
      return false;
    }
    if (msg?.type === 'cabin-convert-page') {
      void ensureCabin().convertPage();
      reply({ started: true });
      return false;
    }
    if (msg?.type === 'cabin-plan-page') {
      planPage(API_BASE)
        .then((plan) => {
          const n = (st: string) => plan.items.filter((i) => i.state === st).length;
          reply({
            total: plan.items.length,
            cached: n('cached'),
            todo: n('ready') + n('new'),
            skip: n('skip'),
            unreachable: n('unreachable'),
            estimateUsd: plan.estimateUsd,
          });
        })
        .catch(() => reply({ error: 'Could not check this page.' }));
      return true; // the reply comes later
    }
    return false;
  });
} catch {
  /* no chrome outside the extension */
}

// React live to popup changes (on/off, scope) — re-mount with the new settings.
try {
  chrome.storage?.onChanged?.addListener((changes: any, area: string) => {
    if (area !== 'local') return;
    // Another person → every try-on on the page changes → reload the page.
    if (changes.cabinProfileSwitch && (injected || cabin || stopWatching)) return location.reload();
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
