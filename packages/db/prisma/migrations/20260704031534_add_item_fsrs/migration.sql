-- CreateEnum
CREATE TYPE "public"."ItemKind" AS ENUM ('VOCAB_WORD', 'GRAMMAR_PATTERN', 'COLLOCATION', 'IDIOM');

-- CreateEnum
CREATE TYPE "public"."FsrsCardStatus" AS ENUM ('NEW', 'LEARNING', 'REVIEW', 'RELEARNING');

-- CreateTable
CREATE TABLE "public"."Item" (
    "id" TEXT NOT NULL,
    "conceptId" TEXT NOT NULL,
    "kind" "public"."ItemKind" NOT NULL,
    "cefrLevel" "public"."CefrLevel" NOT NULL,
    "status" "public"."ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "source" "public"."ExerciseSource" NOT NULL DEFAULT 'CURATED',
    "content" JSONB NOT NULL,
    "irtDiscrimination" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "irtDifficulty" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "generatorMeta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ItemReviewState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "stability" DOUBLE PRECISION NOT NULL,
    "difficulty" DOUBLE PRECISION NOT NULL,
    "reps" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "learningSteps" INTEGER NOT NULL DEFAULT 0,
    "cardStatus" "public"."FsrsCardStatus" NOT NULL DEFAULT 'NEW',
    "dueAt" BIGINT NOT NULL,
    "lastReviewAt" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemReviewState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Item_conceptId_idx" ON "public"."Item"("conceptId");

-- CreateIndex
CREATE INDEX "Item_kind_cefrLevel_idx" ON "public"."Item"("kind", "cefrLevel");

-- CreateIndex
CREATE INDEX "Item_status_idx" ON "public"."Item"("status");

-- CreateIndex
CREATE INDEX "ItemReviewState_userId_dueAt_idx" ON "public"."ItemReviewState"("userId", "dueAt");

-- CreateIndex
CREATE INDEX "ItemReviewState_itemId_idx" ON "public"."ItemReviewState"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemReviewState_userId_itemId_key" ON "public"."ItemReviewState"("userId", "itemId");

-- AddForeignKey
ALTER TABLE "public"."Item" ADD CONSTRAINT "Item_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "public"."Concept"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ItemReviewState" ADD CONSTRAINT "ItemReviewState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ItemReviewState" ADD CONSTRAINT "ItemReviewState_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "public"."Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

