-- One vocabulary item per lexeme: vocab:publish creates items with
-- skipDuplicates, so a re-run (or two runs at once) never doubles a word.
-- Partial, so other kinds may still reference a lexeme (collocations).
-- Prisma cannot model a partial index; it lives here only (see Item).
CREATE UNIQUE INDEX "Item_vocab_lexemeId_key" ON "public"."Item"("lexemeId") WHERE "kind" = 'VOCAB_WORD' AND "lexemeId" IS NOT NULL;

-- Pool isolation (Axiom 6): a lexeme-backed item never carries a practice
-- question, so grammar selection (PRACTISABLE_ITEM) can never serve it.
ALTER TABLE "public"."Item" ADD CONSTRAINT "Item_lexeme_not_practisable" CHECK ("lexemeId" IS NULL OR "hasPractice" = false);
