-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "passwordChangedAt" TIMESTAMP(3),
ADD COLUMN     "signupSource" TEXT;

