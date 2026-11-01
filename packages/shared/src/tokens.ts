// AIDA / "The Cabin" — luxury design tokens (cool near-black + metallic champagne gold).
// Shared by the widget (Shadow DOM), the SDK, and the web app so every surface is pixel-identical.

export const tokens = {
  bg: { base: '#0B0C0E', surface: '#131519', elevated: '#1B1E24', inset: '#08090A' },
  border: { base: '#2A2E35', gold: 'rgba(201,162,75,0.35)' },
  gold: { g900: '#6E551C', g700: '#9C7A2E', g500: '#C9A24B', g300: '#E7C977', g100: '#F8ECC6' },
  text: { hi: '#F4F2ED', mid: '#B9BBC0', low: '#7E828B' },
  effect: {
    shine: 'linear-gradient(135deg,#9C7A2E 0%,#E7C977 25%,#F8ECC6 50%,#E7C977 75%,#9C7A2E 100%)',
    goldButton: 'linear-gradient(180deg,#E7C977,#C9A24B)',
    goldGlow: '0 0 24px rgba(201,162,75,0.25)',
    ease: 'cubic-bezier(0.22,1,0.36,1)',
  },
  font: {
    serif: "'Cormorant Garamond','Playfair Display',Georgia,serif",
    sans: "Inter,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif",
  },
} as const;

/** CSS custom properties (`--cabin-*`) for injection into a shadow root or `:root`. */
export const cssVariables: string = [
  `--cabin-bg-base:${tokens.bg.base}`,
  `--cabin-bg-surface:${tokens.bg.surface}`,
  `--cabin-bg-elevated:${tokens.bg.elevated}`,
  `--cabin-bg-inset:${tokens.bg.inset}`,
  `--cabin-border:${tokens.border.base}`,
  `--cabin-border-gold:${tokens.border.gold}`,
  `--cabin-gold-900:${tokens.gold.g900}`,
  `--cabin-gold-700:${tokens.gold.g700}`,
  `--cabin-gold-500:${tokens.gold.g500}`,
  `--cabin-gold-300:${tokens.gold.g300}`,
  `--cabin-gold-100:${tokens.gold.g100}`,
  `--cabin-text-hi:${tokens.text.hi}`,
  `--cabin-text-mid:${tokens.text.mid}`,
  `--cabin-text-low:${tokens.text.low}`,
  `--cabin-shine:${tokens.effect.shine}`,
  `--cabin-gold-button:${tokens.effect.goldButton}`,
  `--cabin-gold-glow:${tokens.effect.goldGlow}`,
  `--cabin-ease:${tokens.effect.ease}`,
  `--cabin-font-serif:${tokens.font.serif}`,
  `--cabin-font-sans:${tokens.font.sans}`,
].join(';') + ';';

/** Wrap the variables in a selector block (default `:host` for shadow roots). */
export function tokensToCss(selector = ':host'): string {
  return `${selector}{${cssVariables}}`;
}
