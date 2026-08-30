-- AlterEnum
ALTER TYPE "public"."LearnerEventType" ADD VALUE 'LEARNER_BOOTSTRAPPED';

-- AlterTable
ALTER TABLE "public"."DiagnosticItem" ADD COLUMN     "irtDifficulty" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
ADD COLUMN     "irtDiscrimination" DOUBLE PRECISION NOT NULL DEFAULT 1.0;

