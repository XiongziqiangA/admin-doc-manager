CREATE TYPE "BusinessFollowUpMethod" AS ENUM ('CALL', 'WECHAT', 'EMAIL', 'MEETING', 'ONSITE', 'OTHER');

ALTER TYPE "BusinessActivityAction" ADD VALUE 'FOLLOW_UP_CREATED';

CREATE TABLE "business_matter_follow_ups" (
    "id" TEXT NOT NULL,
    "matter_id" TEXT NOT NULL,
    "method" "BusinessFollowUpMethod" NOT NULL,
    "content" TEXT NOT NULL,
    "result" TEXT,
    "next_action" TEXT,
    "next_assignee_id" TEXT,
    "next_due_at" TIMESTAMP(3),
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "business_matter_follow_ups_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "business_matter_follow_ups_matter_id_created_at_idx" ON "business_matter_follow_ups"("matter_id", "created_at");
CREATE INDEX "business_matter_follow_ups_next_assignee_id_next_due_at_idx" ON "business_matter_follow_ups"("next_assignee_id", "next_due_at");
CREATE INDEX "business_matter_follow_ups_next_due_at_idx" ON "business_matter_follow_ups"("next_due_at");
CREATE INDEX "business_matter_follow_ups_deleted_at_idx" ON "business_matter_follow_ups"("deleted_at");

ALTER TABLE "business_matter_follow_ups" ADD CONSTRAINT "business_matter_follow_ups_matter_id_fkey"
  FOREIGN KEY ("matter_id") REFERENCES "business_matters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "business_matter_follow_ups" ADD CONSTRAINT "business_matter_follow_ups_next_assignee_id_fkey"
  FOREIGN KEY ("next_assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "business_matter_follow_ups" ADD CONSTRAINT "business_matter_follow_ups_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON UPDATE CASCADE;
