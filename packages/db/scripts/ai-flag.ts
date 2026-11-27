// packages/db/scripts/ai-flag.ts
//
// Read or set the AI runtime switches (AppFlag, B6.9). Values are validated
// by APP_FLAG_SCHEMAS; a key outside it is refused. Running instances pick a
// change up within 60 s (in-process cache).
//
// Usage (from packages/db; DATABASE_URL from .env — prod only by Ivan):
//   pnpm ai:flag list
//   pnpm ai:flag set ai.lexeme_generation.enabled false
//   pnpm ai:flag set ai.daily_budget_micro_usd 2000000      # $2.00 / day
//   pnpm ai:flag set ai.user_daily_budget_micro_usd 50000   # $0.05 / user / day

import { createPrismaClient } from '../src/create-client';
import { listAppFlags, setAppFlag } from '../src/queries/app-flags';
import { APP_FLAG_DEFAULTS, APP_FLAG_KEYS, isAppFlagKey } from '../src/schemas/app-flag';

function usage(): never {
  console.error('Usage: pnpm ai:flag list | pnpm ai:flag set <key> <json value>');
  console.error(`Keys: ${APP_FLAG_KEYS.join(', ')}`);
  process.exit(2);
}

async function main(): Promise<void> {
  const [command, key, rawValue] = process.argv.slice(2);
  if (command !== 'list' && command !== 'set') usage();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  console.log(`Target host: ${new URL(url).hostname}`);
  const db = createPrismaClient(url, { log: ['error'] });
  try {
    if (command === 'list') {
      const rows = new Map((await listAppFlags(db)).map((r) => [r.key, r]));
      for (const k of APP_FLAG_KEYS) {
        const row = rows.get(k);
        console.log(
          row
            ? `${k} = ${JSON.stringify(row.value)} (updated ${row.updatedAt.toISOString()})`
            : `${k} — not set, reads as ${JSON.stringify(APP_FLAG_DEFAULTS[k])}`,
        );
        rows.delete(k);
      }
      for (const row of rows.values())
        console.log(`${row.key} = ${JSON.stringify(row.value)} (unknown key, never read)`);
      return;
    }
    if (!key || rawValue === undefined) usage();
    if (!isAppFlagKey(key))
      throw new Error(`Unknown key ${key}; known: ${APP_FLAG_KEYS.join(', ')}`);
    const value = await setAppFlag(db, key, JSON.parse(rawValue));
    console.log(`${key} = ${JSON.stringify(value)}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
