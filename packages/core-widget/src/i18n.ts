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
  },
} as const;

export function t() {
  return strings[lang.value];
}
