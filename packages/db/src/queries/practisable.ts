import { Prisma } from '../generated/client/client';

/**
 * "Something to practise": a PUBLISHED item with a practice question — the
 * selection policy's candidate filter. A SQL condition on an "Item" row
 * aliased `i`; every packages/db query that needs the filter interpolates
 * this one fragment.
 *
 * It reads the `hasPractice` column, never `content`: a JSONB test in WHERE
 * would detoast every item's content on each read. The column's CHECK keeps
 * it equal to `jsonb_typeof(content -> 'practice') = 'object'` (JSON null is
 * not a question).
 *
 * learner-model's `getCandidateItems` keeps its own copy (it owns its port);
 * placement-context-parity.db.test.ts pins the two to the same concept set.
 */
export const PRACTISABLE_ITEM = Prisma.sql`i."status" = 'PUBLISHED' AND i."hasPractice" = true`;

/**
 * The value an Item writer must store in `hasPractice` for this `content`:
 * the JS twin of the column's CHECK (practice is a JSON object — not
 * missing, null, an array or a scalar).
 */
export function hasPracticeQuestion(content: unknown): boolean {
  if (typeof content !== 'object' || content === null) return false;
  const practice = (content as { practice?: unknown }).practice;
  return typeof practice === 'object' && practice !== null && !Array.isArray(practice);
}
