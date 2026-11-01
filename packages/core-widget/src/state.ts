import { signal } from '@preact/signals';
import type { CabinItem } from '@aida/shared';

export const panelOpen = signal(false);
export const cabinItems = signal<CabinItem[]>([]);
