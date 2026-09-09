CREATE TYPE "BusinessMatterType" AS ENUM ('PROJECT', 'CONTRACT', 'REIMBURSEMENT', 'LOAN', 'PROCUREMENT', 'OTHER');

CREATE TYPE "BusinessMatterStatus" AS ENUM ('PLANNING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

CREATE TABLE "business_matters" (
    "id" TEXT NOT NULL,
    "matter_no" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "BusinessMatterType" NOT NULL,
    "status" "BusinessMatterStatus" NOT NULL DEFAULT 'PLANNING',
    "parent_id" TEXT,
    "owner_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "department_id" TEXT,
    "partner_id" TEXT,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "amount" DECIMAL(15,2),
    "remark" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "business_matters_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "business_matter_documents" (
    "matter_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "version_id" TEXT,
    "relation_type" TEXT NOT NULL DEFAULT 'REFERENCE',
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "business_matter_documents_pkey" PRIMARY KEY ("matter_id", "document_id")
);

CREATE UNIQUE INDEX "business_matters_matter_no_key" ON "business_matters"("matter_no");
CREATE INDEX "business_matters_type_idx" ON "business_matters"("type");
CREATE INDEX "business_matters_status_idx" ON "business_matters"("status");
CREATE INDEX "business_matters_parent_id_idx" ON "business_matters"("parent_id");
CREATE INDEX "business_matters_owner_id_idx" ON "business_matters"("owner_id");
CREATE INDEX "business_matters_department_id_idx" ON "business_matters"("department_id");
CREATE INDEX "business_matters_partner_id_idx" ON "business_matters"("partner_id");
CREATE INDEX "business_matters_deleted_at_idx" ON "business_matters"("deleted_at");
CREATE INDEX "business_matter_documents_document_id_idx" ON "business_matter_documents"("document_id");
CREATE INDEX "business_matter_documents_version_id_idx" ON "business_matter_documents"("version_id");

ALTER TABLE "business_matters" ADD CONSTRAINT "business_matters_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "business_matters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "business_matters" ADD CONSTRAINT "business_matters_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON UPDATE CASCADE;
ALTER TABLE "business_matters" ADD CONSTRAINT "business_matters_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON UPDATE CASCADE;
ALTER TABLE "business_matters" ADD CONSTRAINT "business_matters_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "business_matters" ADD CONSTRAINT "business_matters_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "business_matter_documents" ADD CONSTRAINT "business_matter_documents_matter_id_fkey" FOREIGN KEY ("matter_id") REFERENCES "business_matters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "business_matter_documents" ADD CONSTRAINT "business_matter_documents_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "business_matter_documents" ADD CONSTRAINT "business_matter_documents_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "document_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
