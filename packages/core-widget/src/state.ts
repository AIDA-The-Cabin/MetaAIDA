import { signal } from '@preact/signals';
import type { CabinItem, ProfileSummary } from '@aida/shared';

export const panelOpen = signal(false);
export const cabinItems = signal<CabinItem[]>([]);
/** Everyone on the account, and who is trying clothes on right now. */
export const profiles = signal<ProfileSummary[]>([]);
export const activeProfileId = signal<string | null>(null);
