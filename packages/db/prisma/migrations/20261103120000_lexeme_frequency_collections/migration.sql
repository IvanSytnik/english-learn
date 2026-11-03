-- B6.2 expand: wordfreq Zipf frequency and browsing collections on Lexeme.
-- Additive and nullable / defaulted: the running code never reads them.
ALTER TABLE "public"."Lexeme" ADD COLUMN "frequencyZipf" DOUBLE PRECISION,
ADD COLUMN "collections" TEXT[] DEFAULT ARRAY[]::TEXT[];
