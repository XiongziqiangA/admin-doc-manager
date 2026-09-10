ALTER TYPE "BusinessActivityAction"
  ADD VALUE 'TASK_DOCUMENT_ATTACHED';
ALTER TYPE "BusinessActivityAction"
  ADD VALUE 'TASK_DOCUMENT_DETACHED';
ALTER TYPE "BusinessActivityAction"
  ADD VALUE 'FOLLOW_UP_DOCUMENT_ATTACHED';
ALTER TYPE "BusinessActivityAction"
  ADD VALUE 'FOLLOW_UP_DOCUMENT_DETACHED';

ALTER TABLE "business_matter_tasks"
  ADD COLUMN "assignee_name" TEXT;

ALTER TABLE "business_matter_follow_ups"
  ADD COLUMN "next_assignee_name" TEXT;

ALTER TABLE "business_matter_finance_records"
  ADD COLUMN "applicant_name" TEXT,
  ADD COLUMN "handler_name" TEXT,
  ADD COLUMN "approver_name" TEXT,
  ADD COLUMN "payer_name" TEXT,
  ADD COLUMN "settlement_owner_name" TEXT;

CREATE INDEX "business_matter_tasks_assignee_name_idx" ON "business_matter_tasks"("assignee_name");
CREATE INDEX "business_matter_follow_ups_next_assignee_name_idx" ON "business_matter_follow_ups"("next_assignee_name");

CREATE TABLE "business_matter_task_documents" (
    "task_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "version_id" TEXT,
    "relation_type" TEXT NOT NULL DEFAULT 'ATTACHMENT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "business_matter_task_documents_pkey" PRIMARY KEY ("task_id", "document_id")
);

CREATE TABLE "business_matter_follow_up_documents" (
    "follow_up_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "version_id" TEXT,
    "relation_type" TEXT NOT NULL DEFAULT 'ATTACHMENT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "business_matter_follow_up_documents_pkey" PRIMARY KEY ("follow_up_id", "document_id")
);

CREATE INDEX "business_matter_task_documents_document_id_idx" ON "business_matter_task_documents"("document_id");
CREATE INDEX "business_matter_task_documents_version_id_idx" ON "business_matter_task_documents"("version_id");
CREATE INDEX "business_matter_follow_up_documents_document_id_idx" ON "business_matter_follow_up_documents"("document_id");
CREATE INDEX "business_matter_follow_up_documents_version_id_idx" ON "business_matter_follow_up_documents"("version_id");

ALTER TABLE "business_matter_task_documents"
  ADD CONSTRAINT "business_matter_task_documents_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "business_matter_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "business_matter_task_documents_document_id_fkey"
    FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "business_matter_task_documents_version_id_fkey"
    FOREIGN KEY ("version_id") REFERENCES "document_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "business_matter_follow_up_documents"
  ADD CONSTRAINT "business_matter_follow_up_documents_follow_up_id_fkey"
    FOREIGN KEY ("follow_up_id") REFERENCES "business_matter_follow_ups"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "business_matter_follow_up_documents_document_id_fkey"
    FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "business_matter_follow_up_documents_version_id_fkey"
    FOREIGN KEY ("version_id") REFERENCES "document_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
