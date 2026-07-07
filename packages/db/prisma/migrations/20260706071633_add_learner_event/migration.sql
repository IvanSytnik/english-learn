-- CreateEnum
CREATE TYPE "public"."LearnerEventType" AS ENUM ('ITEM_ATTEMPTED');

-- CreateTable
CREATE TABLE "public"."LearnerEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "public"."LearnerEventType" NOT NULL,
    "occurredAt" BIGINT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearnerEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LearnerEvent_userId_occurredAt_idx" ON "public"."LearnerEvent"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "LearnerEvent_type_idx" ON "public"."LearnerEvent"("type");

-- AddForeignKey
ALTER TABLE "public"."LearnerEvent" ADD CONSTRAINT "LearnerEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

