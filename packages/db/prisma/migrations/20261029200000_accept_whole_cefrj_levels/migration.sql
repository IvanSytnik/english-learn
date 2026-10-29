-- The CEFR-J Wordlist tags words with whole levels (A1, A2, B1, B2), not
-- sublevels: accept both. The prefix CHECK Lexeme_cefrJLevel_matches_cefrLevel
-- already holds for a whole level (left('A1', 2) = 'A1').
ALTER TABLE "public"."Lexeme" DROP CONSTRAINT "Lexeme_cefrJLevel_valid";
ALTER TABLE "public"."Lexeme" ADD CONSTRAINT "Lexeme_cefrJLevel_valid" CHECK ("cefrJLevel" IN ('PreA1', 'A1', 'A1.1', 'A1.2', 'A1.3', 'A2', 'A2.1', 'A2.2', 'B1', 'B1.1', 'B1.2', 'B2', 'B2.1', 'B2.2', 'C1', 'C2'));
