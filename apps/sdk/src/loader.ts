// The Cabin SDK — embeddable loader a retailer drops onto their site:
//   <script src="https://cdn.thecabin/cabin.js" data-cabin-key="..." data-api="..." async></script>
// SEO-safe: never blocks render. Boots only after `load` + on idle, then injects the widget.
import { mountCabin, detectProductOG } from '@aida/core-widget';
import type { SdkConfig } from '@aida/shared';

// Capture our own <script> synchronously (currentScript is null inside the idle callback).
const self = document.currentScript as HTMLScriptElement | null;

function boot(): void {
  const apiKey = self?.dataset.cabinKey ?? '';
  const fallbackOrigin = self?.src ? safeOrigin(self.src) : 'http://localhost:8787';
  const apiBase = (self?.dataset.api || fallbackOrigin).replace(/\/$/, '');

  fetch(apiBase + '/v1/sdk/bootstrap', { method: 'POST', headers: { Authorization: 'Bearer ' + apiKey } })
    .then((r) => (r.ok ? (r.json() as Promise<SdkConfig>) : Promise.reject(new Error('bootstrap ' + r.status))))
    .then((cfg) => {
      const product = detectProductOG();
      if (!product) return;
      const cabin = mountCabin({
        apiBase: cfg.apiBase || apiBase,
        buttonMode: cfg.buttonMode,
        fullPageEnabled: cfg.fullPageEnabled,
      });
      cabin.attachButton(
        product.actions,
        { garmentImageUrl: product.garmentImageUrl, pageUrl: location.href, name: product.name, imageEl: product.productImage },
        product.addToCart,
      );
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
  ric(boot);
}

if (document.readyState === 'complete') schedule();
else window.addEventListener('load', schedule, { once: true });
