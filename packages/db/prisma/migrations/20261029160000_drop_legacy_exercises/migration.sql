-- DropForeignKey
ALTER TABLE "public"."GrammarAttempt" DROP CONSTRAINT "GrammarAttempt_exerciseId_fkey";

-- DropForeignKey
ALTER TABLE "public"."GrammarAttempt" DROP CONSTRAINT "GrammarAttempt_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."GrammarExercise" DROP CONSTRAINT "GrammarExercise_createdById_fkey";

-- DropForeignKey
ALTER TABLE "public"."GrammarExercise" DROP CONSTRAINT "GrammarExercise_reviewedById_fkey";

-- DropForeignKey
ALTER TABLE "public"."GrammarExercise" DROP CONSTRAINT "GrammarExercise_skillTagId_fkey";

-- DropForeignKey
ALTER TABLE "public"."ListeningAttempt" DROP CONSTRAINT "ListeningAttempt_exerciseId_fkey";

-- DropForeignKey
ALTER TABLE "public"."ListeningAttempt" DROP CONSTRAINT "ListeningAttempt_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."ListeningExercise" DROP CONSTRAINT "ListeningExercise_createdById_fkey";

-- DropForeignKey
ALTER TABLE "public"."ListeningExercise" DROP CONSTRAINT "ListeningExercise_reviewedById_fkey";

-- DropForeignKey
ALTER TABLE "public"."ListeningExercise" DROP CONSTRAINT "ListeningExercise_skillTagId_fkey";

-- DropForeignKey
ALTER TABLE "public"."SkillLevel" DROP CONSTRAINT "SkillLevel_skillTagId_fkey";

-- DropForeignKey
ALTER TABLE "public"."SkillLevel" DROP CONSTRAINT "SkillLevel_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."VocabAttempt" DROP CONSTRAINT "VocabAttempt_exerciseId_fkey";

-- DropForeignKey
ALTER TABLE "public"."VocabAttempt" DROP CONSTRAINT "VocabAttempt_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."VocabExercise" DROP CONSTRAINT "VocabExercise_createdById_fkey";

-- DropForeignKey
ALTER TABLE "public"."VocabExercise" DROP CONSTRAINT "VocabExercise_reviewedById_fkey";

-- DropForeignKey
ALTER TABLE "public"."VocabExercise" DROP CONSTRAINT "VocabExercise_skillTagId_fkey";

-- DropTable
DROP TABLE "public"."GrammarAttempt";

-- DropTable
DROP TABLE "public"."GrammarExercise";

-- DropTable
DROP TABLE "public"."ListeningAttempt";

-- DropTable
DROP TABLE "public"."ListeningExercise";

-- DropTable
DROP TABLE "public"."SkillLevel";

-- DropTable
DROP TABLE "public"."VocabAttempt";

-- DropTable
DROP TABLE "public"."VocabExercise";

