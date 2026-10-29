-- AlterTable
ALTER TABLE "public"."Item" ADD COLUMN     "hasPractice" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: an item has practice when content.practice is a JSON object
-- (not missing, not JSON null) — the condition PRACTISABLE_ITEM used so far.
UPDATE "public"."Item" SET "hasPractice" = true WHERE jsonb_typeof("content" -> 'practice') = 'object';

-- The column is a copy of content: keep it equal on every write (checked on
-- writes only, so reads still never touch content).
ALTER TABLE "public"."Item" ADD CONSTRAINT "Item_hasPractice_matches_content" CHECK ("hasPractice" = (jsonb_typeof("content" -> 'practice') IS NOT DISTINCT FROM 'object'));

-- CreateIndex
CREATE INDEX "Item_status_hasPractice_idx" ON "public"."Item"("status", "hasPractice");
