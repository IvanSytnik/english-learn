-- CreateEnum
CREATE TYPE "ConceptCategory" AS ENUM ('GRAMMAR', 'VOCAB', 'LISTENING', 'PHONETICS', 'DISCOURSE', 'PRAGMATICS');

-- CreateEnum
CREATE TYPE "EdgeKind" AS ENUM ('PREREQUISITE', 'RELATED', 'CONTRASTS_WITH', 'PART_OF');

-- CreateTable
CREATE TABLE "Concept" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "cefrLevel" "CefrLevel" NOT NULL,
    "category" "ConceptCategory" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Concept_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConceptEdge" (
    "id" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "kind" "EdgeKind" NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConceptEdge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Concept_cefrLevel_idx" ON "Concept"("cefrLevel");
CREATE INDEX "Concept_category_idx" ON "Concept"("category");
CREATE INDEX "Concept_cefrLevel_category_idx" ON "Concept"("cefrLevel", "category");
CREATE UNIQUE INDEX "ConceptEdge_fromId_toId_kind_key" ON "ConceptEdge"("fromId", "toId", "kind");
CREATE INDEX "ConceptEdge_fromId_idx" ON "ConceptEdge"("fromId");
CREATE INDEX "ConceptEdge_toId_idx" ON "ConceptEdge"("toId");
CREATE INDEX "ConceptEdge_kind_idx" ON "ConceptEdge"("kind");

-- AddForeignKey
ALTER TABLE "ConceptEdge" ADD CONSTRAINT "ConceptEdge_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "Concept"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConceptEdge" ADD CONSTRAINT "ConceptEdge_toId_fkey" FOREIGN KEY ("toId") REFERENCES "Concept"("id") ON DELETE CASCADE ON UPDATE CASCADE;
