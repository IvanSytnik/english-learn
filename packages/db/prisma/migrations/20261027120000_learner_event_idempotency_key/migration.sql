-- AlterTable
ALTER TABLE "public"."LearnerEvent" ADD COLUMN     "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "LearnerEvent_userId_idempotencyKey_key" ON "public"."LearnerEvent"("userId", "idempotencyKey");



-- Additive and lock-light: a nullable column with no default is a catalog-only
-- change, and every existing row gets NULL. NULLs are distinct in a unique
-- index, so events without a key (bootstrap, all events before this) never
-- collide. Nothing reads the column until the learner-model change ships.
