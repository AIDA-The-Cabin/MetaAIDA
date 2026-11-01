import { signal } from '@preact/signals';

export type Lang = 'en' | 'ro';

export const lang = signal<Lang>('en');

export const strings = {
  en: {
    brand: 'The Cabin',
    tabWord: 'Cabin',
    panelSub: 'Your virtual try-on',
    empty: 'Your Cabin is empty. Tap “Try it on” on any product to see yourself wearing it.',
    onYou: 'on you',
    button: 'Try it on',
    generating: 'Generating…',
    inCabin: 'In your Cabin',
    tryAgain: 'Try again',
    remove: 'Remove',
    tryingAs: 'Trying on as',
    profile: 'Profile',
    manage: 'Manage profiles ↗',
    addPhoto: 'Add a photo ↗',
  },
  ro: {
    brand: 'Cabina',
    tabWord: 'Cabina',
    panelSub: 'Proba ta virtuală',
    empty: 'Cabina ta e goală. Apasă „Probează în Cabină” la orice produs ca să te vezi purtându-l.',
    onYou: 'pe tine',
    button: 'Probează în Cabină',
    generating: 'Se generează…',
    inCabin: 'În Cabină',
    tryAgain: 'Încearcă din nou',
    remove: 'Scoate',
    tryingAs: 'Probezi ca',
    profile: 'Profil',
    manage: 'Gestionează profilurile ↗',
    addPhoto: 'Adaugă o poză ↗',
  },
} as const;

export function t() {
  return strings[lang.value];
}

/** A profile's display name — its own name, or "Profile 2" when it has none. */
export function profileLabel(name: string | undefined, index: number): string {
  return name?.trim() || `${t().profile} ${index + 1}`;
}
