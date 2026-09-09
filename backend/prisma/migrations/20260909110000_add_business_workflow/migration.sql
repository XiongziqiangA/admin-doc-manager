CREATE TYPE "BusinessTaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

CREATE TYPE "BusinessTaskPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

CREATE TYPE "BusinessFinanceKind" AS ENUM ('LOAN', 'REIMBURSEMENT');

CREATE TYPE "BusinessFinanceStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'PAID', 'SETTLED', 'REJECTED', 'CANCELLED');

CREATE TYPE "BusinessContractStatus" AS ENUM ('DRAFT', 'ACTIVE', 'EXPIRED', 'TERMINATED');

CREATE TYPE "BusinessActivityAction" AS ENUM (
    'MATTER_CREATED',
    'MATTER_UPDATED',
    'MATTER_DELETED',
    'TASK_CREATED',
    'TASK_UPDATED',
    'TASK_COMPLETED',
    'TASK_DELETED',
    'CONTRACT_UPDATED',
    'CONTRACT_DELETED',
    'FINANCE_CREATED',
    'FINANCE_UPDATED',
    'FINANCE_DELETED',
    'FINANCE_DOCUMENT_ATTACHED',
    'FINANCE_DOCUMENT_DETACHED'
);

CREATE TABLE "business_matter_tasks" (
    "id" TEXT NOT NULL,
    "matter_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "BusinessTaskStatus" NOT NULL DEFAULT 'TODO',
    "priority" "BusinessTaskPriority" NOT NULL DEFAULT 'NORMAL',
    "due_date" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "assignee_id" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "business_matter_tasks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "business_matter_contracts" (
    "id" TEXT NOT NULL,
    "matter_id" TEXT NOT NULL,
    "contract_no" TEXT,
    "party_name" TEXT NOT NULL,
    "signed_at" TIMESTAMP(3),
    "effective_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "renewal_notice_days" INTEGER NOT NULL DEFAULT 30,
    "amount" DECIMAL(15,2),
    "status" "BusinessContractStatus" NOT NULL DEFAULT 'DRAFT',
    "remark" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "business_matter_contracts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "business_matter_finance_records" (
    "id" TEXT NOT NULL,
    "matter_id" TEXT NOT NULL,
    "record_no" TEXT NOT NULL,
    "kind" "BusinessFinanceKind" NOT NULL,
    "status" "BusinessFinanceStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "occurred_at" TIMESTAMP(3),
    "counterparty" TEXT,
    "due_date" TIMESTAMP(3),
    "settled_at" TIMESTAMP(3),
    "remark" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "business_matter_finance_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "business_matter_finance_documents" (
    "record_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "version_id" TEXT,
    "relation_type" TEXT NOT NULL DEFAULT 'VOUCHER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "business_matter_finance_documents_pkey" PRIMARY KEY ("record_id", "document_id")
);

CREATE TABLE "business_matter_activities" (
    "id" TEXT NOT NULL,
    "matter_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "action" "BusinessActivityAction" NOT NULL,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "business_matter_activities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "business_matter_contracts_matter_id_key" ON "business_matter_contracts"("matter_id");
CREATE UNIQUE INDEX "business_matter_finance_records_record_no_key" ON "business_matter_finance_records"("record_no");
CREATE INDEX "business_matter_tasks_matter_id_status_idx" ON "business_matter_tasks"("matter_id", "status");
CREATE INDEX "business_matter_tasks_assignee_id_status_idx" ON "business_matter_tasks"("assignee_id", "status");
CREATE INDEX "business_matter_tasks_due_date_idx" ON "business_matter_tasks"("due_date");
CREATE INDEX "business_matter_tasks_deleted_at_idx" ON "business_matter_tasks"("deleted_at");
CREATE INDEX "business_matter_contracts_expires_at_status_idx" ON "business_matter_contracts"("expires_at", "status");
CREATE INDEX "business_matter_contracts_created_by_id_idx" ON "business_matter_contracts"("created_by_id");
CREATE INDEX "business_matter_finance_records_matter_id_kind_status_idx" ON "business_matter_finance_records"("matter_id", "kind", "status");
CREATE INDEX "business_matter_finance_records_due_date_idx" ON "business_matter_finance_records"("due_date");
CREATE INDEX "business_matter_finance_records_deleted_at_idx" ON "business_matter_finance_records"("deleted_at");
CREATE INDEX "business_matter_finance_documents_document_id_idx" ON "business_matter_finance_documents"("document_id");
CREATE INDEX "business_matter_finance_documents_version_id_idx" ON "business_matter_finance_documents"("version_id");
CREATE INDEX "business_matter_activities_matter_id_created_at_idx" ON "business_matter_activities"("matter_id", "created_at");
CREATE INDEX "business_matter_activities_actor_id_created_at_idx" ON "business_matter_activities"("actor_id", "created_at");

ALTER TABLE "business_matter_tasks" ADD CONSTRAINT "business_matter_tasks_matter_id_fkey" FOREIGN KEY ("matter_id") REFERENCES "business_matters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "business_matter_tasks" ADD CONSTRAINT "business_matter_tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "business_matter_tasks" ADD CONSTRAINT "business_matter_tasks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON UPDATE CASCADE;
ALTER TABLE "business_matter_contracts" ADD CONSTRAINT "business_matter_contracts_matter_id_fkey" FOREIGN KEY ("matter_id") REFERENCES "business_matters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "business_matter_contracts" ADD CONSTRAINT "business_matter_contracts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON UPDATE CASCADE;
ALTER TABLE "business_matter_finance_records" ADD CONSTRAINT "business_matter_finance_records_matter_id_fkey" FOREIGN KEY ("matter_id") REFERENCES "business_matters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "business_matter_finance_records" ADD CONSTRAINT "business_matter_finance_records_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON UPDATE CASCADE;
ALTER TABLE "business_matter_finance_documents" ADD CONSTRAINT "business_matter_finance_documents_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "business_matter_finance_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "business_matter_finance_documents" ADD CONSTRAINT "business_matter_finance_documents_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "business_matter_finance_documents" ADD CONSTRAINT "business_matter_finance_documents_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "document_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "business_matter_activities" ADD CONSTRAINT "business_matter_activities_matter_id_fkey" FOREIGN KEY ("matter_id") REFERENCES "business_matters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "business_matter_activities" ADD CONSTRAINT "business_matter_activities_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON UPDATE CASCADE;
