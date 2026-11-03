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
    pageConverting: 'Converting this page',
    pageDone: 'Page converted',
    photos: 'photos',
    skipped: 'skipped',
    failed: 'failed',
    outOfCredits: 'Out of credits',
    close: 'Close',
    showingTryons: 'Showing your try-ons…',
    photoOnYou: 'photo on you',
    photosOnYou: 'photos on you',
    noTryonsHere: 'No try-ons for this page yet',
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
    pageConverting: 'Convertesc pagina',
    pageDone: 'Pagină convertită',
    photos: 'poze',
    skipped: 'sărite',
    failed: 'eșuate',
    outOfCredits: 'Credite epuizate',
    close: 'Închide',
    showingTryons: 'Îți arăt probele…',
    photoOnYou: 'poză cu tine',
    photosOnYou: 'poze cu tine',
    noTryonsHere: 'Încă nicio probă pe pagina asta',
  },
} as const;

export function t() {
  return strings[lang.value];
}

/** A profile's display name — its own name, or "Profile 2" when it has none. */
export function profileLabel(name: string | undefined, index: number): string {
  return name?.trim() || `${t().profile} ${index + 1}`;
}
