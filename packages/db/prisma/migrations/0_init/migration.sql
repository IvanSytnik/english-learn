-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."UserRole" AS ENUM ('STUDENT', 'TUTOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "public"."CefrLevel" AS ENUM ('A1', 'A2', 'B1', 'B2', 'C1', 'C2');

-- CreateEnum
CREATE TYPE "public"."LearningGoal" AS ENUM ('WORK', 'IMMIGRATION', 'TRAVEL', 'EXAM', 'GENERAL');

-- CreateEnum
CREATE TYPE "public"."ContentStatus" AS ENUM ('DRAFT', 'REVIEW', 'PUBLISHED', 'ARCHIVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."ExerciseSource" AS ENUM ('CURATED', 'AI_GENERATED');

-- CreateEnum
CREATE TYPE "public"."SkillCategory" AS ENUM ('GRAMMAR', 'VOCABULARY', 'LISTENING', 'READING', 'SPEAKING', 'WRITING', 'PRONUNCIATION');

-- CreateEnum
CREATE TYPE "public"."DiagnosticItemType" AS ENUM ('VOCAB', 'GRAMMAR', 'LISTENING');

-- CreateEnum
CREATE TYPE "public"."DiagnosticStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED');

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "passwordHash" TEXT,
    "name" TEXT,
    "image" TEXT,
    "role" "public"."UserRole" NOT NULL DEFAULT 'STUDENT',
    "locale" TEXT NOT NULL DEFAULT 'en',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "public"."StudentProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nativeLanguage" TEXT NOT NULL,
    "selfReportedLevel" "public"."CefrLevel",
    "assessedLevel" "public"."CefrLevel",
    "goal" "public"."LearningGoal",
    "dailyGoalMin" INTEGER NOT NULL DEFAULT 15,
    "streakDays" INTEGER NOT NULL DEFAULT 0,
    "lastActiveAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SkillTag" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category" "public"."SkillCategory" NOT NULL,
    "cefrLevel" "public"."CefrLevel" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SkillTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SkillLevel" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skillTagId" TEXT NOT NULL,
    "mastery" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastSeenAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SkillLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."VocabExercise" (
    "id" TEXT NOT NULL,
    "cefrLevel" "public"."CefrLevel" NOT NULL,
    "source" "public"."ExerciseSource" NOT NULL DEFAULT 'CURATED',
    "skillTagId" TEXT,
    "prompt" TEXT NOT NULL,
    "targetLexeme" TEXT NOT NULL,
    "choices" TEXT[],
    "correctIndex" INTEGER NOT NULL,
    "explanation" TEXT,
    "status" "public"."ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "publishedAt" TIMESTAMP(3),
    "generatorMeta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VocabExercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."VocabAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "selectedIndex" INTEGER NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "timeMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VocabAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GrammarExercise" (
    "id" TEXT NOT NULL,
    "cefrLevel" "public"."CefrLevel" NOT NULL,
    "source" "public"."ExerciseSource" NOT NULL DEFAULT 'CURATED',
    "skillTagId" TEXT,
    "template" TEXT NOT NULL,
    "acceptedAnswers" TEXT[],
    "hint" TEXT,
    "explanation" TEXT,
    "grammarPoint" TEXT,
    "status" "public"."ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "publishedAt" TIMESTAMP(3),
    "generatorMeta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrammarExercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GrammarAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "userAnswer" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "timeMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrammarAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ListeningExercise" (
    "id" TEXT NOT NULL,
    "cefrLevel" "public"."CefrLevel" NOT NULL,
    "source" "public"."ExerciseSource" NOT NULL DEFAULT 'CURATED',
    "skillTagId" TEXT,
    "audioUrl" TEXT NOT NULL,
    "audioDurationSec" INTEGER NOT NULL,
    "transcript" TEXT NOT NULL,
    "acceptedVariants" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "toleranceLevel" INTEGER NOT NULL DEFAULT 2,
    "explanation" TEXT,
    "status" "public"."ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "publishedAt" TIMESTAMP(3),
    "generatorMeta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ListeningExercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ListeningAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "userAnswer" TEXT NOT NULL,
    "similarity" DOUBLE PRECISION NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "playCount" INTEGER NOT NULL DEFAULT 1,
    "timeMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListeningAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DiagnosticItem" (
    "id" TEXT NOT NULL,
    "type" "public"."DiagnosticItemType" NOT NULL,
    "cefrLevel" "public"."CefrLevel" NOT NULL,
    "skillTagId" TEXT,
    "prompt" TEXT NOT NULL,
    "choices" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "correctIndex" INTEGER,
    "template" TEXT,
    "acceptedAnswers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "audioUrl" TEXT,
    "transcript" TEXT,
    "difficultyParam" DOUBLE PRECISION,
    "status" "public"."ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiagnosticItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DiagnosticAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "public"."DiagnosticStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "currentLevel" "public"."CefrLevel" NOT NULL DEFAULT 'B1',
    "consecutiveCorrect" INTEGER NOT NULL DEFAULT 0,
    "consecutiveWrong" INTEGER NOT NULL DEFAULT 0,
    "itemsAnswered" INTEGER NOT NULL DEFAULT 0,
    "levelTrajectory" "public"."CefrLevel"[] DEFAULT ARRAY[]::"public"."CefrLevel"[],
    "assessedLevel" "public"."CefrLevel",

    CONSTRAINT "DiagnosticAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DiagnosticAnswer" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "userAnswer" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "timeMs" INTEGER,
    "itemLevel" "public"."CefrLevel" NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiagnosticAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "public"."User"("email");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "public"."Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "public"."Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "public"."Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "public"."Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "public"."VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "StudentProfile_userId_key" ON "public"."StudentProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SkillTag_slug_key" ON "public"."SkillTag"("slug");

-- CreateIndex
CREATE INDEX "SkillTag_category_cefrLevel_idx" ON "public"."SkillTag"("category", "cefrLevel");

-- CreateIndex
CREATE INDEX "SkillLevel_userId_idx" ON "public"."SkillLevel"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SkillLevel_userId_skillTagId_key" ON "public"."SkillLevel"("userId", "skillTagId");

-- CreateIndex
CREATE INDEX "VocabExercise_cefrLevel_status_idx" ON "public"."VocabExercise"("cefrLevel", "status");

-- CreateIndex
CREATE INDEX "VocabExercise_skillTagId_idx" ON "public"."VocabExercise"("skillTagId");

-- CreateIndex
CREATE INDEX "VocabExercise_status_createdAt_idx" ON "public"."VocabExercise"("status", "createdAt");

-- CreateIndex
CREATE INDEX "VocabAttempt_userId_createdAt_idx" ON "public"."VocabAttempt"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "VocabAttempt_exerciseId_idx" ON "public"."VocabAttempt"("exerciseId");

-- CreateIndex
CREATE INDEX "GrammarExercise_cefrLevel_status_idx" ON "public"."GrammarExercise"("cefrLevel", "status");

-- CreateIndex
CREATE INDEX "GrammarExercise_skillTagId_idx" ON "public"."GrammarExercise"("skillTagId");

-- CreateIndex
CREATE INDEX "GrammarExercise_status_createdAt_idx" ON "public"."GrammarExercise"("status", "createdAt");

-- CreateIndex
CREATE INDEX "GrammarAttempt_userId_createdAt_idx" ON "public"."GrammarAttempt"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "GrammarAttempt_exerciseId_idx" ON "public"."GrammarAttempt"("exerciseId");

-- CreateIndex
CREATE INDEX "ListeningExercise_cefrLevel_status_idx" ON "public"."ListeningExercise"("cefrLevel", "status");

-- CreateIndex
CREATE INDEX "ListeningExercise_skillTagId_idx" ON "public"."ListeningExercise"("skillTagId");

-- CreateIndex
CREATE INDEX "ListeningExercise_status_createdAt_idx" ON "public"."ListeningExercise"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ListeningAttempt_userId_createdAt_idx" ON "public"."ListeningAttempt"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ListeningAttempt_exerciseId_idx" ON "public"."ListeningAttempt"("exerciseId");

-- CreateIndex
CREATE INDEX "DiagnosticItem_cefrLevel_type_status_idx" ON "public"."DiagnosticItem"("cefrLevel", "type", "status");

-- CreateIndex
CREATE INDEX "DiagnosticItem_status_createdAt_idx" ON "public"."DiagnosticItem"("status", "createdAt");

-- CreateIndex
CREATE INDEX "DiagnosticAttempt_userId_idx" ON "public"."DiagnosticAttempt"("userId");

-- CreateIndex
CREATE INDEX "DiagnosticAttempt_status_startedAt_idx" ON "public"."DiagnosticAttempt"("status", "startedAt");

-- CreateIndex
CREATE INDEX "DiagnosticAnswer_attemptId_idx" ON "public"."DiagnosticAnswer"("attemptId");

-- CreateIndex
CREATE UNIQUE INDEX "DiagnosticAnswer_attemptId_position_key" ON "public"."DiagnosticAnswer"("attemptId", "position");

-- AddForeignKey
ALTER TABLE "public"."Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StudentProfile" ADD CONSTRAINT "StudentProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SkillLevel" ADD CONSTRAINT "SkillLevel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SkillLevel" ADD CONSTRAINT "SkillLevel_skillTagId_fkey" FOREIGN KEY ("skillTagId") REFERENCES "public"."SkillTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."VocabExercise" ADD CONSTRAINT "VocabExercise_skillTagId_fkey" FOREIGN KEY ("skillTagId") REFERENCES "public"."SkillTag"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."VocabExercise" ADD CONSTRAINT "VocabExercise_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."VocabExercise" ADD CONSTRAINT "VocabExercise_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."VocabAttempt" ADD CONSTRAINT "VocabAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."VocabAttempt" ADD CONSTRAINT "VocabAttempt_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "public"."VocabExercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GrammarExercise" ADD CONSTRAINT "GrammarExercise_skillTagId_fkey" FOREIGN KEY ("skillTagId") REFERENCES "public"."SkillTag"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GrammarExercise" ADD CONSTRAINT "GrammarExercise_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GrammarExercise" ADD CONSTRAINT "GrammarExercise_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GrammarAttempt" ADD CONSTRAINT "GrammarAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GrammarAttempt" ADD CONSTRAINT "GrammarAttempt_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "public"."GrammarExercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ListeningExercise" ADD CONSTRAINT "ListeningExercise_skillTagId_fkey" FOREIGN KEY ("skillTagId") REFERENCES "public"."SkillTag"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ListeningExercise" ADD CONSTRAINT "ListeningExercise_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ListeningExercise" ADD CONSTRAINT "ListeningExercise_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ListeningAttempt" ADD CONSTRAINT "ListeningAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ListeningAttempt" ADD CONSTRAINT "ListeningAttempt_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "public"."ListeningExercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DiagnosticItem" ADD CONSTRAINT "DiagnosticItem_skillTagId_fkey" FOREIGN KEY ("skillTagId") REFERENCES "public"."SkillTag"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DiagnosticItem" ADD CONSTRAINT "DiagnosticItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DiagnosticItem" ADD CONSTRAINT "DiagnosticItem_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DiagnosticAttempt" ADD CONSTRAINT "DiagnosticAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DiagnosticAnswer" ADD CONSTRAINT "DiagnosticAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "public"."DiagnosticAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DiagnosticAnswer" ADD CONSTRAINT "DiagnosticAnswer_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "public"."DiagnosticItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

