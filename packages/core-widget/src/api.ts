import type { CabinItem, ConvertPlan, ProfilesResponse, TryonResult } from '@aida/shared';

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

  /** `sceneOnly`: whole-page conversion — photos without exactly one person come back `skipped`, free. */
  async tryon(garmentImageUrl: string, pageUrl: string, batchId?: string, opts: { sceneOnly?: boolean } = {}): Promise<TryonResult> {
    const r = await fetch(this.url('/v1/tryon'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ garmentImageUrl, pageUrl, batchId, sceneOnly: opts.sceneOnly || undefined }),
    });
    const j = (await r.json()) as TryonResult & { error?: string; detail?: string };
    if (!r.ok) throw new Error(j.detail || j.error || 'try-on failed');
    return j;
  }

  async addToCabin(garmentImageUrl: string, pageUrl: string, name?: string, batchId?: string): Promise<CabinItem> {
    const r = await fetch(this.url('/v1/cabin'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ garmentImageUrl, pageUrl, name, batchId }),
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
