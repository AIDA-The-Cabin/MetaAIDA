// The Cabin SDK — the one line a store adds to its site (before </body>):
//   <script src="https://metaaida.pages.dev/cabin.js" data-cabin-key="YOUR_STORE_KEY" async></script>
// Optional: data-lang="en|ro" (widget language), data-api="https://…" (API origin; defaults to the script's origin).
// SEO-safe: never blocks render. Boots only after `load` + on idle, then injects the widget.
// Single-page stores call window.TheCabin.refresh() after each client-side navigation.
import { mountCabin, detectProductOG, type CabinController } from '@aida/core-widget';
import type { SdkConfig } from '@aida/shared';

interface TheCabinApi {
  /** Re-detect the product on the current page (call after client-side navigation). */
  refresh(): void;
  /** Open / close the Cabin panel (the customer's saved looks). */
  open(): void;
  close(): void;
}

declare global {
  interface Window {
    TheCabin?: TheCabinApi;
  }
}

// Capture our own <script> synchronously (currentScript is null inside the idle callback).
const self = document.currentScript as HTMLScriptElement | null;

let config: (SdkConfig & { apiBase: string }) | null = null;
let cabin: CabinController | null = null;
let button: HTMLButtonElement | null = null;
let booted: Promise<void> | null = null;

/** Put Try it on next to the current page's product (the widget mounts on the first product page seen). */
function attach(): void {
  button?.remove();
  button = null;
  if (!config) return;
  const product = detectProductOG();
  if (!product) return;
  if (!cabin) {
    cabin = mountCabin({
      apiBase: config.apiBase,
      buttonMode: config.buttonMode,
      fullPageEnabled: config.fullPageEnabled,
      lang: self?.dataset.lang === 'ro' ? 'ro' : 'en',
    });
  }
  button = cabin.attachButton(
    product.actions,
    { garmentImageUrl: product.garmentImageUrl, pageUrl: location.href, name: product.name, imageEl: product.productImage },
    product.addToCart,
  );
  void cabin.hydratePage(product.garmentImageUrl); // show try-ons this customer already has for this product
}

function boot(): Promise<void> {
  const apiKey = self?.dataset.cabinKey ?? '';
  const fallbackOrigin = self?.src ? safeOrigin(self.src) : 'http://localhost:8787';
  const apiBase = (self?.dataset.api || fallbackOrigin).replace(/\/$/, '');

  return fetch(apiBase + '/v1/sdk/bootstrap', { method: 'POST', headers: { Authorization: 'Bearer ' + apiKey } })
    .then((r) => (r.ok ? (r.json() as Promise<SdkConfig>) : Promise.reject(new Error('bootstrap ' + r.status))))
    .then((cfg) => {
      config = { ...cfg, apiBase: cfg.apiBase || apiBase };
      attach();
    })
    .catch((e) => console.warn('[cabin]', (e as Error).message));
}

function safeOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return 'http://localhost:8787';
  }
}

function schedule(): void {
  const ric =
    (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback ??
    ((cb: () => void) => window.setTimeout(cb, 1));
  ric(() => {
    booted = boot();
  });
}

window.TheCabin = {
  refresh() {
    if (booted) void booted.then(attach);
  },
  open() {
    cabin?.openPanel();
  },
  close() {
    cabin?.closePanel();
  },
};

if (document.readyState === 'complete') schedule();
else window.addEventListener('load', schedule, { once: true });
