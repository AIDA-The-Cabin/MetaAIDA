// Universal product-image REPLACEMENT (extension / B2C). We do NOT overlay — we swap the actual image
// content the page loads: <img> src + srcset, <picture><source> srcset, and CSS background-image. Matching
// is by photo CONTENT id (size/query-independent), so ONE generation covers every slot showing that photo
// (the big main image AND its thumbnail). A MutationObserver re-applies on any change, so thumbnail clicks,
// prev/next arrows, carousels and lazy-loading keep showing our image instead of reverting to the original.
// Every swap remembers what the element showed before, so turning the try-ons off puts the store's photos
// back at once, without a reload.

const replacements = new Map<string, string>(); // photoId(original) -> our absolute result URL
let observer: MutationObserver | null = null;
let scheduled = false;
/** false = the page shows the store's own photos; registered try-ons wait, ready to come back instantly. */
let showing = true;

/** What an element showed before we swapped it (to put it back exactly), and the URL we put in. */
interface Saved {
  ours: string;
  src?: string | null;
  srcset?: string | null;
  bg?: string;
  aspectRatio?: string;
  objectFit?: string;
}
const swapped = new Map<HTMLElement, Saved>();
const listeners = new Set<() => void>();

/** Size/query-independent id for a product photo. Same photo at any size ⇒ same id. */
export function photoId(url: string): string {
  if (!url) return '';
  const m = url.match(/\/(res_[A-Za-z0-9]+)/) || url.match(/\/products\/[^/]+\/[^/]+\/images\/([^/?]+)/);
  if (m) return m[1];
  try {
    const u = new URL(url, location.href);
    // strip CDN size/cache query params and a trailing slash (Scene7: og:image .../x_i, gallery .../x_i/?...)
    return u.host + u.pathname.replace(/\/+$/, '');
  } catch {
    return url.split('?')[0].replace(/\/+$/, '');
  }
}

export function registerReplacement(originalUrl: string, ourUrl: string): void {
  const id = photoId(originalUrl);
  if (id && ourUrl) replacements.set(id, ourUrl);
}

/** Our result for whatever this URL currently points at, or undefined (also undefined for our own URLs). */
function ourFor(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  return replacements.get(photoId(url));
}

function firstSrcsetUrl(srcset: string | null): string | undefined {
  if (!srcset) return undefined;
  return srcset.split(',')[0]?.trim().split(/\s+/)[0];
}

/**
 * Keep the page layout: the try-on fills the original image's frame, cropped like a cover photo
 * (Muse Image makes 1:1, 2:3 or 3:2 images, the page's frame can be anything in between).
 */
function lockFrame(img: HTMLImageElement, saved: Saved): void {
  if (img.dataset.cabinFrame) return;
  saved.aspectRatio = img.style.aspectRatio;
  saved.objectFit = img.style.objectFit;
  const r = img.getBoundingClientRect();
  if (r.width > 0 && r.height > 0) img.style.aspectRatio = `${Math.round(r.width)} / ${Math.round(r.height)}`;
  img.style.objectFit = 'cover';
  img.dataset.cabinFrame = '1';
}

function fixImg(img: HTMLImageElement): void {
  // What original photo is this <img> currently showing? (src, the picked srcset, or its srcset attr)
  const our =
    ourFor(img.getAttribute('src')) ||
    ourFor(img.currentSrc) ||
    ourFor(firstSrcsetUrl(img.getAttribute('srcset')));
  if (!our) return; // not one of ours, or already swapped (our URLs don't map back)
  // The page's own src/srcset right now (a carousel may have moved this <img> to another store photo).
  const prev = swapped.get(img);
  const saved: Saved = {
    ours: our,
    src: img.getAttribute('src'),
    srcset: img.getAttribute('srcset'),
    aspectRatio: prev?.aspectRatio,
    objectFit: prev?.objectFit,
  };
  swapped.set(img, saved);
  lockFrame(img, saved);
  if (img.hasAttribute('srcset')) img.setAttribute('srcset', ''); // let our src win over srcset
  if (img.src !== our) img.src = our;
  const pic = img.closest('picture');
  if (pic) {
    pic.querySelectorAll('source').forEach((s) => {
      if (s.getAttribute('srcset') === our) return;
      swapped.set(s, { ours: our, srcset: s.getAttribute('srcset') });
      s.setAttribute('srcset', our);
    });
  }
}

function fixSource(s: HTMLSourceElement): void {
  const our = ourFor(firstSrcsetUrl(s.getAttribute('srcset'))) || ourFor(s.getAttribute('src'));
  if (!our || !s.hasAttribute('srcset') || s.getAttribute('srcset') === our) return;
  swapped.set(s, { ours: our, srcset: s.getAttribute('srcset') });
  s.setAttribute('srcset', our);
}

function fixBg(el: HTMLElement): void {
  const inline = el.style?.backgroundImage;
  if (!inline || inline === 'none') return;
  const m = inline.match(/url\(["']?([^"')]+)["']?\)/i);
  const our = m && ourFor(m[1]);
  if (!our) return;
  swapped.set(el, { ours: our, bg: inline });
  el.style.setProperty('background-image', `url("${our}")`, 'important');
}

export function applyReplacements(root: ParentNode = document): void {
  if (!showing || !replacements.size) return;
  const scope = root as Element & ParentNode;
  scope.querySelectorAll?.('img').forEach((n) => fixImg(n as HTMLImageElement));
  scope.querySelectorAll?.('source').forEach((n) => fixSource(n as HTMLSourceElement));
  scope.querySelectorAll?.('[style*="background"]').forEach((n) => fixBg(n as HTMLElement));
  listeners.forEach((f) => f());
}

/** Apply now and keep applying on every relevant DOM change (idempotent — safe to call repeatedly). */
export function startReplacementObserver(): void {
  if (!showing) return;
  applyReplacements();
  if (observer) return;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      applyReplacements();
    });
  };
  observer = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'childList' ? m.addedNodes.length : m.type === 'attributes') {
        schedule();
        return;
      }
    }
  });
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['src', 'srcset', 'style'],
  });
}

/** Put the store's photos back wherever the page still shows one of ours (an element the page moved on is left alone). */
function restoreAll(): void {
  const set = (el: HTMLElement, name: string, v: string | null | undefined) =>
    v == null ? el.removeAttribute(name) : el.setAttribute(name, v);
  for (const [el, s] of swapped) {
    if (el instanceof HTMLImageElement) {
      if (el.getAttribute('src') === s.ours) {
        set(el, 'srcset', s.srcset);
        set(el, 'src', s.src);
      }
      if (el.dataset.cabinFrame) {
        el.style.aspectRatio = s.aspectRatio ?? '';
        el.style.objectFit = s.objectFit ?? '';
        delete el.dataset.cabinFrame;
      }
    } else if (el instanceof HTMLSourceElement) {
      if (el.getAttribute('srcset') === s.ours) set(el, 'srcset', s.srcset);
    } else if (s.bg !== undefined && el.style.backgroundImage.includes(s.ours)) {
      el.style.removeProperty('background-image');
      el.style.backgroundImage = s.bg;
    }
  }
  swapped.clear();
  listeners.forEach((f) => f());
}

/** Show the registered try-ons on the page (true) or the store's own photos (false), instantly. */
export function setShowing(on: boolean): void {
  if (on === showing) return;
  showing = on;
  if (on) {
    startReplacementObserver();
    return;
  }
  observer?.disconnect();
  observer = null;
  restoreAll();
}

export function isShowing(): boolean {
  return showing;
}

/** How many different photos on the page show a try-on right now. */
export function shownCount(): number {
  const ids = new Set<string>();
  for (const [el, s] of swapped) {
    if (el instanceof HTMLImageElement && el.isConnected && el.getAttribute('src') === s.ours) ids.add(s.ours);
  }
  return ids.size;
}

/** Called after every pass that may have changed what the page shows. Returns an unsubscribe function. */
export function onSwapsChanged(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}
