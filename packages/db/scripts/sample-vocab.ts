// packages/db/scripts/sample-vocab.ts
//
// Read-only spot check of localized vocabulary: a reproducible random sample
// printed with its definition, glosses and cloze examples (the target in
// brackets). Runs inside a READ ONLY transaction.
//
// Usage (from packages/db; DATABASE_URL from .env):
//   pnpm vocab:sample                                  # 20 REVIEW lexemes
//   pnpm vocab:sample --level A1 --topic food_drink --status REVIEW --count 30 --seed 2026-10-29
//   pnpm vocab:sample --examples [--count 20] [--seed b6.4a]
//     Offline (no database): the B6.4a examples review — `count` words per
//     level from the committed localization + examples snapshots, secondary
//     senses drawn ×2; examples[0] as `ex`, the generated ones as `ex+`.

import { parseArgs } from 'node:util';
import { z } from 'zod';
import { createPrismaClient } from '../src/create-client';
import { CefrLevelValue } from '../src/schemas/learner-events';
import { ContentStatusSchema } from '../src/schemas/lexeme';
import { lexemeIdentity, loadCefrJDataset, topicIndex } from '../src/vocab/dataset';
import { loadExamplesSnapshot } from '../src/vocab/examples-snapshot';
import { secondarySenseIds, shadowedIdentities } from '../src/vocab/frequency';
import { loadLocalizationSnapshot } from '../src/vocab/localization-snapshot';
import { formatLexemeSample, pickSample, pickWeightedPerLevel } from '../src/vocab/sample';
import { VOCAB_TOPIC_IDS } from '../src/vocab/topics';

const ArgsSchema = z.object({
  level: CefrLevelValue.optional(),
  topic: z.enum(VOCAB_TOPIC_IDS).optional(),
  status: ContentStatusSchema.default('REVIEW'),
  count: z.coerce.number().int().min(1).max(500).default(20),
  seed: z
    .string()
    .min(1)
    .default(() => String(Date.now())),
  examples: z.boolean().default(false),
});

/** The examples review, offline and deterministic (default seed `b6.4a`). */
function sampleExamples(count: number, seed: string): void {
  const lexemes = loadCefrJDataset().lexemes;
  const dataset = new Map(lexemes.map((l) => [lexemeIdentity(l), l]));
  const generated = new Map(loadExamplesSnapshot().entries.map((e) => [lexemeIdentity(e), e]));
  const rows = loadLocalizationSnapshot().entries.map((e) => {
    const id = lexemeIdentity(e);
    const entry = dataset.get(id);
    if (!entry) throw new Error(`${e.lemmaKey} ${e.pos} is not in the dataset`);
    return { ...e, id, pos: entry.pos, lemma: entry.lemma, status: 'PUBLISHED' };
  });
  const secondarySenses = secondarySenseIds(
    rows.map((r) => ({ ...r, frequencyZipf: null, frequencyRank: null })),
    shadowedIdentities(lexemes),
  );
  const primary = { has: (id: string) => !secondarySenses.has(id) };
  const withNew = rows.filter((r) => generated.has(r.id));
  const sample = pickWeightedPerLevel(withNew, {
    perLevel: count,
    seed,
    weight: (r) => (primary.has(r.id) ? 1 : 2),
  });
  const secondary = sample.filter((r) => !primary.has(r.id)).length;
  console.log(
    `examples snapshot · ${generated.size} of ${rows.length} lexemes have new examples · ` +
      `${sample.length} shown (${count} per level, ${secondary} secondary senses) · seed ${seed}\n`,
  );
  const color = process.stdout.isTTY;
  console.log(
    sample
      .map((r) =>
        formatLexemeSample(
          {
            ...r,
            id: r.id.replaceAll('\u0000', ' ').trim(),
            status: primary.has(r.id) ? 'primary' : 'secondary sense',
            examples: [...r.examples, ...(generated.get(r.id)?.examples ?? [])],
          },
          { color, newFrom: r.examples.length },
        ),
      )
      .join('\n\n'),
  );
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      level: { type: 'string' },
      topic: { type: 'string' },
      status: { type: 'string' },
      count: { type: 'string' },
      seed: { type: 'string' },
      examples: { type: 'boolean' },
    },
  });
  if (values.examples) {
    const args = ArgsSchema.parse({ seed: 'b6.4a', ...values });
    sampleExamples(args.count, args.seed);
    return;
  }
  const args = ArgsSchema.parse(values);

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const db = createPrismaClient(url, { log: ['error'] });
  try {
    const rows = await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      return tx.lexeme.findMany({
        where: { status: args.status, ...(args.level ? { cefrLevel: args.level } : {}) },
        select: {
          id: true,
          lemma: true,
          lemmaKey: true,
          pos: true,
          sense: true,
          cefrLevel: true,
          status: true,
          definitions: true,
          translations: true,
          examples: true,
        },
      });
    });
    const topics = topicIndex(loadCefrJDataset().lexemes);
    const matching = args.topic
      ? rows.filter((r) => topics.get(lexemeIdentity(r)) === args.topic)
      : rows;
    const sample = pickSample(matching, args.count, args.seed);

    const color = process.stdout.isTTY;
    console.log(
      `${new URL(url).hostname} · ${args.status} · ${matching.length} matching · ` +
        `${sample.length} shown · seed ${args.seed}\n`,
    );
    console.log(sample.map((l) => formatLexemeSample(l, { color })).join('\n\n'));
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
