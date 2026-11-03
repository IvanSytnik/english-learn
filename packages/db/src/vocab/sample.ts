import { countWholeWord } from '../schemas/lexeme';

/**
 * The vocabulary spot check (B2.4): a reproducible random sample of lexemes
 * and a plain-text rendering a reviewer can read in a terminal. Pure — the
 * script does the reading.
 */

export type SampleLexeme = {
  id: string;
  lemma: string;
  pos: string;
  sense: string;
  cefrLevel: string;
  status: string;
  definitions: unknown;
  translations: unknown;
  examples: unknown;
};

/** FNV-1a, 32 bit: a stable order for a given seed, unlike Math.random. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** `count` rows in a seed-determined order: the same seed gives the same sample. */
export function pickSample<T extends { id: string }>(
  rows: readonly T[],
  count: number,
  seed: string,
): T[] {
  return [...rows]
    .map((row) => ({ row, rank: hash(`${seed}:${row.id}`) }))
    .sort((a, b) => a.rank - b.rank || a.row.id.localeCompare(b.row.id))
    .slice(0, count)
    .map(({ row }) => row);
}

/** murmur3 fmix32: FNV-1a alone is not uniform enough for u^(1/w) on short similar ids. */
function mix(h: number): number {
  let x = h;
  x ^= x >>> 16;
  x = Math.imul(x, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return x >>> 0;
}

/**
 * The examples review sample (B6.4a, `vocab:sample --examples`): `perLevel`
 * rows of every CEFR level, seed-determined, with weighted sampling without
 * replacement (Efraimidis–Spirakis: the largest `u^(1/w)` win) so a row of
 * weight 2 — a secondary sense — is drawn about twice as often as a primary.
 */
export function pickWeightedPerLevel<T extends { id: string; cefrLevel: string }>(
  rows: readonly T[],
  options: { perLevel: number; seed: string; weight: (row: T) => number },
): T[] {
  const byLevel = new Map<string, { row: T; key: number }[]>();
  for (const row of rows) {
    const u = (mix(hash(`${options.seed}:${row.id}`)) + 1) / 2 ** 32;
    const list = byLevel.get(row.cefrLevel) ?? [];
    list.push({ row, key: u ** (1 / options.weight(row)) });
    byLevel.set(row.cefrLevel, list);
  }
  return [...byLevel.keys()].sort().flatMap((level) =>
    (byLevel.get(level) ?? [])
      .sort((a, b) => b.key - a.key || a.row.id.localeCompare(b.row.id))
      .slice(0, options.perLevel)
      .map(({ row }) => row),
  );
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The sentence with the cloze target marked: `[ran]`, or inverse video when `color`. */
export function highlightCloze(sentence: string, target: string, color = false): string {
  if (countWholeWord(sentence, target) !== 1) return `${sentence}  (! clozeTarget "${target}")`;
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(target)}(?![\\p{L}\\p{N}])`, 'iu');
  return sentence.replace(pattern, (m) => (color ? `\u001b[7m${m}\u001b[27m` : `[${m}]`));
}

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const text = (value: unknown) => (typeof value === 'string' && value ? value : '—');

export function formatLexemeSample(
  lexeme: SampleLexeme,
  options: { color?: boolean; newFrom?: number } = {},
): string {
  const sense = lexeme.sense ? ` (${lexeme.sense})` : '';
  const t = record(lexeme.translations);
  const lines = [
    `${lexeme.lemma}${sense} · ${lexeme.pos} · ${lexeme.cefrLevel} · ${lexeme.status}`,
    `  en  ${text(record(lexeme.definitions).en)}`,
    `  ru  ${text(t.ru)}  |  uk  ${text(t.uk)}  |  de  ${text(t.de)}`,
  ];
  const examples = Array.isArray(lexeme.examples) ? lexeme.examples : [];
  for (const [i, ex] of examples.map(record).entries()) {
    const tag = options.newFrom !== undefined && i >= options.newFrom ? 'ex+' : 'ex ';
    lines.push(
      `  ${tag} ${highlightCloze(text(ex.sentence), text(ex.clozeTarget), options.color)}`,
    );
    const tr = record(ex.translation);
    lines.push(`      ru ${text(tr.ru)}  |  uk ${text(tr.uk)}  |  de ${text(tr.de)}`);
  }
  if (examples.length === 0) lines.push('  ex  —');
  lines.push(`  id  ${lexeme.id}`);
  return lines.join('\n');
}
