ALTER TABLE "business_matter_tasks"
  ADD COLUMN "cancelled_at" TIMESTAMP(3);

UPDATE "business_matter_tasks"
SET "cancelled_at" = "updated_at"
WHERE "status" = 'CANCELLED' AND "cancelled_at" IS NULL;

CREATE INDEX "business_matter_tasks_cancelled_at_idx" ON "business_matter_tasks"("cancelled_at");
