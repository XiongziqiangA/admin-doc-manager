-- CreateEnum
CREATE TYPE "FinancePackageStatus" AS ENUM ('DRAFT', 'READY', 'EXPORTED');

-- CreateEnum
CREATE TYPE "FinanceMaterialType" AS ENUM ('REIMBURSEMENT_FORM', 'INVOICE', 'PAYMENT_FORM', 'TICKET', 'CONTRACT', 'BANK_RECEIPT', 'OTHER');

-- CreateTable
CREATE TABLE "finance_package_tasks" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "root_folder_name" TEXT NOT NULL,
    "status" "FinancePackageStatus" NOT NULL DEFAULT 'DRAFT',
    "include_manifest" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT NOT NULL,
    "last_exported_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_package_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_package_groups" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parent_id" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_package_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_package_items" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "group_id" TEXT,
    "document_id" TEXT NOT NULL,
    "version_id" TEXT NOT NULL,
    "material_type" "FinanceMaterialType" NOT NULL DEFAULT 'OTHER',
    "export_file_name" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "remark" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_package_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_package_exports" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "exported_by_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_count" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_package_exports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "finance_package_tasks_period_idx" ON "finance_package_tasks"("period");
CREATE INDEX "finance_package_tasks_status_idx" ON "finance_package_tasks"("status");
CREATE INDEX "finance_package_tasks_created_by_id_idx" ON "finance_package_tasks"("created_by_id");
CREATE INDEX "finance_package_groups_task_id_sort_idx" ON "finance_package_groups"("task_id", "sort");
CREATE INDEX "finance_package_groups_parent_id_idx" ON "finance_package_groups"("parent_id");
CREATE UNIQUE INDEX "finance_package_items_task_id_document_id_key" ON "finance_package_items"("task_id", "document_id");
CREATE INDEX "finance_package_items_task_id_group_id_sort_idx" ON "finance_package_items"("task_id", "group_id", "sort");
CREATE INDEX "finance_package_items_document_id_idx" ON "finance_package_items"("document_id");
CREATE INDEX "finance_package_items_version_id_idx" ON "finance_package_items"("version_id");
CREATE INDEX "finance_package_exports_task_id_created_at_idx" ON "finance_package_exports"("task_id", "created_at");
CREATE INDEX "finance_package_exports_exported_by_id_idx" ON "finance_package_exports"("exported_by_id");

-- AddForeignKey
ALTER TABLE "finance_package_tasks" ADD CONSTRAINT "finance_package_tasks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_package_groups" ADD CONSTRAINT "finance_package_groups_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "finance_package_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "finance_package_groups" ADD CONSTRAINT "finance_package_groups_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "finance_package_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "finance_package_items" ADD CONSTRAINT "finance_package_items_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "finance_package_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "finance_package_items" ADD CONSTRAINT "finance_package_items_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "finance_package_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "finance_package_items" ADD CONSTRAINT "finance_package_items_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "finance_package_items" ADD CONSTRAINT "finance_package_items_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "document_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "finance_package_exports" ADD CONSTRAINT "finance_package_exports_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "finance_package_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "finance_package_exports" ADD CONSTRAINT "finance_package_exports_exported_by_id_fkey" FOREIGN KEY ("exported_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
