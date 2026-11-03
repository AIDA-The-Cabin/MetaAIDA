import { signal } from '@preact/signals';
import type { CabinItem, Outfit, OutfitSlot, ProfileFigure, ProfileSummary, TryonItem } from '@aida/shared';

export const panelOpen = signal(false);
export const cabinItems = signal<CabinItem[]>([]);
/** Everyone on the account, and who is trying clothes on right now. */
export const profiles = signal<ProfileSummary[]>([]);
export const activeProfileId = signal<string | null>(null);

/** Whole-page conversion progress (null = nothing running or shown). */
export interface PageProgress {
  total: number;
  done: number;
  skipped: number;
  failed: number;
  running: boolean;
  /** Set when the run stopped early (e.g. out of credits). */
  stopped?: string;
}
export const pageProgress = signal<PageProgress | null>(null);

/** "Show my try-ons" just turned on: loading, then how many photos on this page show the customer (null = hidden). */
export interface TryonStatus {
  loading: boolean;
  count: number;
}
export const tryonStatus = signal<TryonStatus | null>(null);

/** Which tab of the panel is open: the list of try-ons, or the Cabin (the dressing room). */
export const panelTab = signal<'tryons' | 'cabin'>('tryons');
/** Every converted photo of the active profile, newest first (null: not loaded yet). */
export const tryons = signal<TryonItem[] | null>(null);
/** Where the person stands in their photo (the drop zones are laid over it). */
export const figure = signal<ProfileFigure | null>(null);
/** The pieces dropped on the figure, per zone. */
export const outfitSlots = signal<Partial<Record<OutfitSlot, TryonItem>>>({});
/** "Imagine Outfit": running (since when), or how it ended. Survives closing the panel. */
export interface OutfitRun {
  running: boolean;
  startedAt: number;
  error?: string;
}
export const outfitRun = signal<OutfitRun | null>(null);
/** The Cabin's centre: dressing the figure, the saved outfits, or one outfit (just made or saved). */
export const roomView = signal<'dress' | 'saved' | 'outfit'>('dress');
export const shownOutfit = signal<Outfit | null>(null);
/** Saved outfits of the active profile (null: not loaded yet). */
export const outfits = signal<Outfit[] | null>(null);
