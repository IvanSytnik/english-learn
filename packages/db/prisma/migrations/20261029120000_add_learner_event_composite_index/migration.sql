-- CreateIndex
CREATE INDEX "LearnerEvent_userId_type_occurredAt_idx" ON "public"."LearnerEvent"("userId", "type", "occurredAt");

