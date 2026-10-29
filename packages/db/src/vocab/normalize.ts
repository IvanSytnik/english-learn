import { z } from 'zod';
import type { CefrLevelValue } from '../schemas/learner-events';
import {
  CefrJLevelSchema,
  type CefrJLevelValue,
  cefrLevelOf,
  lexemeKey,
  type PartOfSpeechValue,
} from '../schemas/lexeme';
import { resolveVocabTopic, type VocabTopicId } from './topics';

/**
 * The CEFR-J Wordlist import, pure part: the dataset file's shape, lemma /
 * part-of-speech / level normalization and dedupe on the Lexeme unique key
 * `[lemmaKey, pos, sense]`. The database writes live in ./import.ts.
 */

/** One row of packages/db/data/cefr-j-v*.json, as committed. */
export const CefrJEntrySchema = z
  .object({
    lemma: z.string().min(1),
    /** Other spellings of the same headword (`behaviour` for `behavior`). */
    variants: z.array(z.string().min(1)).min(1).optional(),
    /** The source's own tag (`noun`, `modal auxiliary`, …), mapped by mapCefrJPos. */
    pos: z.string().min(1),
    /** Homonym discriminator, set by hand where [lemmaKey, pos] collide. */
    sense: z.string().trim().min(1).optional(),
    cefrJLevel: z.string().min(1),
    topic: z.string().min(1).optional(),
    topicSource: z.enum(['threshold', 'threshold-sibling', 'llm']).optional(),
  })
  .strict();
export type CefrJEntry = z.infer<typeof CefrJEntrySchema>;

export const CefrJDatasetSchema = z
  .object({
    source: z
      .object({
        name: z.string().min(1),
        version: z.string().min(1),
        citation: z.string().min(1),
        url: z.url(),
        terms: z.string().min(1),
        selection: z.string().min(1),
        topics: z.string().min(1),
      })
      .strict(),
    entries: z.array(CefrJEntrySchema).min(1),
  })
  .strict();
export type CefrJDataset = z.infer<typeof CefrJDatasetSchema>;

/** A lexeme ready to write: the Lexeme key and level columns plus its topic. */
export type NormalizedLexemeEntry = {
  lemma: string;
  lemmaKey: string;
  pos: PartOfSpeechValue;
  sense: string;
  cefrLevel: CefrLevelValue;
  cefrJLevel: CefrJLevelValue;
  topic: VocabTopicId;
  variants: string[];
};

/** Letters, digits, and the joiners the wordlist uses (`brand-new`, `a.m.`, `o'clock`). */
const LEMMA_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} .'-]*$/u;

/**
 * Display form and comparison key of a headword. Unicode NFC, every
 * whitespace run collapsed to one space and the ends trimmed — so the lemma
 * carries no whitespace that Postgres `btrim` (spaces only) would leave and JS
 * `trim` would strip, and `lemmaKey` equals the CHECK's `lower(btrim(lemma))`.
 */
export function normalizeLemma(raw: string): { lemma: string; lemmaKey: string } {
  const lemma = raw.normalize('NFC').replace(/\s+/gu, ' ').trim();
  if (!LEMMA_PATTERN.test(lemma)) throw new Error(`Invalid lemma: ${JSON.stringify(raw)}`);
  return { lemma, lemmaKey: lexemeKey(lemma) };
}

/**
 * CEFR-J Wordlist part-of-speech tags. `null` marks a closed class the import
 * leaves out — articles, determiners and auxiliaries are taught as grammar,
 * not as words.
 */
export const CEFR_J_POS = {
  noun: 'NOUN',
  verb: 'VERB',
  adjective: 'ADJECTIVE',
  adverb: 'ADVERB',
  pronoun: 'PRONOUN',
  preposition: 'PREPOSITION',
  conjunction: 'CONJUNCTION',
  interjection: 'INTERJECTION',
  number: 'OTHER',
  determiner: null,
  'modal auxiliary': null,
  'be-verb': null,
  'do-verb': null,
  'have-verb': null,
  'infinitive-to': null,
} as const satisfies Record<string, PartOfSpeechValue | null>;

/** The PartOfSpeech of a CEFR-J tag, or `null` for a class left out. Throws on an unknown tag. */
export function mapCefrJPos(rawPos: string): PartOfSpeechValue | null {
  const tag = rawPos.trim().toLowerCase();
  if (!Object.hasOwn(CEFR_J_POS, tag)) throw new Error(`Unknown CEFR-J part of speech: ${rawPos}`);
  return CEFR_J_POS[tag as keyof typeof CEFR_J_POS];
}

/** The CEFR level of a CEFR-J level (`A1.2` → A1, `B1` → B1). Throws on anything else (`B1.3`, `A3`). */
export function deriveCefrLevel(cefrJLevel: string): CefrLevelValue {
  const parsed = CefrJLevelSchema.safeParse(cefrJLevel);
  if (!parsed.success) throw new Error(`Invalid CEFR-J level: ${JSON.stringify(cefrJLevel)}`);
  return cefrLevelOf(parsed.data);
}

/** One dataset row, normalized; `null` when its part of speech is left out. */
export function normalizeEntry(entry: CefrJEntry): NormalizedLexemeEntry | null {
  const pos = mapCefrJPos(entry.pos);
  if (pos === null) return null;
  const { lemma, lemmaKey } = normalizeLemma(entry.lemma);
  const cefrLevel = deriveCefrLevel(entry.cefrJLevel);
  return {
    lemma,
    lemmaKey,
    pos,
    sense: entry.sense ?? '',
    cefrLevel,
    cefrJLevel: entry.cefrJLevel as CefrJLevelValue,
    topic: resolveVocabTopic(entry.topic),
    variants: (entry.variants ?? []).map((v) => normalizeLemma(v).lemma),
  };
}

/** Level order for folding duplicates: a whole level sorts before its sublevels. */
const levelRank = (level: CefrJLevelValue) => CefrJLevelSchema.options.indexOf(level);

const uniqueKey = (e: NormalizedLexemeEntry) => `${e.lemmaKey}\u0000${e.pos}\u0000${e.sense}`;

/**
 * One entry per Lexeme unique key `[lemmaKey, pos, sense]`, in first-seen
 * order. The same word listed twice (same display form) folds into the
 * lowest-level entry, with the variants merged. Two display forms on one key
 * (`March` / `march`) are two meanings: that throws until the data gives
 * them a `sense` — meanings are never merged silently.
 */
export function dedupeLexemes(entries: readonly NormalizedLexemeEntry[]): NormalizedLexemeEntry[] {
  const byKey = new Map<string, NormalizedLexemeEntry>();
  for (const entry of entries) {
    const key = uniqueKey(entry);
    const seen = byKey.get(key);
    if (!seen) {
      byKey.set(key, entry);
      continue;
    }
    if (seen.lemma !== entry.lemma) {
      throw new Error(
        `Homonym ${JSON.stringify(seen.lemma)} / ${JSON.stringify(entry.lemma)} (${entry.pos}) needs a sense`,
      );
    }
    const [low, high] =
      levelRank(entry.cefrJLevel) < levelRank(seen.cefrJLevel) ? [entry, seen] : [seen, entry];
    const variants = [...new Set([...low.variants, ...high.variants])].filter(
      (v) => v !== low.lemma,
    );
    byKey.set(key, { ...low, variants });
  }
  return [...byKey.values()];
}

/** The whole dataset: validated, normalized and deduped, with the rows left out by part of speech. */
export function normalizeDataset(raw: unknown): {
  source: CefrJDataset['source'];
  lexemes: NormalizedLexemeEntry[];
  skipped: { lemma: string; pos: string }[];
} {
  const dataset = CefrJDatasetSchema.parse(raw);
  const normalized: NormalizedLexemeEntry[] = [];
  const skipped: { lemma: string; pos: string }[] = [];
  for (const entry of dataset.entries) {
    const lexeme = normalizeEntry(entry);
    if (lexeme) normalized.push(lexeme);
    else skipped.push({ lemma: entry.lemma, pos: entry.pos });
  }
  return { source: dataset.source, lexemes: dedupeLexemes(normalized), skipped };
}
