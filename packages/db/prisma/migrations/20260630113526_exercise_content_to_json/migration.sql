-- Truncate exercise tables before ADD COLUMN NOT NULL.
-- Attempts cascade-delete (intentional — seed-only data).
TRUNCATE TABLE 
  "public"."VocabExercise",
  "public"."GrammarExercise",
  "public"."ListeningExercise",
  "public"."DiagnosticItem"
RESTART IDENTITY CASCADE;

-- CreateEnum
CREATE TYPE "public"."DiagnosticKind" AS ENUM ('VOCAB', 'GRAMMAR', 'LISTENING');

-- DropIndex
DROP INDEX "public"."DiagnosticItem_cefrLevel_type_status_idx";

-- DropIndex
DROP INDEX "public"."DiagnosticItem_status_createdAt_idx";

-- DropIndex
DROP INDEX "public"."GrammarExercise_status_createdAt_idx";

-- DropIndex
DROP INDEX "public"."ListeningExercise_status_createdAt_idx";

-- DropIndex
DROP INDEX "public"."VocabExercise_status_createdAt_idx";

-- AlterTable
ALTER TABLE "public"."DiagnosticItem" DROP COLUMN "acceptedAnswers",
DROP COLUMN "audioUrl",
DROP COLUMN "choices",
DROP COLUMN "correctIndex",
DROP COLUMN "difficultyParam",
DROP COLUMN "prompt",
DROP COLUMN "publishedAt",
DROP COLUMN "reviewNotes",
DROP COLUMN "reviewedAt",
DROP COLUMN "template",
DROP COLUMN "transcript",
DROP COLUMN "type",
ADD COLUMN     "content" JSONB NOT NULL,
ADD COLUMN     "generatorMeta" JSONB,
ADD COLUMN     "kind" "public"."DiagnosticKind" NOT NULL,
ADD COLUMN     "source" "public"."ExerciseSource" NOT NULL DEFAULT 'CURATED';

-- AlterTable
ALTER TABLE "public"."GrammarExercise" DROP COLUMN "acceptedAnswers",
DROP COLUMN "explanation",
DROP COLUMN "grammarPoint",
DROP COLUMN "hint",
DROP COLUMN "publishedAt",
DROP COLUMN "reviewNotes",
DROP COLUMN "reviewedAt",
DROP COLUMN "template",
ADD COLUMN     "content" JSONB NOT NULL;

-- AlterTable
ALTER TABLE "public"."ListeningExercise" DROP COLUMN "acceptedVariants",
DROP COLUMN "audioDurationSec",
DROP COLUMN "audioUrl",
DROP COLUMN "explanation",
DROP COLUMN "publishedAt",
DROP COLUMN "reviewNotes",
DROP COLUMN "reviewedAt",
DROP COLUMN "toleranceLevel",
DROP COLUMN "transcript",
ADD COLUMN     "content" JSONB NOT NULL;

-- AlterTable
ALTER TABLE "public"."VocabExercise" DROP COLUMN "choices",
DROP COLUMN "correctIndex",
DROP COLUMN "explanation",
DROP COLUMN "prompt",
DROP COLUMN "publishedAt",
DROP COLUMN "reviewNotes",
DROP COLUMN "reviewedAt",
DROP COLUMN "targetLexeme",
ADD COLUMN     "content" JSONB NOT NULL;

-- DropEnum
DROP TYPE "public"."DiagnosticItemType";

-- CreateTable
CREATE TABLE "public"."ConceptMastery" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conceptId" TEXT NOT NULL,
    "pKnown" DOUBLE PRECISION NOT NULL,
    "pLearn" DOUBLE PRECISION NOT NULL,
    "pSlip" DOUBLE PRECISION NOT NULL,
    "pGuess" DOUBLE PRECISION NOT NULL,
    "pForgetLambda" DOUBLE PRECISION NOT NULL,
    "lastUpdatedAt" BIGINT NOT NULL,
    "observationCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConceptMastery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConceptMastery_userId_idx" ON "public"."ConceptMastery"("userId");

-- CreateIndex
CREATE INDEX "ConceptMastery_conceptId_idx" ON "public"."ConceptMastery"("conceptId");

-- CreateIndex
CREATE UNIQUE INDEX "ConceptMastery_userId_conceptId_key" ON "public"."ConceptMastery"("userId", "conceptId");

-- CreateIndex
CREATE INDEX "DiagnosticItem_cefrLevel_kind_status_idx" ON "public"."DiagnosticItem"("cefrLevel", "kind", "status");

-- CreateIndex
CREATE INDEX "DiagnosticItem_status_idx" ON "public"."DiagnosticItem"("status");

-- CreateIndex
CREATE INDEX "GrammarExercise_status_idx" ON "public"."GrammarExercise"("status");

-- CreateIndex
CREATE INDEX "ListeningExercise_status_idx" ON "public"."ListeningExercise"("status");

-- CreateIndex
CREATE INDEX "VocabExercise_status_idx" ON "public"."VocabExercise"("status");

-- AddForeignKey
ALTER TABLE "public"."ConceptMastery" ADD CONSTRAINT "ConceptMastery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ConceptMastery" ADD CONSTRAINT "ConceptMastery_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "public"."Concept"("id") ON DELETE CASCADE ON UPDATE CASCADE;