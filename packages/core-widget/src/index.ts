import { CabinApi } from './api';
import { mountShadow } from './mount';
import { createCabinButton, setButtonLoading, setButtonDone, setButtonError } from './button';
import { cabinItems, panelOpen, profiles, activeProfileId, pageProgress, tryonStatus, type PageProgress } from './state';
import { lang, t } from './i18n';
import { detectGallery } from './detect';
import {
  registerReplacement,
  startReplacementObserver,
  photoId,
  setShowing,
  isShowing,
  shownCount,
  onSwapsChanged,
} from './replace';
import { collectPageImages, revealLazyPhotos } from './collect';
import type { CabinItem, ConvertPlan } from '@aida/shared';

/**
 * Whole-page conversion: photos generating at once. Each one is its own request (up to three Muse Image
 * generations, each checked by Muse Spark: ~45 s to ~3 min). More in flight ran the API's CPU budget out
 * (Cloudflare 1102) and failed every photo still queued.
 */
const PAGE_CONCURRENCY = 5;
/** A photo refused for rate limiting goes back in the queue this many times. */
const MAX_REQUEUES = 2;

const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

/** Cached try-ons for these photos (cache-only, free), in batches of 40 (the API's limit). */
async function lookupAll(api: CabinApi, urls: string[]): Promise<Array<{ garmentImageUrl: string; resultUrl: string }>> {
  const out: Array<{ garmentImageUrl: string; resultUrl: string }> = [];
  for (let i = 0; i < urls.length; i += 40) out.push(...(await api.lookup(urls.slice(i, i + 40))));
  return out;
}

/** Dry run for every large photo on the page: what is cached, what would be generated and its cost (no AI calls). */
export async function planPage(apiBase: string): Promise<ConvertPlan> {
  const api = new CabinApi(apiBase);
  await revealLazyPhotos();
  const urls = collectPageImages().map((p) => p.url);
  const plan: ConvertPlan = { items: [], estimateUsd: 0 };
  for (let i = 0; i < urls.length; i += 40) {
    const part = await api.plan(urls.slice(i, i + 40));
    plan.items.push(...part.items);
    plan.estimateUsd += part.estimateUsd;
  }
  plan.estimateUsd = Math.round(plan.estimateUsd * 10000) / 10000;
  return plan;
}

/**
 * "Show my try-ons" (the extension's switch). On: every try-on this customer has from this site replaces the
 * store photo it was made from, wherever the page shows it — photos the page renders later included, since all
 * of them are loaded at once (nothing is scrolled, the page keeps its place). Off: the store's photos come back
 * at once. `announce` shows on the page how many photos now show the customer.
 */
export async function showTryons(apiBase: string, on: boolean, announce = false): Promise<void> {
  setShowing(on);
  if (!on) {
    tryonStatus.value = null;
    return;
  }
  if (announce) tryonStatus.value = { loading: true, count: 0 };
  const api = new CabinApi(apiBase);
  const hits = await api.lookupSite(location.href).catch(() => []);
  for (const h of hits) {
    const u = api.imageUrl(h.resultUrl);
    if (u) registerReplacement(h.garmentImageUrl, u);
  }
  if (!isShowing()) return; // turned off again meanwhile
  startReplacementObserver();
  if (announce) tryonStatus.value = { loading: false, count: shownCount() };
}

// The count follows the page while the status is up (tiles the page renders as the customer scrolls).
onSwapsChanged(() => {
  const st = tryonStatus.value;
  if (st && !st.loading && st.count !== shownCount()) tryonStatus.value = { ...st, count: shownCount() };
});

export { setShowing };

export interface CabinMountConfig {
  apiBase: string;
  buttonMode?: 'native' | 'branded';
  fullPageEnabled?: boolean;
  buttonLabel?: string;
  lang?: 'en' | 'ro';
  /** 'image' = replace just the main product photo (default). 'page' = replace every photo on the product page. */
  scope?: 'image' | 'page';
  /** The customer asked to see a try-on on the page (Try it on, whole-page conversion) — e.g. switch "Show my try-ons" on. */
  onShowTryons?: () => void;
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
  /** Put the customer into every large photo on the page that shows one person (cached ones first, free). */
  convertPage(): Promise<void>;
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

  // The customer asked to see themselves on the page: try-ons become visible (in the extension the switch goes on).
  function showMine() {
    setShowing(true);
    cfg.onShowTryons?.();
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
      showMine();
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
      showMine();
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

    async convertPage() {
      if (pageProgress.value?.running) return;
      showMine();
      const p: PageProgress = { total: 0, done: 0, skipped: 0, failed: 0, running: true };
      const show = () => (pageProgress.value = { ...p });
      show();
      startReplacementObserver();
      await revealLazyPhotos();

      const queued = new Set<string>();
      const batchId = 'page_' + Math.random().toString(36).slice(2);
      // A few rounds: photos that only appear while converting (lazy loading, carousels) join the next round.
      for (let round = 0; round < 3 && !p.stopped; round++) {
        const photos = collectPageImages().filter((x) => !queued.has(x.id));
        if (!photos.length) break;
        photos.forEach((x) => queued.add(x.id));
        p.total += photos.length;
        show();

        const hits = await lookupAll(api, photos.map((x) => x.url)).catch(() => []);
        for (const h of hits) applyOur(h.garmentImageUrl, h.resultUrl);
        const cached = new Set(hits.map((h) => h.garmentImageUrl));
        p.done += cached.size;
        show();

        const todo = photos.filter((x) => !cached.has(x.url));
        const requeues = new Map<string, number>();
        let next = 0;
        const worker = async () => {
          while (next < todo.length && !p.stopped) {
            const photo = todo[next++];
            try {
              const r = await api.tryon(photo.url, location.href, batchId, { sceneOnly: true });
              if (r.status === 'done') {
                applyOur(photo.url, r.resultUrl);
                p.done++;
              } else if (r.status === 'skipped') p.skipped++;
              else p.failed++;
            } catch (e) {
              const msg = (e as Error).message;
              const n = requeues.get(photo.id) ?? 0;
              if (/\b(429|503)\b|1102|rate.?limit|too many/i.test(msg) && n < MAX_REQUEUES) {
                // Muse Image or the API is busy: this photo goes to the back of the queue, this worker cools down.
                requeues.set(photo.id, n + 1);
                todo.push(photo);
                await sleep(15000);
                continue;
              }
              p.failed++;
              if (/credit/i.test(msg)) p.stopped = 'credits';
            }
            show();
          }
        };
        await Promise.all(Array.from({ length: Math.min(PAGE_CONCURRENCY, todo.length) }, worker));
      }
      p.running = false;
      show();
    },
  };

  void ctrl.refreshCabin();
  void ctrl.hydratePage(); // re-apply cached try-ons for this page's photos on load
  return ctrl;
}

export { CabinApi };
export { detectProductOG, type DetectedProduct } from './detect';
export { collectPageImages, type PagePhoto } from './collect';
