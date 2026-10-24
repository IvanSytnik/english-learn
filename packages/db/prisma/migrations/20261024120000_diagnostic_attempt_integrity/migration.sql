-- AlterTable
ALTER TABLE "public"."DiagnosticAttempt" ADD COLUMN     "activeUserId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "DiagnosticAnswer_attemptId_itemId_key" ON "public"."DiagnosticAnswer"("attemptId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "DiagnosticAttempt_activeUserId_key" ON "public"."DiagnosticAttempt"("activeUserId");


-- activeUserId is set only on the user's own IN_PROGRESS attempt, so its
-- @unique allows at most one IN_PROGRESS attempt per user. Not modelled by
-- Prisma, so `migrate diff` will neither generate nor drop it. Existing rows
-- all have activeUserId = NULL, so validation is trivially satisfied.
ALTER TABLE "public"."DiagnosticAttempt" ADD CONSTRAINT "DiagnosticAttempt_activeUserId_in_progress" CHECK ("activeUserId" IS NULL OR ("activeUserId" = "userId" AND "status" = 'IN_PROGRESS'));
