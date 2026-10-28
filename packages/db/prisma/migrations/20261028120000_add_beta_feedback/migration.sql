-- CreateEnum
CREATE TYPE "public"."FeedbackKind" AS ENUM ('CONTENT_ERROR', 'BUG', 'SUGGESTION', 'OTHER');

-- CreateTable
CREATE TABLE "public"."BetaFeedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "public"."FeedbackKind" NOT NULL DEFAULT 'CONTENT_ERROR',
    "text" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "itemId" TEXT,
    "conceptId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BetaFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BetaFeedback_userId_idx" ON "public"."BetaFeedback"("userId");

-- CreateIndex
CREATE INDEX "BetaFeedback_itemId_idx" ON "public"."BetaFeedback"("itemId");

-- CreateIndex
CREATE INDEX "BetaFeedback_createdAt_idx" ON "public"."BetaFeedback"("createdAt");

-- AddForeignKey
ALTER TABLE "public"."BetaFeedback" ADD CONSTRAINT "BetaFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;




-- Expand-only: a new enum and a new table, nothing existing is touched, no
-- backfill. Safe to deploy before the code that writes to it ships.
