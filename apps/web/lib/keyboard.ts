/**
 * Layout-independent shortcut keys for the players.
 *
 * Letter and digit shortcuts are matched by the physical key
 * (`KeyboardEvent.code`), never by the character it types (`key`): on a
 * Russian or Ukrainian layout the K key types `л`, on AZERTY the 1 key types
 * `&`, and a shortcut matched by `key` silently does nothing for those
 * learners. Enter and Escape are the same on every layout and stay on `key`.
 */

export type KeyLike = {
  key: string;
  /** Physical key (`KeyK`, `Digit1`, `Numpad1`); empty when the platform does not report one. */
  code: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
};

/** A modifier chord: the browser's or the OS's, never a player shortcut. */
export const isChord = (event: KeyLike) =>
  event.altKey === true || event.ctrlKey === true || event.metaKey === true;

/** The digit of a digit key (top row or numpad), or null. */
export function digitOf(event: KeyLike): number | null {
  const m = /^(?:Digit|Numpad)([0-9])$/.exec(event.code);
  return m ? Number(m[1]) : null;
}

/** Whether the physical key is the letter `letter` (`'K'` ⇔ `KeyK`), whatever it types. */
export const isLetter = (event: KeyLike, letter: string) =>
  event.code === `Key${letter.toUpperCase()}`;

/**
 * `?`: the character on layouts that have it on another key (German
 * Shift+ß, Russian Shift+7), or Shift + the US slash key on any layout.
 */
export const isQuestionMark = (event: KeyLike) =>
  event.key === '?' || (event.code === 'Slash' && event.shiftKey === true);
