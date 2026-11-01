// Universal product-image REPLACEMENT (extension / B2C). We do NOT overlay — we swap the actual image
// content the page loads: <img> src + srcset, <picture><source> srcset, and CSS background-image. Matching
// is by photo CONTENT id (size/query-independent), so ONE generation covers every slot showing that photo
// (the big main image AND its thumbnail). A MutationObserver re-applies on any change, so thumbnail clicks,
// prev/next arrows, carousels and lazy-loading keep showing our image instead of reverting to the original.

const replacements = new Map<string, string>(); // photoId(original) -> our absolute result URL
let observer: MutationObserver | null = null;
let scheduled = false;

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

function fixImg(img: HTMLImageElement): void {
  // What original photo is this <img> currently showing? (src, the picked srcset, or its srcset attr)
  const our =
    ourFor(img.getAttribute('src')) ||
    ourFor(img.currentSrc) ||
    ourFor(firstSrcsetUrl(img.getAttribute('srcset')));
  if (!our) return; // not one of ours, or already swapped (our URLs don't map back)
  if (img.hasAttribute('srcset')) img.setAttribute('srcset', ''); // let our src win over srcset
  if (img.src !== our) img.src = our;
  const pic = img.closest('picture');
  if (pic) pic.querySelectorAll('source').forEach((s) => s.setAttribute('srcset', our));
}

function fixSource(s: HTMLSourceElement): void {
  const our = ourFor(firstSrcsetUrl(s.getAttribute('srcset'))) || ourFor(s.getAttribute('src'));
  if (!our) return;
  if (s.getAttribute('srcset') !== our && s.hasAttribute('srcset')) s.setAttribute('srcset', our);
}

function fixBg(el: HTMLElement): void {
  const inline = el.style?.backgroundImage;
  if (!inline || inline === 'none') return;
  const m = inline.match(/url\(["']?([^"')]+)["']?\)/i);
  const our = m && ourFor(m[1]);
  if (!our) return;
  el.style.setProperty('background-image', `url("${our}")`, 'important');
}

export function applyReplacements(root: ParentNode = document): void {
  if (!replacements.size) return;
  const scope = root as Element & ParentNode;
  scope.querySelectorAll?.('img').forEach((n) => fixImg(n as HTMLImageElement));
  scope.querySelectorAll?.('source').forEach((n) => fixSource(n as HTMLSourceElement));
  scope.querySelectorAll?.('[style*="background"]').forEach((n) => fixBg(n as HTMLElement));
}

/** Apply now and keep applying on every relevant DOM change (idempotent — safe to call repeatedly). */
export function startReplacementObserver(): void {
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
