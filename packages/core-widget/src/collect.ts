// Whole-page conversion: every large content photo on the page (campaign images, product tiles), once per
// photo. Each photo gets ONE deterministic URL — the srcset candidate closest to 1200 px wide — so the same
// photo maps to the same cached try-on on every visit, whatever size the page happened to load.
import { photoId } from './replace';

export interface PagePhoto {
  /** Stable URL for this photo (the cache key on the server). */
  url: string;
  /** Size/query-independent photo id (what the replacement engine matches on). */
  id: string;
}

const MIN_SIDE = 180;
const TARGET_W = 1200;
// Not aria-hidden: stores mark visible product pictures aria-hidden (decorative for screen readers);
// hidden menus are dropped by size anyway.
const SKIP_INSIDE = 'header, nav, footer, [role="navigation"], #cabin-root';

interface Candidate {
  url: string;
  w: number;
}

function parseSrcset(srcset: string | null): Candidate[] {
  if (!srcset) return [];
  return srcset
    .split(',')
    .map((part) => {
      const [url, d = ''] = part.trim().split(/\s+/);
      const w = d.endsWith('w') ? parseInt(d, 10) : d.endsWith('x') ? Math.round(parseFloat(d) * 1000) : 0;
      return { url, w: Number.isFinite(w) ? w : 0 };
    })
    .filter((c) => !!c.url);
}

function absolute(url: string | null | undefined): string {
  if (!url) return '';
  try {
    return new URL(url, location.href).href;
  } catch {
    return '';
  }
}

function usable(url: string): boolean {
  if (!/^https?:\/\//.test(url) || url === location.href) return false;
  if (url.includes('/v1/images/')) return false; // already one of ours
  return !/\.(svg|gif)(\?|$)/i.test(url);
}

/** The photo this <img> shows (or will show once lazy-loaded). */
function activeUrl(img: HTMLImageElement): string {
  const current = absolute(img.currentSrc);
  if (usable(current)) return current;
  const pic = img.closest('picture');
  if (pic) {
    for (const s of Array.from(pic.querySelectorAll('source'))) {
      if (s.media && !window.matchMedia(s.media).matches) continue;
      const first = absolute(parseSrcset(s.getAttribute('srcset') ?? s.getAttribute('data-srcset'))[0]?.url);
      if (usable(first)) return first;
    }
  }
  for (const v of [
    parseSrcset(img.getAttribute('srcset') ?? img.getAttribute('data-srcset'))[0]?.url,
    img.getAttribute('data-src'),
    img.getAttribute('src'),
  ]) {
    const u = absolute(v);
    if (usable(u)) return u;
  }
  return '';
}

export function collectPageImages(root: ParentNode = document): PagePhoto[] {
  const out = new Map<string, PagePhoto>();
  for (const img of Array.from(root.querySelectorAll<HTMLImageElement>('img'))) {
    if (img.closest(SKIP_INSIDE)) continue;
    const r = img.getBoundingClientRect();
    if (r.width < MIN_SIDE || r.height < MIN_SIDE) continue;
    const active = activeUrl(img);
    if (!active) continue;
    const id = photoId(active);
    if (!id || out.has(id)) continue;

    // Every size the page offers for this same photo; take the one closest to TARGET_W (ties → larger).
    const pic = img.closest('picture');
    const sets = [img.getAttribute('srcset'), ...Array.from(pic?.querySelectorAll('source') ?? []).map((s) => s.getAttribute('srcset'))];
    const sizes = sets
      .flatMap(parseSrcset)
      .map((c) => ({ ...c, url: absolute(c.url) }))
      .filter((c) => c.w > 0 && usable(c.url) && photoId(c.url) === id);
    sizes.sort((a, b) => Math.abs(a.w - TARGET_W) - Math.abs(b.w - TARGET_W) || b.w - a.w);
    out.set(id, { url: sizes[0]?.url ?? active, id });
  }
  return [...out.values()];
}
