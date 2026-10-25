import { Prisma } from '../generated/client/client';

/**
 * "Something to practise": a PUBLISHED item with a practice question — the
 * selection policy's candidate filter. A SQL condition on an "Item" row
 * aliased `i`; every packages/db query that needs the filter interpolates
 * this one fragment.
 *
 * learner-model's `getCandidateItems` keeps its own copy (it owns its port);
 * placement-context-parity.db.test.ts pins the two to the same concept set.
 */
export const PRACTISABLE_ITEM = Prisma.sql`i."status" = 'PUBLISHED' AND i."content" -> 'practice' IS NOT NULL`;
