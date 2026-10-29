-- CreateEnum
CREATE TYPE "public"."PartOfSpeech" AS ENUM ('NOUN', 'VERB', 'ADJECTIVE', 'ADVERB', 'PRONOUN', 'PREPOSITION', 'CONJUNCTION', 'PHRASAL_VERB', 'IDIOM', 'INTERJECTION', 'OTHER');

-- AlterTable
ALTER TABLE "public"."Item" ADD COLUMN     "lexemeId" TEXT;

-- AlterTable
ALTER TABLE "public"."StudentProfile" ADD COLUMN     "dailyVocabLimit" INTEGER NOT NULL DEFAULT 10;

-- CreateTable
CREATE TABLE "public"."Lexeme" (
    "id" TEXT NOT NULL,
    "lemma" TEXT NOT NULL,
    "lemmaKey" TEXT NOT NULL,
    "pos" "public"."PartOfSpeech" NOT NULL,
    "sense" TEXT NOT NULL DEFAULT '',
    "cefrLevel" "public"."CefrLevel" NOT NULL,
    "cefrJLevel" TEXT NOT NULL,
    "ipa" TEXT,
    "audioUrl" TEXT,
    "definitions" JSONB NOT NULL,
    "translations" JSONB NOT NULL,
    "examples" JSONB NOT NULL DEFAULT '[]',
    "collocations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "frequencyRank" INTEGER,
    "status" "public"."ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lexeme_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Lexeme_status_cefrLevel_pos_idx" ON "public"."Lexeme"("status", "cefrLevel", "pos");

-- CreateIndex
CREATE UNIQUE INDEX "Lexeme_lemmaKey_pos_sense_key" ON "public"."Lexeme"("lemmaKey", "pos", "sense");

-- CreateIndex
CREATE INDEX "Item_lexemeId_idx" ON "public"."Item"("lexemeId");

-- AddForeignKey
ALTER TABLE "public"."Item" ADD CONSTRAINT "Item_lexemeId_fkey" FOREIGN KEY ("lexemeId") REFERENCES "public"."Lexeme"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- lemmaKey is the comparison key behind the unique index: "Run" and "run "
-- are the same lexeme. Every writer sets it from lemma.
ALTER TABLE "public"."Lexeme" ADD CONSTRAINT "Lexeme_lemmaKey_normalized" CHECK ("lemmaKey" = lower(btrim("lemma")));

-- CEFR-J levels only, and the sublevel must sit inside cefrLevel (PreA1 → A1).
ALTER TABLE "public"."Lexeme" ADD CONSTRAINT "Lexeme_cefrJLevel_valid" CHECK ("cefrJLevel" IN ('PreA1', 'A1.1', 'A1.2', 'A1.3', 'A2.1', 'A2.2', 'B1.1', 'B1.2', 'B2.1', 'B2.2', 'C1', 'C2'));
ALTER TABLE "public"."Lexeme" ADD CONSTRAINT "Lexeme_cefrJLevel_matches_cefrLevel" CHECK ((CASE WHEN "cefrJLevel" = 'PreA1' THEN 'A1' ELSE left("cefrJLevel", 2) END) = "cefrLevel"::text);

-- One shape for "no examples / no collocations": [] and '{}', never NULL.
ALTER TABLE "public"."Lexeme" ADD CONSTRAINT "Lexeme_examples_is_array" CHECK (jsonb_typeof("examples") = 'array');
ALTER TABLE "public"."Lexeme" ADD CONSTRAINT "Lexeme_collocations_not_null" CHECK ("collocations" IS NOT NULL);

-- New words per day.
ALTER TABLE "public"."StudentProfile" ADD CONSTRAINT "StudentProfile_dailyVocabLimit_range" CHECK ("dailyVocabLimit" BETWEEN 1 AND 50);
