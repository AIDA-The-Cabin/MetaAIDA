import { signal } from '@preact/signals';
import type { CabinItem, ProfileSummary } from '@aida/shared';

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
