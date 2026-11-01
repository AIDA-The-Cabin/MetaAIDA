export interface DetectedProduct {
  garmentImageUrl: string;
  name: string;
  actions: HTMLElement;
  addToCart: HTMLElement | null;
  productImage: HTMLImageElement | null;
}

function meta(prop: string): string | undefined {
  return (
    document.querySelector<HTMLMetaElement>(`meta[property="${prop}"]`)?.content ||
    document.querySelector<HTMLMetaElement>(`meta[name="${prop}"]`)?.content ||
    undefined
  );
}

function findAddToCart(): HTMLElement | null {
  const els = Array.from(document.querySelectorAll<HTMLElement>('button, input[type="submit"], [role="button"]'));
  const text = (el: HTMLElement) =>
    (el.textContent || (el as HTMLInputElement).value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const strong = (s: string) => /ad[aă]ug[aă]?.{0,4}(in|în).{0,4}co[sș]/.test(s) || /add to (cart|bag|basket)/.test(s);
  const weak = (s: string) => /adaug|add to (cart|bag)/.test(s);
  const vis = els.filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width >= 120 && r.height >= 28;
  });
  return vis.find((el) => strong(text(el))) ?? vis.find((el) => weak(text(el))) ?? null;
}

function findProductImage(garmentUrl: string): HTMLImageElement | null {
  const base = garmentUrl.split('?')[0];
  const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('img')).filter((im) => {
    const r = im.getBoundingClientRect();
    return r.width >= 200 && r.height >= 240;
  });
  return (
    imgs.find((im) => (im.currentSrc || im.src).split('?')[0] === base) ??
    imgs.sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      return rb.width * rb.height - ra.width * ra.height;
    })[0] ??
    null
  );
}

export interface GalleryImage {
  /** Best (largest) source URL for this photo — what we send to the engine. */
  url: string;
  /** Every <img> on the page showing this same photo (main + thumbnails) — all get the overlay. */
  els: HTMLImageElement[];
}

/** Content id for de-dup: the same photo at different sizes shares this. FD → res_<hash>, else path. */
function imageDedupId(url: string): string {
  const m = url.match(/\/(res_[A-Za-z0-9]+)/) || url.match(/\/products\/[^/]+\/[^/]+\/images\/([^/?]+)/);
  return m ? m[1] : url.split('?')[0];
}
/** The path segment every photo of one product shares (FD: /products/<id>/). null = use a generic match. */
function productSignature(url: string): string | null {
  const m = url.match(/(\/products\/[^/]+\/)/);
  return m ? m[1] : null;
}
function fdArea(url: string): number {
  const m = url.match(/\/m\/(\d+)x(\d+)\//);
  return m ? Number(m[1]) * Number(m[2]) : 0;
}

/**
 * All distinct product photos on the page (main + gallery thumbnails), each with every <img> that
 * shows it. De-duped so we never generate the same photo twice. Matches by the product's CDN
 * signature when present (FD), else by same-host large images sharing the og:image group.
 */
export function detectGallery(ogImage?: string): GalleryImage[] {
  const og = ogImage || meta('og:image') || '';
  const sig = og ? productSignature(og) : null;
  const ogId = og ? imageDedupId(og) : null;
  let ogHost = '';
  try {
    ogHost = og ? new URL(og, location.href).host : '';
  } catch {
    /* ignore */
  }

  const map = new Map<string, GalleryImage>();
  for (const im of Array.from(document.querySelectorAll<HTMLImageElement>('img'))) {
    const src = im.currentSrc || im.src;
    if (!src) continue;
    let host = '';
    try {
      host = new URL(src, location.href).host;
    } catch {
      continue;
    }
    const isProduct = sig
      ? src.includes(sig)
      : (ogId && imageDedupId(src) === ogId) ||
        (host === ogHost && (im.naturalWidth >= 200 || im.getBoundingClientRect().width >= 120));
    if (!isProduct) continue;

    const id = imageDedupId(src);
    const g = map.get(id);
    if (g) {
      g.els.push(im);
      if (fdArea(src) > fdArea(g.url)) g.url = src; // keep the highest-res source for generation
    } else {
      map.set(id, { url: src, els: [im] });
    }
  }
  // Keep the main photo's URL identical to og:image so single-image and whole-page share one cache entry.
  if (ogId && og && map.has(ogId)) map.get(ogId)!.url = og;
  return [...map.values()];
}

function marked(attr: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[${attr}]`);
}

function absolute(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url, location.href).href;
  } catch {
    return undefined;
  }
}

/**
 * Product detection for the SDK. A store's own markers win over guessing:
 *   data-cabin-image  — the main product photo (<img>, or any element with the photo URL as the value)
 *   data-cabin-name   — the product name (text, or the value)
 *   data-cabin-cart   — the add-to-cart button; Try it on goes right after it
 *   data-cabin-button — an empty element to put Try it on into instead
 * Without markers: Open Graph (og:image, og:title) + the add-to-cart button found by its text.
 * No add-to-cart button and no slot → not a product page (null).
 */
export function detectProductOG(): DetectedProduct | null {
  const imageEl = marked('data-cabin-image');
  const markedUrl =
    imageEl?.getAttribute('data-cabin-image') ||
    (imageEl instanceof HTMLImageElement ? imageEl.currentSrc || imageEl.src : '');
  const garmentImageUrl = absolute(markedUrl) || meta('og:image');
  if (!garmentImageUrl) return null;
  const nameEl = marked('data-cabin-name');
  const name =
    nameEl?.getAttribute('data-cabin-name') ||
    nameEl?.textContent?.trim() ||
    meta('og:title') ||
    document.querySelector('h1')?.textContent?.trim() ||
    'Product';
  const slot = marked('data-cabin-button');
  const addToCart = slot ? null : (marked('data-cabin-cart') ?? findAddToCart());
  // A product page has somewhere to buy: no cart button and no slot → home, category or cart page.
  const actions = slot ?? (addToCart?.parentElement as HTMLElement | null);
  if (!actions) return null;
  const productImage = imageEl instanceof HTMLImageElement ? imageEl : findProductImage(garmentImageUrl);
  return { garmentImageUrl, name, actions, addToCart, productImage };
}
