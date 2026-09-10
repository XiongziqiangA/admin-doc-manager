CREATE TYPE "BusinessIssueKind" AS ENUM ('RISK', 'ISSUE');
CREATE TYPE "BusinessIssueSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "BusinessIssueStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED');

ALTER TYPE "BusinessActivityAction"
  ADD VALUE 'ISSUE_CREATED';
ALTER TYPE "BusinessActivityAction"
  ADD VALUE 'ISSUE_UPDATED';
ALTER TYPE "BusinessActivityAction"
  ADD VALUE 'ISSUE_DELETED';
ALTER TYPE "BusinessActivityAction"
  ADD VALUE 'ISSUE_DOCUMENT_ATTACHED';
ALTER TYPE "BusinessActivityAction"
  ADD VALUE 'ISSUE_DOCUMENT_DETACHED';

CREATE TABLE "business_matter_issues" (
    "id" TEXT NOT NULL,
    "matter_id" TEXT NOT NULL,
    "kind" "BusinessIssueKind" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "severity" "BusinessIssueSeverity" NOT NULL DEFAULT 'MEDIUM',
    "status" "BusinessIssueStatus" NOT NULL DEFAULT 'OPEN',
    "owner_id" TEXT,
    "owner_name" TEXT,
    "due_date" TIMESTAMP(3),
    "resolution" TEXT,
    "resolved_at" TIMESTAMP(3),
    "resolved_by_id" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "business_matter_issues_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "business_matter_issue_documents" (
    "issue_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "version_id" TEXT,
    "relation_type" TEXT NOT NULL DEFAULT 'ATTACHMENT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "business_matter_issue_documents_pkey" PRIMARY KEY ("issue_id", "document_id")
);

CREATE INDEX "business_matter_issues_matter_id_kind_status_idx"
  ON "business_matter_issues"("matter_id", "kind", "status");
CREATE INDEX "business_matter_issues_owner_id_status_idx"
  ON "business_matter_issues"("owner_id", "status");
CREATE INDEX "business_matter_issues_due_date_status_idx"
  ON "business_matter_issues"("due_date", "status");
CREATE INDEX "business_matter_issues_deleted_at_idx"
  ON "business_matter_issues"("deleted_at");
CREATE INDEX "business_matter_issue_documents_document_id_idx"
  ON "business_matter_issue_documents"("document_id");
CREATE INDEX "business_matter_issue_documents_version_id_idx"
  ON "business_matter_issue_documents"("version_id");

ALTER TABLE "business_matter_issues"
  ADD CONSTRAINT "business_matter_issues_matter_id_fkey"
    FOREIGN KEY ("matter_id") REFERENCES "business_matters"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "business_matter_issues_owner_id_fkey"
    FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "business_matter_issues_resolved_by_id_fkey"
    FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "business_matter_issues_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON UPDATE CASCADE;

ALTER TABLE "business_matter_issue_documents"
  ADD CONSTRAINT "business_matter_issue_documents_issue_id_fkey"
    FOREIGN KEY ("issue_id") REFERENCES "business_matter_issues"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "business_matter_issue_documents_document_id_fkey"
    FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "business_matter_issue_documents_version_id_fkey"
    FOREIGN KEY ("version_id") REFERENCES "document_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
