-- AlterTable
ALTER TABLE "public"."DiagnosticAnswer" ADD COLUMN     "dontKnow" BOOLEAN NOT NULL DEFAULT false;


-- "I don't know" is always graded incorrect. Not modelled by Prisma, so
-- `migrate diff` will neither generate nor drop it. Existing rows all have
-- dontKnow = false, so validation is trivially satisfied.
ALTER TABLE "public"."DiagnosticAnswer" ADD CONSTRAINT "DiagnosticAnswer_dontKnow_not_correct" CHECK (NOT ("dontKnow" AND "isCorrect"));
