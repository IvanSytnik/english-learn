import 'server-only';
import { prisma } from '../client';
import { type CefrLevel, ContentStatus } from '../generated/client/index';

/**
 * IMPORTANT: All exercise queries used in student-facing code MUST go through
 * these helpers. They enforce `status = PUBLISHED` filtering at the database
 * level. Raw `prisma.vocabExercise` etc. are only acceptable in admin code.
 */

export const publishedExercises = {
  vocab: {
    findMany: (args?: { cefrLevel?: CefrLevel; skillTagId?: string; take?: number }) =>
      prisma.vocabExercise.findMany({
        where: {
          status: ContentStatus.PUBLISHED,
          ...(args?.cefrLevel && { cefrLevel: args.cefrLevel }),
          ...(args?.skillTagId && { skillTagId: args.skillTagId }),
        },
        take: args?.take,
        orderBy: { publishedAt: 'desc' },
      }),
    findById: (id: string) =>
      prisma.vocabExercise.findFirst({
        where: { id, status: ContentStatus.PUBLISHED },
      }),
  },
  grammar: {
    findMany: (args?: { cefrLevel?: CefrLevel; skillTagId?: string; take?: number }) =>
      prisma.grammarExercise.findMany({
        where: {
          status: ContentStatus.PUBLISHED,
          ...(args?.cefrLevel && { cefrLevel: args.cefrLevel }),
          ...(args?.skillTagId && { skillTagId: args.skillTagId }),
        },
        take: args?.take,
        orderBy: { publishedAt: 'desc' },
      }),
    findById: (id: string) =>
      prisma.grammarExercise.findFirst({
        where: { id, status: ContentStatus.PUBLISHED },
      }),
  },
  listening: {
    findMany: (args?: { cefrLevel?: CefrLevel; skillTagId?: string; take?: number }) =>
      prisma.listeningExercise.findMany({
        where: {
          status: ContentStatus.PUBLISHED,
          ...(args?.cefrLevel && { cefrLevel: args.cefrLevel }),
          ...(args?.skillTagId && { skillTagId: args.skillTagId }),
        },
        take: args?.take,
        orderBy: { publishedAt: 'desc' },
      }),
    findById: (id: string) =>
      prisma.listeningExercise.findFirst({
        where: { id, status: ContentStatus.PUBLISHED },
      }),
  },
  diagnostic: {
    findByLevelAndType: (cefrLevel: CefrLevel, type: 'VOCAB' | 'GRAMMAR' | 'LISTENING') =>
      prisma.diagnosticItem.findMany({
        where: { status: ContentStatus.PUBLISHED, cefrLevel, type },
      }),
  },
};
