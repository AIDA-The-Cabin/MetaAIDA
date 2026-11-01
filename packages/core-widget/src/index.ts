import { CabinApi } from './api';
import { mountShadow } from './mount';
import { createCabinButton, setButtonLoading, setButtonDone, setButtonError } from './button';
import { cabinItems, panelOpen, profiles, activeProfileId } from './state';
import { lang, t } from './i18n';
import { detectGallery } from './detect';
import { registerReplacement, startReplacementObserver, photoId } from './replace';
import type { CabinItem } from '@aida/shared';

export interface CabinMountConfig {
  apiBase: string;
  buttonMode?: 'native' | 'branded';
  fullPageEnabled?: boolean;
  buttonLabel?: string;
  lang?: 'en' | 'ro';
  /** 'image' = replace just the main product photo (default). 'page' = replace every photo on the product page. */
  scope?: 'image' | 'page';
}

export interface CabinProductRef {
  garmentImageUrl: string;
  pageUrl: string;
  name?: string;
  /** @deprecated no longer used — replacement is global by photo content id. Kept for source compat. */
  imageEl?: HTMLImageElement | null;
}

export interface CabinController {
  attachButton(target: HTMLElement, product: CabinProductRef, refButton?: HTMLElement | null): HTMLButtonElement;
  tryOn(product: CabinProductRef, btn?: HTMLButtonElement | null): void;
  tryOnPage(product: CabinProductRef, btn?: HTMLButtonElement | null): void;
  hydratePage(ogImage?: string): Promise<void>;
  openPanel(): void;
  closePanel(): void;
  refreshCabin(): Promise<void>;
  bakePage(targets: { el: HTMLImageElement; product: CabinProductRef }[]): void;
}

export function mountCabin(cfg: CabinMountConfig): CabinController {
  const api = new CabinApi(cfg.apiBase);
  lang.value = cfg.lang ?? 'en';
  mountShadow(api);

  // Who is trying clothes on (avatar on the tab, name + switcher in the panel).
  void api.profiles().then((r) => {
    if (!r) return;
    profiles.value = r.profiles;
    activeProfileId.value = r.activeId;
  });

  // Register a generated result for an original product photo, then REPLACE it everywhere on the page
  // (and keep it replaced through navigation). No overlays — we swap the real image content.
  function applyOur(originalUrl: string, resultUrl: string | undefined) {
    const u = api.imageUrl(resultUrl);
    if (!u) return;
    registerReplacement(originalUrl, u);
    startReplacementObserver();
  }

  // Mark a Cabin item done + replace its product photo on the page.
  function applyResult(itemId: string, resultUrl: string | undefined, originalUrl: string, btn?: HTMLButtonElement | null) {
    cabinItems.value = cabinItems.value.map((i) => (i.id === itemId ? { ...i, status: 'done' as const, resultUrl } : i));
    applyOur(originalUrl, resultUrl);
    if (btn) setButtonDone(btn);
  }

  const ctrl: CabinController = {
    attachButton(target, product, refButton) {
      const btn = createCabinButton({
        mode: cfg.buttonMode ?? 'branded',
        label: cfg.buttonLabel ?? t().button,
        refButton: refButton ?? null,
        onClick: () => (cfg.scope === 'page' ? ctrl.tryOnPage(product, btn) : ctrl.tryOn(product, btn)),
      });
      if (refButton && refButton.parentElement) refButton.insertAdjacentElement('afterend', btn);
      else target.appendChild(btn);
      return btn;
    },

    // Individual: add to the Cabin + replace the main product photo on the page.
    tryOn(product, btn) {
      if (btn) setButtonLoading(btn);
      const tmpId = 'tmp_' + Math.random().toString(36).slice(2);
      const placeholder: CabinItem = {
        id: tmpId,
        name: product.name,
        garmentImageUrl: product.garmentImageUrl,
        pageUrl: product.pageUrl,
        status: 'processing',
        addedAt: Date.now(),
      };
      cabinItems.value = [placeholder, ...cabinItems.value];

      api
        .addToCabin(product.garmentImageUrl, product.pageUrl, product.name)
        .then((item) => {
          cabinItems.value = [item, ...cabinItems.value.filter((i) => i.id !== tmpId && i.id !== item.id)];
          applyResult(item.id, item.resultUrl, product.garmentImageUrl, btn);
        })
        .catch(() => {
          cabinItems.value = cabinItems.value.filter((i) => i.id !== tmpId);
          if (btn) setButtonError(btn);
        });
    },

    // Perpetual: replace EVERY distinct product photo (main + thumbnails) with the user's try-on, in
    // parallel. One Cabin card (the main photo). Deduped by content id — each photo generated ONCE, then
    // shown in every slot (big image AND thumbnail) by the replacement engine.
    tryOnPage(product, btn) {
      const gallery = detectGallery(product.garmentImageUrl);
      if (gallery.length <= 1) return ctrl.tryOn(product, btn); // single/none detected → normal flow
      if (btn) setButtonLoading(btn);
      startReplacementObserver(); // observe now so each result applies the moment it lands
      const batchId = 'batch_' + Math.random().toString(36).slice(2);
      const main = gallery.find((g) => photoId(g.url) === photoId(product.garmentImageUrl)) ?? gallery[0];
      const ordered = [main, ...gallery.filter((g) => g !== main)]; // main first → it becomes the Cabin card

      const tmpId = 'tmp_' + Math.random().toString(36).slice(2);
      cabinItems.value = [
        { id: tmpId, name: product.name, garmentImageUrl: main.url, pageUrl: product.pageUrl, status: 'processing', addedAt: Date.now() },
        ...cabinItems.value,
      ];

      // The main photo → addToCabin (one product card). Every other photo → generate-only.
      const runMain = async (g: { url: string }) => {
        const item = await api.addToCabin(g.url, product.pageUrl, product.name, batchId);
        cabinItems.value = [item, ...cabinItems.value.filter((i) => i.id !== tmpId && i.id !== item.id)];
        applyOur(g.url, item.resultUrl);
      };
      const runRest = async (g: { url: string }) => {
        const res = await api.tryon(g.url, product.pageUrl, batchId);
        applyOur(g.url, res.resultUrl);
      };

      // One request per photo (each one a separate Muse Image generation), at most 4 in flight at a time.
      let next = 0;
      const worker = async () => {
        while (next < ordered.length) {
          const idx = next++;
          try {
            await (idx === 0 ? runMain(ordered[idx]) : runRest(ordered[idx]));
          } catch {
            if (idx === 0) cabinItems.value = cabinItems.value.filter((i) => i.id !== tmpId);
          }
        }
      };
      Promise.allSettled(Array.from({ length: Math.min(4, ordered.length) }, worker)).then(() => {
        if (btn) setButtonDone(btn);
      });
    },

    // On a product page: replace any photos we ALREADY have a try-on for (cache-only, no generation).
    async hydratePage(ogImage) {
      try {
        const gallery = detectGallery(ogImage);
        if (!gallery.length) return;
        const results = await api.lookup(gallery.map((g) => g.url));
        if (!results.length) return;
        for (const r of results) applyOur(r.garmentImageUrl, r.resultUrl);
      } catch {
        /* ignore */
      }
    },

    openPanel() {
      panelOpen.value = true;
    },
    closePanel() {
      panelOpen.value = false;
    },
    async refreshCabin() {
      try {
        cabinItems.value = await api.listCabin();
      } catch {
        /* ignore */
      }
    },

    // Mode A (SDK showcase): generate for every listed product as it scrolls into view, then replace
    // its photo via the replacement engine (no overlay). Viewport-lazy.
    bakePage(targets) {
      startReplacementObserver();
      const io = new IntersectionObserver(
        (entries) => {
          for (const en of entries) {
            if (!en.isIntersecting) continue;
            const el = en.target as HTMLImageElement;
            if (el.dataset.cabinBaked) continue;
            const tgt = targets.find((x) => x.el === el);
            if (!tgt) continue;
            el.dataset.cabinBaked = '1';
            io.unobserve(el);
            api
              .addToCabin(tgt.product.garmentImageUrl, tgt.product.pageUrl, tgt.product.name)
              .then((item) => applyOur(tgt.product.garmentImageUrl, item.resultUrl))
              .catch(() => {});
          }
        },
        { rootMargin: '250px' },
      );
      for (const tg of targets) io.observe(tg.el);
    },
  };

  void ctrl.refreshCabin();
  void ctrl.hydratePage(); // re-apply cached try-ons for this page's photos on load
  return ctrl;
}

export { CabinApi };
export { detectProductOG, type DetectedProduct } from './detect';
