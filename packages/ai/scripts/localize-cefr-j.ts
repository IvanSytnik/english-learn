// packages/ai/scripts/localize-cefr-j.ts
//
// Glosses DRAFT CEFR-J lexemes with Claude (English definition, ru/uk/de
// translations, cloze examples, collocations) and moves every validated one
// to REVIEW — never PUBLISHED. Resumable: it only picks lexemes that are still
// DRAFT with no translations, so re-running finishes an interrupted run and
// retries the rejected words. Rejections are appended to
// packages/ai/.localize/dead-letter.jsonl (not in git).
//
// Usage (from packages/ai; DATABASE_URL from packages/db/.env):
//   pnpm vocab:localize --dry-run --limit 40       # counts + first prompt, no API, no writes
//   pnpm vocab:localize --limit 40                 # pilot
//   pnpm vocab:localize [--level A1|A2|B1] [--topic food_drink] [--model claude-sonnet-5-5]
//                       [--batch-size 20] [--concurrency 3] [--effort low|medium|high]

import { appendFileSync, mkdirSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createPrismaClient } from '@englishlearn/db/create-client';
import {
  applyLexemeLocalizations,
  findLexemesToLocalize,
} from '@englishlearn/db/queries/lexeme-localization';
import { CefrLevelValue } from '@englishlearn/db/schemas';
import { lexemeIdentity, loadCefrJDataset, topicIndex } from '@englishlearn/db/vocab/dataset';
import { VOCAB_TOPIC_IDS } from '@englishlearn/db/vocab/topics';
import { z } from 'zod';
import {
  buildUserPrompt,
  createLocalizationCaller,
  DEFAULT_BATCH_SIZE,
  DEFAULT_CONCURRENCY,
  planLocalization,
  resolveLocalizationModel,
  runLocalization,
} from '../src/localization';

const DEAD_LETTER_DIR = new URL('../.localize/', import.meta.url);
const DEAD_LETTER = new URL('dead-letter.jsonl', DEAD_LETTER_DIR);

const ArgsSchema = z.object({
  limit: z.coerce.number().int().positive().optional(),
  'batch-size': z.coerce.number().int().min(1).max(50).default(DEFAULT_BATCH_SIZE),
  concurrency: z.coerce.number().int().min(1).max(10).default(DEFAULT_CONCURRENCY),
  level: CefrLevelValue.optional(),
  topic: z.enum(VOCAB_TOPIC_IDS).optional(),
  model: z.string().min(1).optional(),
  effort: z.enum(['low', 'medium', 'high']).optional(),
  'dry-run': z.boolean().default(false),
});

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      limit: { type: 'string' },
      'batch-size': { type: 'string' },
      concurrency: { type: 'string' },
      level: { type: 'string' },
      topic: { type: 'string' },
      model: { type: 'string' },
      effort: { type: 'string' },
      'dry-run': { type: 'boolean' },
    },
  });
  const args = ArgsSchema.parse(values);
  const model = resolveLocalizationModel(args.model);

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  console.log(`Target host: ${new URL(url).hostname} · model: ${model}`);

  const topics = topicIndex(loadCefrJDataset().lexemes);
  const db = createPrismaClient(url, { log: ['error'] });
  try {
    const store = {
      findPending: () => findLexemesToLocalize(db, { level: args.level }),
      apply: (rows: Parameters<typeof applyLexemeLocalizations>[1]) =>
        applyLexemeLocalizations(db, rows),
    };

    const topicOf = (row: { lemmaKey: string; pos: string; sense: string }) =>
      topics.get(lexemeIdentity(row));

    if (args['dry-run']) {
      const pending = await store.findPending();
      const plan = planLocalization(pending, {
        topicOf,
        batchSize: args['batch-size'],
        limit: args.limit,
        topic: args.topic,
      });
      console.log(
        `${pending.length} pending (DRAFT, no translations); ${plan.selected} selected in ` +
          `${plan.chunks.length} chunks. No API call, nothing written.`,
      );
      const [first] = plan.chunks;
      if (first) console.log(`\nFirst prompt:\n${buildUserPrompt(first)}`);
      return;
    }

    mkdirSync(DEAD_LETTER_DIR, { recursive: true });
    const runAt = new Date().toISOString();
    const report = await runLocalization({
      store,
      call: createLocalizationCaller({ model, effort: args.effort }),
      topicOf,
      batchSize: args['batch-size'],
      concurrency: args.concurrency,
      limit: args.limit,
      topic: args.topic,
      onRejected: (items) => {
        const lines = items.map((item) => JSON.stringify({ runAt, model, ...item }));
        appendFileSync(DEAD_LETTER, `${lines.join('\n')}\n`);
      },
      log: (message) => console.log(message),
    });
    console.log(
      `Pending ${report.pending}, selected ${report.selected} in ${report.chunks} chunks: ` +
        `${report.written} → REVIEW, ${report.rejected} rejected (${report.failedChunks} failed chunks).`,
    );
    console.log(
      `Tokens: ${report.usage.inputTokens} in, ${report.usage.outputTokens} out, ` +
        `cache read ${report.usage.cacheReadTokens}, cache write ${report.usage.cacheWriteTokens}.`,
    );
    if (report.rejected > 0) console.log(`Rejections: ${DEAD_LETTER.pathname}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
