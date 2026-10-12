const MAX_LENGTH = 2048;
// Decoding rounds before giving up; deeper nesting than this is rejected outright.
const MAX_DECODE_ROUNDS = 3;
const SENTINEL_ORIGIN = 'https://callback.invalid';

// Control characters (WHATWG URL parsing strips tab/LF/CR, so "/\t/evil" becomes "//evil").
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching control chars is the point
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

function looksLikeOtherOrigin(path: string): boolean {
  return (
    !path.startsWith('/') ||
    path.startsWith('//') ||
    path.includes('\\') ||
    CONTROL_CHARS.test(path)
  );
}

/**
 * True only for a same-origin relative path such as `/ru/dashboard?x=1`.
 * Rejects protocol-relative (`//evil`), backslash (`/\evil`), schemes
 * (`javascript:`), control characters and percent-encoded variants of all of
 * those (`/%2F%2Fevil`, `/%5Cevil`), and anything that resolves to another origin.
 */
export function isSafeCallbackPath(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_LENGTH) return false;

  let current = value;
  for (let round = 0; ; round++) {
    if (looksLikeOtherOrigin(current)) return false;
    let decoded: string;
    try {
      decoded = decodeURIComponent(current);
    } catch {
      return false;
    }
    if (decoded === current) break;
    if (round >= MAX_DECODE_ROUNDS) return false;
    current = decoded;
  }

  try {
    return new URL(value, SENTINEL_ORIGIN).origin === SENTINEL_ORIGIN;
  } catch {
    return false;
  }
}
