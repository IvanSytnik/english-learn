import type { KeyLike } from '@/lib/keyboard';

/**
 * A key press as a US-layout keyboard reports it — `key` and the physical
 * `code` together, as a real KeyboardEvent carries them. Shortcuts match on
 * `code`, so a test event without one would test nothing real.
 */
export function us(key: string): KeyLike {
  if (/^[0-9]$/.test(key)) return { key, code: `Digit${key}` };
  if (/^[a-z]$/i.test(key)) {
    return { key, code: `Key${key.toUpperCase()}`, shiftKey: key !== key.toLowerCase() };
  }
  if (key === '?') return { key, code: 'Slash', shiftKey: true };
  if (key === ' ') return { key, code: 'Space' };
  return { key, code: key };
}

/** The same physical key on the Russian ЙЦУКЕН layout (`KeyK` types `л`). */
const RU: Record<string, string> = { KeyK: 'л', KeyH: 'р', KeyA: 'ф', Slash: '.' };
/** …and on the Ukrainian one (same letters here as Russian). */
const UK: Record<string, string> = { KeyK: 'л', KeyH: 'р', KeyA: 'ф', Slash: '.' };

export function ru(code: string, shiftKey = false): KeyLike {
  return { key: RU[code] ?? code, code, shiftKey };
}

export function uk(code: string, shiftKey = false): KeyLike {
  return { key: UK[code] ?? code, code, shiftKey };
}
