import type { PrismaClient } from '@englishlearn/db/generated/client/client.js';
import { DiagnosticContentSchema } from '@englishlearn/db/schemas';
import type { SeedDiagnosticItem } from './bank';

/**
 * Seeds the diagnostic bank: upsert by stable id, PUBLISHED, and archive every
 * `seed-diag-*` row that has left the bank (never delete: answers may point at
 * it). Idempotent — a second run changes nothing.
 *
 * The client is a parameter so the integration test can run it against a
 * throwaway database; run.ts wires the real one.
 */

export const SEED_DIAG_PREFIX = 'seed-diag-';

/** Every problem in the bank, as readable lines; empty when valid. */
export function bankProblems(bank: readonly SeedDiagnosticItem[]): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const item of bank) {
    if (!item.id.startsWith(SEED_DIAG_PREFIX))
      problems.push(`${item.id}: id must start with ${SEED_DIAG_PREFIX}`);
    if (ids.has(item.id)) problems.push(`${item.id}: duplicate id`);
    ids.add(item.id);
    const parsed = DiagnosticContentSchema.safeParse(item.content);
    if (!parsed.success) {
      problems.push(
        `${item.id}: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
      );
    }
  }
  return problems;
}

export type SeedDiagnosticResult = { created: number; updated: number; archived: number };

export async function seedDiagnosticBank(
  db: Pick<PrismaClient, 'diagnosticItem'>,
  bank: readonly SeedDiagnosticItem[],
): Promise<SeedDiagnosticResult> {
  // Validate everything before the first write: a bad item aborts the run.
  const problems = bankProblems(bank);
  if (problems.length > 0) {
    throw new Error(`Diagnostic bank is invalid:\n  ${problems.join('\n  ')}`);
  }

  const existing = new Set(
    (
      await db.diagnosticItem.findMany({
        where: { id: { in: bank.map((i) => i.id) } },
        select: { id: true },
      })
    ).map((r) => r.id),
  );

  for (const item of bank) {
    const data = {
      kind: item.kind,
      cefrLevel: item.cefrLevel,
      source: 'CURATED' as const,
      status: 'PUBLISHED' as const,
      content: DiagnosticContentSchema.parse(item.content) as object,
      skillTagId: null,
    };
    await db.diagnosticItem.upsert({
      where: { id: item.id },
      create: { id: item.id, ...data },
      update: data,
    });
  }

  const retired = await db.diagnosticItem.updateMany({
    where: {
      id: { startsWith: SEED_DIAG_PREFIX, notIn: bank.map((i) => i.id) },
      status: { not: 'ARCHIVED' },
    },
    data: { status: 'ARCHIVED' },
  });

  return {
    created: bank.length - existing.size,
    updated: existing.size,
    archived: retired.count,
  };
}
