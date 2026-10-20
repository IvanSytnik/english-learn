import 'server-only';

import { prisma } from '@englishlearn/db';
import {
  createLearnerService,
  createPrismaLearnerDb,
  createSelectionService,
} from '@englishlearn/learner-model/service';

/**
 * The learner model wired to the app's single Prisma client. The only place
 * apps/web constructs learner-model services: recordOutcome (write path) and
 * selectNext (read path) both go through these.
 */
const db = createPrismaLearnerDb(prisma);

export const learnerService = createLearnerService(db);
export const selectionService = createSelectionService(db);
