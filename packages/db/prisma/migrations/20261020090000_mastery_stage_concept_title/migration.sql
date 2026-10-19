-- Additive only. Existing ConceptMastery rows get displayStage = NOT_STARTED;
-- displayStage is a projection, so if any rows exist the correct value comes
-- from replayUser (the fold), never from a hand-written backfill here.
-- Neon development had 0 rows at generation time.

-- CreateEnum
CREATE TYPE "public"."MasteryStage" AS ENUM ('NOT_STARTED', 'EMERGING', 'DEVELOPING', 'SOLID', 'HIGH_SOLID');

-- AlterTable
ALTER TABLE "public"."Concept" ADD COLUMN     "title" JSONB;

-- AlterTable
ALTER TABLE "public"."ConceptMastery" ADD COLUMN     "displayStage" "public"."MasteryStage" NOT NULL DEFAULT 'NOT_STARTED';

