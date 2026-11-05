-- B6.6 expand: learner word preferences (Prioritize / Hide) and word lists.
-- New tables only; the running code never reads them. Preferences steer
-- selection, never learner state (no event, no projection).

-- CreateEnum
CREATE TYPE "public"."LexemePreferenceState" AS ENUM ('PRIORITIZED', 'HIDDEN');

-- CreateEnum
CREATE TYPE "public"."WordListSource" AS ENUM ('CUSTOM', 'IMPORT', 'TUTOR');

-- CreateTable
CREATE TABLE "public"."StudentLexemePreference" (
    "userId" TEXT NOT NULL,
    "lexemeId" TEXT NOT NULL,
    "state" "public"."LexemePreferenceState" NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentLexemePreference_pkey" PRIMARY KEY ("userId","lexemeId")
);

-- CreateTable
CREATE TABLE "public"."WordList" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "source" "public"."WordListSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "WordList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WordListEntry" (
    "listId" TEXT NOT NULL,
    "lexemeId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "note" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WordListEntry_pkey" PRIMARY KEY ("listId","lexemeId")
);

-- CreateIndex
CREATE INDEX "StudentLexemePreference_userId_state_idx" ON "public"."StudentLexemePreference"("userId", "state");

-- CreateIndex
CREATE INDEX "WordList_ownerId_archivedAt_idx" ON "public"."WordList"("ownerId", "archivedAt");

-- CreateIndex
CREATE INDEX "WordListEntry_lexemeId_idx" ON "public"."WordListEntry"("lexemeId");

-- AddForeignKey
ALTER TABLE "public"."StudentLexemePreference" ADD CONSTRAINT "StudentLexemePreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StudentLexemePreference" ADD CONSTRAINT "StudentLexemePreference_lexemeId_fkey" FOREIGN KEY ("lexemeId") REFERENCES "public"."Lexeme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WordList" ADD CONSTRAINT "WordList_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WordListEntry" ADD CONSTRAINT "WordListEntry_listId_fkey" FOREIGN KEY ("listId") REFERENCES "public"."WordList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WordListEntry" ADD CONSTRAINT "WordListEntry_lexemeId_fkey" FOREIGN KEY ("lexemeId") REFERENCES "public"."Lexeme"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Raw-SQL CHECKs (Prisma does not model them); Zod in
-- src/schemas/word-list.ts mirrors them.
ALTER TABLE "public"."WordList" ADD CONSTRAINT "WordList_title_length"
  CHECK (char_length("title") BETWEEN 1 AND 80 AND btrim("title") <> '');

ALTER TABLE "public"."WordListEntry" ADD CONSTRAINT "WordListEntry_position_nonnegative"
  CHECK ("position" >= 0);

ALTER TABLE "public"."WordListEntry" ADD CONSTRAINT "WordListEntry_note_length"
  CHECK ("note" IS NULL OR char_length("note") <= 200);
