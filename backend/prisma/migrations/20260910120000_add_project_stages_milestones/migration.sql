CREATE TYPE "BusinessStageStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE "BusinessMilestoneStatus" AS ENUM ('PLANNED', 'COMPLETED', 'CANCELLED');

CREATE TABLE "business_matter_stages" (
    "id" TEXT NOT NULL,
    "matter_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "BusinessStageStatus" NOT NULL DEFAULT 'PLANNED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "owner_id" TEXT,
    "owner_name" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "business_matter_stages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "business_matter_milestones" (
    "id" TEXT NOT NULL,
    "matter_id" TEXT NOT NULL,
    "stage_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "BusinessMilestoneStatus" NOT NULL DEFAULT 'PLANNED',
    "due_date" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "completed_by_id" TEXT,
    "owner_id" TEXT,
    "owner_name" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "business_matter_milestones_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "business_matter_tasks"
  ADD COLUMN "stage_id" TEXT,
  ADD COLUMN "milestone_id" TEXT;

CREATE INDEX "business_matter_stages_matter_id_sort_idx" ON "business_matter_stages"("matter_id", "sort");
CREATE INDEX "business_matter_stages_matter_id_status_idx" ON "business_matter_stages"("matter_id", "status");
CREATE INDEX "business_matter_stages_owner_id_idx" ON "business_matter_stages"("owner_id");
CREATE INDEX "business_matter_stages_end_date_idx" ON "business_matter_stages"("end_date");
CREATE INDEX "business_matter_stages_deleted_at_idx" ON "business_matter_stages"("deleted_at");
CREATE INDEX "business_matter_milestones_matter_id_due_date_idx" ON "business_matter_milestones"("matter_id", "due_date");
CREATE INDEX "business_matter_milestones_stage_id_idx" ON "business_matter_milestones"("stage_id");
CREATE INDEX "business_matter_milestones_owner_id_due_date_idx" ON "business_matter_milestones"("owner_id", "due_date");
CREATE INDEX "business_matter_milestones_deleted_at_idx" ON "business_matter_milestones"("deleted_at");
CREATE INDEX "business_matter_tasks_stage_id_status_idx" ON "business_matter_tasks"("stage_id", "status");
CREATE INDEX "business_matter_tasks_milestone_id_idx" ON "business_matter_tasks"("milestone_id");

ALTER TABLE "business_matter_stages"
  ADD CONSTRAINT "business_matter_stages_matter_id_fkey"
    FOREIGN KEY ("matter_id") REFERENCES "business_matters"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "business_matter_stages_owner_id_fkey"
    FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "business_matter_stages_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON UPDATE CASCADE;

ALTER TABLE "business_matter_milestones"
  ADD CONSTRAINT "business_matter_milestones_matter_id_fkey"
    FOREIGN KEY ("matter_id") REFERENCES "business_matters"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "business_matter_milestones_stage_id_fkey"
    FOREIGN KEY ("stage_id") REFERENCES "business_matter_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "business_matter_milestones_completed_by_id_fkey"
    FOREIGN KEY ("completed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "business_matter_milestones_owner_id_fkey"
    FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "business_matter_milestones_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON UPDATE CASCADE;

ALTER TABLE "business_matter_tasks"
  ADD CONSTRAINT "business_matter_tasks_stage_id_fkey"
    FOREIGN KEY ("stage_id") REFERENCES "business_matter_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "business_matter_tasks_milestone_id_fkey"
    FOREIGN KEY ("milestone_id") REFERENCES "business_matter_milestones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
