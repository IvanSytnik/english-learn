/**
 * Pure helpers for showing grammar theory (B3.2): the ConceptSheet and the
 * exercise player's intro card both render `ConceptTheoryView`.
 */

export type Segment = { text: string; focus: boolean };

const isLetter = (c: string | undefined) => c !== undefined && /\p{L}/u.test(c);

/**
 * Index of `needle` in `text` from `from`, as a whole word wherever it starts
 * or ends with a letter ("had" is not the one in "shadow"); -1 if absent.
 */
function wordIndex(text: string, needle: string, from: number): number {
  for (let i = text.indexOf(needle, from); i !== -1; i = text.indexOf(needle, i + 1)) {
    const end = i + needle.length;
    const startOk = !isLetter(needle[0]) || !isLetter(text[i - 1]);
    const endOk = !isLetter(needle.at(-1)) || !isLetter(text[end]);
    if (startOk && endOk) return i;
  }
  return -1;
}

/**
 * Split an example into plain and emphasised runs: each `focus` substring is
 * marked at its first whole-word occurrence. Overlapping or missing focuses
 * are skipped, so the text always comes back whole.
 */
export function focusSegments(text: string, focus: readonly string[]): Segment[] {
  const ranges = focus
    .filter((f) => f.length > 0)
    .map((f) => {
      const start = wordIndex(text, f, 0);
      return { start, end: start + f.length };
    })
    .filter((r) => r.start >= 0)
    .sort((a, b) => a.start - b.start);

  const out: Segment[] = [];
  let at = 0;
  for (const r of ranges) {
    if (r.start < at) continue;
    if (r.start > at) out.push({ text: text.slice(at, r.start), focus: false });
    out.push({ text: text.slice(r.start, r.end), focus: true });
    at = r.end;
  }
  if (at < text.length) out.push({ text: text.slice(at), focus: false });
  return out;
}
