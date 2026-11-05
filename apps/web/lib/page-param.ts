/**
 * `?page=` as a 1-based page number: absent → 1; anything else but a plain
 * positive integer (repeated, `0`, `01`, `2.5`, `-1`) → null (404). Shared by
 * the word pages (B6.6) and a word list's pages (B6.7).
 */
export function pageParam(value: string | string[] | undefined): number | null {
  if (value === undefined) return 1;
  if (typeof value !== 'string' || !/^[1-9]\d{0,3}$/.test(value)) return null;
  return Number(value);
}
