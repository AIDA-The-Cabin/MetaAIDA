// Per-site detection. og:image / og:title are in <head> (reliable). The Add-to-cart button is
// found robustly: a VISIBLE <button> whose text is the buy CTA — never header links or ads.

export interface DetectedProduct {
  garmentImageUrl: string;
  name: string;
  actions: HTMLElement;
  addToCart: HTMLElement | null;
  productImage: HTMLImageElement | null;
}

function meta(prop: string): string | undefined {
  return document.querySelector<HTMLMetaElement>(`meta[property="${prop}"]`)?.content || undefined;
}

function isVisible(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  const s = getComputedStyle(el);
  return r.width >= 120 && r.height >= 28 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.1;
}

function findAddToCart(): HTMLElement | null {
  const els = Array.from(document.querySelectorAll<HTMLElement>('button, input[type="submit"], [role="button"]'));
  const text = (el: HTMLElement) =>
    (el.textContent || (el as HTMLInputElement).value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const strong = (t: string) => /ad[aă]ug[aă]?.{0,4}(in|în).{0,4}co[sș]/.test(t) || /add to (cart|bag|basket)/.test(t);
  const weak = (t: string) => /adaug|add to (cart|bag)/.test(t);
  const visible = els.filter(isVisible);
  return visible.find((el) => strong(text(el))) ?? visible.find((el) => weak(text(el))) ?? null;
}

/** The main product photo on the page — the one we replace with the try-on. */
function findProductImage(garmentUrl: string): HTMLImageElement | null {
  const base = garmentUrl.split('?')[0];
  const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('img')).filter((im) => {
    const r = im.getBoundingClientRect();
    return r.width >= 200 && r.height >= 240;
  });
  const byUrl = imgs.find((im) => (im.currentSrc || im.src).split('?')[0] === base);
  if (byUrl) return byUrl;
  return (
    imgs.sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      return rb.width * rb.height - ra.width * ra.height;
    })[0] ?? null
  );
}

export function detectProduct(): DetectedProduct | null {
  // On Fashion Days only run on product detail pages (/p/...).
  if (location.hostname.includes('fashiondays') && !location.pathname.includes('/p/')) return null;

  const garmentImageUrl = meta('og:image');
  if (!garmentImageUrl) return null;

  const name = meta('og:title') || document.querySelector('h1')?.textContent?.trim() || 'Product';
  const addToCart = findAddToCart();
  const actions = (addToCart?.parentElement as HTMLElement | null) ?? document.body;
  return { garmentImageUrl, name, actions, addToCart, productImage: findProductImage(garmentImageUrl) };
}
