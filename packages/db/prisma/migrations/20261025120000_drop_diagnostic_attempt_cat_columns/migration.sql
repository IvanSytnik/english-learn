-- Contract step: drop the pseudo-CAT columns. The ladder rebuilds its state
-- from DiagnosticAnswer; no code reads or writes these since 95e8535/eb9c886.
-- Deploy the code WITHOUT these fields first, then run this migration: a
-- client generated with them still lists them in INSERT and fails once they
-- are gone ("column `currentLevel` does not exist"). Data lost: defaults only.

-- AlterTable
ALTER TABLE "public"."DiagnosticAttempt" DROP COLUMN "consecutiveCorrect",
DROP COLUMN "consecutiveWrong",
DROP COLUMN "currentLevel",
DROP COLUMN "itemsAnswered",
DROP COLUMN "levelTrajectory";

