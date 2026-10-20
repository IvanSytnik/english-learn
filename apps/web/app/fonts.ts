import { JetBrains_Mono, Literata, Onest } from 'next/font/google';

/**
 * The three font roles (HANDOFF §7, 2026-10-19). Each exposes a CSS variable
 * that packages/ui/src/tokens.css maps onto Tailwind's font-content /
 * font-sans / font-mono. The `cyrillic` subset covers Russian and Ukrainian
 * (incl. ґ ї є, U+0490–0491 / U+0454 / U+0457); `latin` covers German umlauts.
 */

/** English learning content (`lang="en"`) and editorial headings. */
export const literata = Literata({
  subsets: ['latin', 'cyrillic'],
  axes: ['opsz'],
  display: 'swap',
  variable: '--font-literata',
});

/** UI chrome. */
export const onest = Onest({
  subsets: ['latin', 'cyrillic'],
  display: 'swap',
  variable: '--font-onest',
});

/** Keyboard hints and tabular counts. */
export const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin', 'cyrillic'],
  display: 'swap',
  variable: '--font-jetbrains',
});

export const fontVariables = `${literata.variable} ${onest.variable} ${jetbrainsMono.variable}`;
