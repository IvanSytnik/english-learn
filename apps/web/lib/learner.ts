import 'server-only';

import { prisma } from '@englishlearn/db';
import {
  createBootstrapService,
  createLearnerService,
  createPrismaLearnerDb,
  createSelectionService,
} from '@englishlearn/learner-model/service';

/**
 * The learner model wired to the app's single Prisma client. The only place
 * apps/web constructs learner-model services: recordOutcome and the
 * diagnostic bootstrap (write paths) and selectNext (read path) all go
 * through these.
 */
const db = createPrismaLearnerDb(prisma);

export const learnerService = createLearnerService(db);
export const selectionService = createSelectionService(db);
export const bootstrapService = createBootstrapService(db);
