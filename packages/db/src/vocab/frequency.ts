import { readFileSync } from 'node:fs';
import { z } from 'zod';
import type { PrismaClient } from '../generated/client/client';
import type { CefrLevelValue } from '../schemas/learner-events';
import type { PartOfSpeechValue } from '../schemas/lexeme';
import { lexemeIdentity } from './dataset';

/**
 * vocab:sync-frequency (B6.2): wordfreq Zipf frequency onto Lexeme.
 *
 * - `frequencyZipf` = the committed value for the lexeme's lemmaKey
 *   (packages/db/data/frequency-wordfreq-en.json, scripts/vocab-frequency.py);
 *   0 or missing → null. Written on every lexeme, whatever its status.
 * - `frequencyRank` = dense rank over the PUBLISHED lexemes with a frequency
 *   by the key `[closedClass ASC, secondarySense ASC, zipf DESC, lemmaKey
 *   ASC]` (B6.2a rank amendment): 1, 2, 3 … with no gaps. wordfreq counts a
 *   form, not a sense, so a rare sense of a frequent form (`go` noun B1) and
 *   function words (`to`, `of`, `not`) would otherwise lead the NEW tier.
 *   Content words come first, then the second senses of a form, then
 *   closed-class words (closed POS or FUNCTION_ADVERBS, B6.2b). Not
 *   PUBLISHED or no frequency → null.
 * - Idempotent: only rows whose values differ are written — one
 *   `UPDATE … FROM unnest(…)` statement per chunk (atomic on its own, one
 *   round trip: per-row updates in a transaction over the Neon pooler ran
 *   past Prisma's 5 s transaction timeout, pitfall 190).
 */

export const FrequencyDatasetSchema = z
  .object({
    source: z
      .object({
        name: z.literal('wordfreq'),
        version: z.string().min(1),
        licence: z.literal('CC BY-SA 4.0'),
        attribution: z.string().min(1),
      })
      .strict(),
    entries: z.record(z.string().min(1), z.number().min(0).max(8)),
  })
  .strict();
export type FrequencyDataset = z.infer<typeof FrequencyDatasetSchema>;

export const FREQUENCY_DATASET_URL = new URL(
  '../../data/frequency-wordfreq-en.json',
  import.meta.url,
);

export function loadFrequencyDataset(): FrequencyDataset {
  return FrequencyDatasetSchema.parse(
    JSON.parse(readFileSync(FREQUENCY_DATASET_URL, 'utf8')) as unknown,
  );
}

/**
 * Closed-class parts of speech: ranked after every content word. The
 * catalogue tags numbers and determiners `OTHER`. Interjections (`please`,
 * `thanks`, `hello`) are content for a learner — they are not here.
 */
export const CLOSED_CLASS_POS: ReadonlySet<PartOfSpeechValue> = new Set<PartOfSpeechValue>([
  'PREPOSITION',
  'CONJUNCTION',
  'PRONOUN',
  'OTHER',
]);

/**
 * Function adverbs (B6.2b), ranked with the closed classes when tagged
 * ADVERB. Criterion: a grammatical or discourse adverb with no translatable
 * content meaning of its own — negation, degree, focus, deictic time/place
 * pro-forms, wh-adverbs, connectives and the adverbial particles of phrasal
 * verbs. Content adverbs (`always`, `often`, `well`, `really`, `today`,
 * `together`) are not here. A closed list by lemmaKey; the CEFR-J catalogue
 * tags all of these `adverb`.
 */
export const FUNCTION_ADVERBS: ReadonlySet<string> = new Set([
  // negation
  'not',
  'no',
  // degree
  'very',
  'so',
  'too',
  'quite',
  'rather',
  'much',
  'more',
  'most',
  'less',
  'least',
  // focus
  'just',
  'only',
  'even',
  'also',
  'either',
  'else',
  // deictic and aspectual time / place pro-forms
  'now',
  'then',
  'here',
  'there',
  'still',
  'already',
  'yet',
  'ever',
  // wh-adverbs
  'how',
  'when',
  'where',
  'why',
  // connectives
  'however',
  'instead',
  // adverbial particles (phrasal verbs)
  'in',
  'on',
  'up',
  'out',
  'off',
  'down',
  'over',
  'about',
]);

/** Closed class in the rank key: a closed POS, or a function adverb. */
export const isClosedClass = (r: { pos: PartOfSpeechValue; lemmaKey: string }): boolean =>
  CLOSED_CLASS_POS.has(r.pos) || (r.pos === 'ADVERB' && FUNCTION_ADVERBS.has(r.lemmaKey));

const CEFR_ORDER: readonly CefrLevelValue[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export type FrequencyRow = {
  id: string;
  lemmaKey: string;
  pos: PartOfSpeechValue;
  sense: string;
  cefrLevel: CefrLevelValue;
  status: string;
  frequencyZipf: number | null;
  frequencyRank: number | null;
};

export type FrequencyValues = {
  id: string;
  frequencyZipf: number | null;
  frequencyRank: number | null;
};

/**
 * The identities of the dataset entries flagged `shadowedByExcludedPos`
 * (./shadowed.ts) — the second input of the secondary-sense rule.
 */
export function shadowedIdentities(
  lexemes: readonly {
    lemmaKey: string;
    pos: string;
    sense: string;
    shadowedByExcludedPos?: true;
  }[],
): Set<string> {
  return new Set(lexemes.filter((l) => l.shadowedByExcludedPos).map(lexemeIdentity));
}

/**
 * Entries the secondary-sense rule gets wrong, made primary by name (V2-10,
 * Ivan's review of the 58 shadowed entries, 2026-11-05): data with a reason
 * each, never a heuristic. Applied after the shadowed flag — an entry listed
 * here is primary whatever (a) and (b) say.
 */
export const SECONDARY_SENSE_OVERRIDES: readonly {
  readonly lemmaKey: string;
  readonly pos: PartOfSpeechValue;
  readonly sense: string;
  readonly reason: string;
}[] = Object.freeze([
  {
    lemmaKey: 'need',
    pos: 'VERB',
    sense: '',
    reason:
      'Shadowed by the modal `need` (`need not`), which is rare in modern English; the main verb (`I need help`) carries the form.',
  },
  {
    lemmaKey: 'little',
    pos: 'ADJECTIVE',
    sense: '',
    reason:
      'Shadowed by the determiner (`a little milk`), but the adjective (`a little house`) is a core A1 sense of the form, not a second one.',
  },
]);

const OVERRIDDEN_PRIMARY: ReadonlySet<string> = new Set(
  SECONDARY_SENSE_OVERRIDES.map(lexemeIdentity),
);

/**
 * The secondary senses among the PUBLISHED rows (B6-SPEC §2, revised in
 * B6.2b). A row is secondary when
 * (a) another PUBLISHED row of its lemmaKey has a strictly lower CEFR level
 *     — equal levels are both primary (`wash` noun A1 and verb A1); or
 * (b) its identity is in `shadowed`: the source lists the headword under a
 *     left-out POS, so the form's frequency belongs to an entry the catalogue
 *     doesn't have (`can` noun, `being` noun);
 * and it is not in SECONDARY_SENSE_OVERRIDES (`need` verb, `little` adjective).
 * Only PUBLISHED rows are compared (a DRAFT/REVIEW neighbour changes nothing).
 */
export function secondarySenseIds(
  rows: readonly FrequencyRow[],
  shadowed: ReadonlySet<string> = new Set(),
): Set<string> {
  const published = rows.filter((r) => r.status === 'PUBLISHED');
  const lowest = new Map<string, number>();
  for (const r of published) {
    const level = CEFR_ORDER.indexOf(r.cefrLevel);
    lowest.set(r.lemmaKey, Math.min(level, lowest.get(r.lemmaKey) ?? level));
  }
  return new Set(
    published
      .filter(
        (r) =>
          (CEFR_ORDER.indexOf(r.cefrLevel) > (lowest.get(r.lemmaKey) as number) ||
            shadowed.has(lexemeIdentity(r))) &&
          !OVERRIDDEN_PRIMARY.has(lexemeIdentity(r)),
      )
      .map((r) => r.id),
  );
}

/** Target values for every row, pure. */
export function planFrequency(
  rows: readonly FrequencyRow[],
  zipfByKey: Readonly<Record<string, number>>,
  shadowed: ReadonlySet<string> = new Set(),
): FrequencyValues[] {
  const zipfOf = (lemmaKey: string): number | null => {
    const z = Object.hasOwn(zipfByKey, lemmaKey) ? zipfByKey[lemmaKey] : undefined;
    return z === undefined || z <= 0 ? null : z;
  };
  const secondary = secondarySenseIds(rows, shadowed);
  type Key = readonly [closed: number, secondary: number, zipf: number, lemmaKey: string];
  const keyOf = (r: FrequencyRow): Key => [
    isClosedClass(r) ? 1 : 0,
    secondary.has(r.id) ? 1 : 0,
    zipfOf(r.lemmaKey) as number,
    r.lemmaKey,
  ];
  const id = (k: Key) => k.join('\u0000');
  const keys = [
    ...new Map(
      rows
        .filter((r) => r.status === 'PUBLISHED' && zipfOf(r.lemmaKey) !== null)
        .map((r) => {
          const k = keyOf(r);
          return [id(k), k] as const;
        }),
    ).values(),
  ].sort(
    (a, b) => a[0] - b[0] || a[1] - b[1] || b[2] - a[2] || (a[3] < b[3] ? -1 : a[3] > b[3] ? 1 : 0),
  );
  const rankOf = new Map(keys.map((k, i) => [id(k), i + 1]));
  return rows.map((r) => {
    const frequencyZipf = zipfOf(r.lemmaKey);
    return {
      id: r.id,
      frequencyZipf,
      frequencyRank:
        r.status === 'PUBLISHED' && frequencyZipf !== null
          ? (rankOf.get(id(keyOf(r))) ?? null)
          : null,
    };
  });
}

export const FREQUENCY_CHUNK_SIZE = 1000;

export type SyncFrequencyReport = {
  lexemes: number;
  withFrequency: number;
  ranked: number;
  /** Rows whose values differ (written unless dry run). */
  changed: number;
  chunks: number;
};

export async function syncFrequency(
  db: Pick<PrismaClient, 'lexeme' | '$executeRaw'>,
  dataset: FrequencyDataset,
  options: {
    dryRun?: boolean;
    lemmaKeyPrefix?: string;
    chunkSize?: number;
    /** shadowedIdentities() of the committed CEFR-J dataset. */
    shadowed?: ReadonlySet<string>;
  } = {},
): Promise<SyncFrequencyReport> {
  const rows = await db.lexeme.findMany({
    where: options.lemmaKeyPrefix ? { lemmaKey: { startsWith: options.lemmaKeyPrefix } } : {},
    select: {
      id: true,
      lemmaKey: true,
      pos: true,
      sense: true,
      cefrLevel: true,
      status: true,
      frequencyZipf: true,
      frequencyRank: true,
    },
    orderBy: { id: 'asc' },
  });
  const plan = planFrequency(rows, dataset.entries, options.shadowed);
  const before = new Map(rows.map((r) => [r.id, r]));
  const changed = plan.filter((p) => {
    const r = before.get(p.id);
    return r?.frequencyZipf !== p.frequencyZipf || r?.frequencyRank !== p.frequencyRank;
  });
  const report: SyncFrequencyReport = {
    lexemes: rows.length,
    withFrequency: plan.filter((p) => p.frequencyZipf !== null).length,
    ranked: plan.filter((p) => p.frequencyRank !== null).length,
    changed: changed.length,
    chunks: 0,
  };
  if (options.dryRun) return report;
  const size = options.chunkSize ?? FREQUENCY_CHUNK_SIZE;
  for (let i = 0; i < changed.length; i += size) {
    const chunk = changed.slice(i, i + size);
    await db.$executeRaw`
      UPDATE "public"."Lexeme" AS l
      SET "frequencyZipf" = v.zipf, "frequencyRank" = v.rank
      FROM unnest(
        ${chunk.map((c) => c.id)}::text[],
        ${chunk.map((c) => c.frequencyZipf)}::double precision[],
        ${chunk.map((c) => c.frequencyRank)}::integer[]
      ) AS v(id, zipf, rank)
      WHERE l."id" = v.id`;
    report.chunks += 1;
  }
  return report;
}
