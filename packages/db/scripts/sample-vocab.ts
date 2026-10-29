// packages/db/scripts/sample-vocab.ts
//
// Read-only spot check of localized vocabulary: a reproducible random sample
// printed with its definition, glosses and cloze examples (the target in
// brackets). Runs inside a READ ONLY transaction.
//
// Usage (from packages/db; DATABASE_URL from .env):
//   pnpm vocab:sample                                  # 20 REVIEW lexemes
//   pnpm vocab:sample --level A1 --topic food_drink --status REVIEW --count 30 --seed 2026-10-29

import { parseArgs } from 'node:util';
import { z } from 'zod';
import { createPrismaClient } from '../src/create-client';
import { CefrLevelValue } from '../src/schemas/learner-events';
import { ContentStatusSchema } from '../src/schemas/lexeme';
import { lexemeIdentity, loadCefrJDataset, topicIndex } from '../src/vocab/dataset';
import { formatLexemeSample, pickSample } from '../src/vocab/sample';
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
});

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      level: { type: 'string' },
      topic: { type: 'string' },
      status: { type: 'string' },
      count: { type: 'string' },
      seed: { type: 'string' },
    },
  });
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
