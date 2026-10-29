import 'server-only';

import { prisma } from '@englishlearn/db';
import {
  createBootstrapService,
  createLearnerService,
  createPrismaLearnerDb,
  createPrismaVocabSessionDb,
  createSelectionService,
  createVocabSessionService,
} from '@englishlearn/learner-model/service';

/**
 * The learner model wired to the app's single Prisma client. The only place
 * apps/web constructs learner-model services: recordOutcome,
 * recordVocabOutcome and the diagnostic bootstrap (write paths), selectNext
 * and nextVocab (read paths) all go through these.
 */
const db = createPrismaLearnerDb(prisma);

export const learnerService = createLearnerService(db);
export const selectionService = createSelectionService(db);
export const bootstrapService = createBootstrapService(db);
export const vocabSessionService = createVocabSessionService(createPrismaVocabSessionDb(prisma));
