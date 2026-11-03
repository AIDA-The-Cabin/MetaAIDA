import type { CabinItem, ConvertPlan, Outfit, OutfitSlot, ProfileFigure, ProfilesResponse, TryonItem, TryonResult } from '@aida/shared';

/** The API's error text: its detail, its code, or Cloudflare's own error page (e.g. 503 "error code: 1102"). */
async function failure(r: Response, fallback: string): Promise<Error> {
  const text = await r.text().catch(() => '');
  let j: { error?: string; detail?: string } = {};
  try {
    j = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return Object.assign(new Error(j.detail || j.error || `${fallback} (${r.status} ${text.slice(0, 80)})`), { code: j.error });
}

export class CabinApi {
  constructor(private base: string) {}

  private url(path: string): string {
    return this.base.replace(/\/$/, '') + path;
  }

  /** Result image URLs from the API are relative (/v1/images/..). Prefix them with the API base. */
  imageUrl(u?: string): string | undefined {
    if (!u) return undefined;
    return u.startsWith('http') ? u : this.url(u);
  }

  /**
   * `sceneOnly`: whole-page conversion — photos without people (or, without `allPeople`, with several) come back
   * `skipped`, free. `productUrl` / `name`: the product the photo belongs to, where the page shows it.
   */
  async tryon(
    garmentImageUrl: string,
    pageUrl: string,
    batchId?: string,
    opts: { sceneOnly?: boolean; allPeople?: boolean; productUrl?: string; name?: string } = {},
  ): Promise<TryonResult> {
    const r = await fetch(this.url('/v1/tryon'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        garmentImageUrl,
        pageUrl,
        batchId,
        sceneOnly: opts.sceneOnly || undefined,
        allPeople: opts.allPeople || undefined,
        // optional: a link the API would refuse (over 2000 characters) must not cost the try-on itself
        productUrl: opts.productUrl && opts.productUrl.length <= 2000 ? opts.productUrl : undefined,
        name: opts.name?.slice(0, 200) || undefined,
      }),
    });
    const text = await r.text();
    let j = {} as TryonResult & { error?: string; detail?: string };
    try {
      j = JSON.parse(text);
    } catch {
      /* Cloudflare's own error page (e.g. 503 "error code: 1102") */
    }
    if (!r.ok) throw new Error(j.detail || j.error || `${r.status} ${text.slice(0, 80)}`);
    return j;
  }

  async addToCabin(garmentImageUrl: string, pageUrl: string, name?: string, batchId?: string): Promise<CabinItem> {
    const r = await fetch(this.url('/v1/cabin'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ garmentImageUrl, pageUrl, name: name?.slice(0, 200), batchId }),
    });
    const j = (await r.json()) as CabinItem & { error?: string; detail?: string };
    if (!r.ok) throw new Error(j.detail || j.error || 'add to cabin failed');
    return j;
  }

  /** Cache-only: which of these page images already have a try-on. */
  async lookup(garmentImageUrls: string[]): Promise<Array<{ garmentImageUrl: string; resultUrl: string }>> {
    const r = await fetch(this.url('/v1/lookup'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ garmentImageUrls }),
    });
    if (!r.ok) return [];
    const j = (await r.json()) as { results?: Array<{ garmentImageUrl: string; resultUrl: string }> };
    return j.results ?? [];
  }

  /** Cache-only: every try-on the customer has from this page's site, at once. */
  async lookupSite(pageUrl: string): Promise<Array<{ garmentImageUrl: string; resultUrl: string }>> {
    const r = await fetch(this.url('/v1/lookup/site'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageUrl }),
    });
    if (!r.ok) return [];
    const j = (await r.json()) as { results?: Array<{ garmentImageUrl: string; resultUrl: string }> };
    return j.results ?? [];
  }

  /** Whole-page conversion dry run for up to 40 photos (no AI calls). */
  async plan(imageUrls: string[]): Promise<ConvertPlan> {
    const r = await fetch(this.url('/v1/convert/plan'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageUrls }),
    });
    if (!r.ok) throw new Error('plan failed');
    return (await r.json()) as ConvertPlan;
  }

  async listCabin(): Promise<CabinItem[]> {
    const r = await fetch(this.url('/v1/cabin'));
    if (!r.ok) return [];
    const j = (await r.json()) as { items: CabinItem[] };
    return j.items ?? [];
  }

  async removeCabin(id: string): Promise<void> {
    await fetch(this.url('/v1/cabin/' + id), { method: 'DELETE' });
  }

  /** Every converted photo of the active profile, newest first (`site`: one store only). */
  async listTryons(site?: string): Promise<TryonItem[]> {
    try {
      const r = await fetch(this.url('/v1/tryons' + (site ? `?site=${encodeURIComponent(site)}` : '')));
      if (!r.ok) return [];
      return ((await r.json()) as { items?: TryonItem[] }).items ?? [];
    } catch {
      return [];
    }
  }

  async removeTryon(id: string): Promise<void> {
    const r = await fetch(this.url('/v1/tryons/' + id), { method: 'DELETE' });
    if (!r.ok) throw await failure(r, 'remove failed');
  }

  /** Where the person stands in the active profile's photo (null: no photo). */
  async figure(): Promise<ProfileFigure | null> {
    try {
      const r = await fetch(this.url('/v1/profile/figure'));
      return r.ok ? ((await r.json()) as ProfileFigure) : null;
    } catch {
      return null;
    }
  }

  /** The active profile's own photo (the figure the Cabin dresses). */
  photoUrl(version: string): string {
    return this.url('/v1/profile/photo?v=' + encodeURIComponent(version));
  }

  /** Dress the active profile's photo in the pieces dropped on its zones (a minute or two). */
  async createOutfit(slots: Partial<Record<OutfitSlot, string>>): Promise<Outfit> {
    const r = await fetch(this.url('/v1/outfits'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slots }),
    });
    if (!r.ok) throw await failure(r, 'outfit failed');
    return (await r.json()) as Outfit;
  }

  async listOutfits(): Promise<Outfit[]> {
    try {
      const r = await fetch(this.url('/v1/outfits'));
      if (!r.ok) return [];
      return ((await r.json()) as { items?: Outfit[] }).items ?? [];
    } catch {
      return [];
    }
  }

  async removeOutfit(id: string): Promise<void> {
    const r = await fetch(this.url('/v1/outfits/' + id), { method: 'DELETE' });
    if (!r.ok) throw await failure(r, 'remove failed');
  }

  /** Everyone on the account, and who is active. */
  async profiles(): Promise<ProfilesResponse | null> {
    try {
      const r = await fetch(this.url('/v1/profiles'));
      return r.ok ? ((await r.json()) as ProfilesResponse) : null;
    } catch {
      return null;
    }
  }

  async activateProfile(id: string): Promise<void> {
    await fetch(this.url(`/v1/profiles/${id}/activate`), { method: 'POST' });
  }

  /** The website page where profiles are created and their photos uploaded. */
  profilePage(): string {
    return this.url('/profile');
  }
}
