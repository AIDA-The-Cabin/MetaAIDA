import { mountCabin, planPage, setShowing, showTryons, type CabinController } from '@aida/core-widget';
import { detectProduct } from './adapters';

declare const chrome: any;

const API_BASE = 'https://metaaida.pages.dev';

let cabin: CabinController | null = null;
let injected = false;
let scope: 'image' | 'page' = 'image';

/** The customer asked to see a try-on (Try it on, Convert all photos): the popup's "Show my try-ons" goes on. */
function turnShowOn() {
  try {
    void chrome.storage.local.set({ cabinShow: true });
  } catch {
    /* no chrome outside the extension */
  }
}

/** The widget (Cabin tab + panel), mounted on first need: a product page, or a whole-page conversion. */
function ensureCabin(): CabinController {
  if (!cabin) {
    cabin = mountCabin({ apiBase: API_BASE, buttonMode: 'branded', fullPageEnabled: false, scope, onShowTryons: turnShowOn });
  }
  return cabin;
}

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

async function getSettings(): Promise<{ show: boolean; scope: 'image' | 'page' }> {
  try {
    const r = await chrome.storage.local.get(['cabinShow', 'cabinScope']);
    return {
      show: r.cabinShow === true, // "Show my try-ons" starts off: the store's own photos
      scope: r.cabinScope === 'page' ? 'page' : 'image',
    };
  } catch {
    return { show: false, scope: 'image' };
  }
}

async function boot() {
  const s = await getSettings();
  scope = s.scope;
  // Before anything registers a try-on, so a page opened with the switch off never flashes one.
  setShowing(s.show);
  // The Cabin tab is on every page of a supported store, not only on product pages.
  ensureCabin();
  startWatching();
  if (s.show) void showTryons(API_BASE, true);
}

// The popup's "This page" buttons: a dry run (what converting would cost) and the whole-page conversion.
try {
  chrome.runtime?.onMessage?.addListener((msg: any, _sender: unknown, reply: (r: unknown) => void) => {
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

// React live to popup changes: "Show my try-ons" swaps the photos in place (no reload), scope re-mounts.
try {
  chrome.storage?.onChanged?.addListener((changes: any, area: string) => {
    if (area !== 'local') return;
    // Another person → every try-on on the page changes → reload the page.
    if (changes.cabinProfileSwitch && cabin) return location.reload();
    if (changes.cabinShow) void showTryons(API_BASE, changes.cabinShow.newValue === true, true);
    if (changes.cabinScope) {
      removeWidget();
      void boot();
    }
  });
} catch {
  /* no chrome outside the extension */
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
