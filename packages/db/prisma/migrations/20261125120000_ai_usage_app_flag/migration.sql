-- B6.9 expand: AI runtime cost log and runtime switches.
-- New tables only; the running code never reads them (the AI runtime ships
-- after this migration is applied). No prompt or output text is stored.

-- CreateTable
CREATE TABLE "public"."AiUsage" (
    "id" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "userId" TEXT,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "cacheRead" INTEGER NOT NULL DEFAULT 0,
    "cacheWrite" INTEGER NOT NULL DEFAULT 0,
    "costMicroUsd" INTEGER NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AppFlag" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppFlag_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "AiUsage_createdAt_idx" ON "public"."AiUsage"("createdAt");

-- CreateIndex
CREATE INDEX "AiUsage_userId_createdAt_idx" ON "public"."AiUsage"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."AiUsage" ADD CONSTRAINT "AiUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Raw-SQL CHECKs (Prisma does not model them).
ALTER TABLE "public"."AiUsage" ADD CONSTRAINT "AiUsage_counts_nonnegative"
  CHECK ("inputTokens" >= 0 AND "outputTokens" >= 0 AND "cacheRead" >= 0
    AND "cacheWrite" >= 0 AND "costMicroUsd" >= 0 AND "latencyMs" >= 0);
ALTER TABLE "public"."AiUsage" ADD CONSTRAINT "AiUsage_feature_id"
  CHECK ("feature" ~ '^[a-z][a-z0-9_]{0,63}$');
ALTER TABLE "public"."AiUsage" ADD CONSTRAINT "AiUsage_error_code_iff_failed"
  CHECK (("ok" AND "errorCode" IS NULL) OR (NOT "ok" AND "errorCode" IS NOT NULL));
ALTER TABLE "public"."AppFlag" ADD CONSTRAINT "AppFlag_key_shape"
  CHECK ("key" ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$');
