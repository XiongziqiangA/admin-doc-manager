ALTER TYPE "ApprovalBusinessType" ADD VALUE 'ASSET_EXIT';

CREATE TYPE "AssetInventoryScopeType" AS ENUM ('ORGANIZATION', 'DEPARTMENT', 'LOCATION', 'PROJECT', 'ASSET_TYPE', 'ASSET_LIST');
CREATE TYPE "AssetInventoryStatus" AS ENUM ('OPEN', 'COMPLETED', 'CANCELLED');
CREATE TYPE "AssetInventoryResult" AS ENUM ('NORMAL', 'SURPLUS', 'MISSING', 'LOCATION_MISMATCH', 'STATUS_MISMATCH', 'OWNER_MISMATCH');
CREATE TYPE "AssetMaintenanceType" AS ENUM ('REPAIR', 'MAINTENANCE', 'INSPECTION');
CREATE TYPE "AssetMaintenanceStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE "AssetAnomalyType" AS ENUM ('SURPLUS', 'MISSING', 'LOCATION_MISMATCH', 'STATUS_MISMATCH', 'OWNER_MISMATCH', 'DAMAGE', 'OTHER');
CREATE TYPE "AssetAnomalySeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "AssetAnomalyStatus" AS ENUM ('OPEN', 'RESOLVED');
CREATE TYPE "AssetExitType" AS ENUM ('SCRAPPED', 'LOST', 'SOLD', 'TRANSFERRED', 'DONATED', 'CROSS_COMPANY_TRANSFER');
CREATE TYPE "AssetExitStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

CREATE TABLE "asset_inventory_tasks" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "scope_type" "AssetInventoryScopeType" NOT NULL,
  "scope_value" JSONB,
  "planned_start" TIMESTAMP(3) NOT NULL,
  "planned_end" TIMESTAMP(3) NOT NULL,
  "owner_id" TEXT NOT NULL,
  "status" "AssetInventoryStatus" NOT NULL DEFAULT 'OPEN',
  "created_by_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  CONSTRAINT "asset_inventory_tasks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "asset_inventory_tasks_valid_range" CHECK ("planned_start" < "planned_end")
);

CREATE TABLE "asset_inventory_records" (
  "id" TEXT NOT NULL,
  "task_id" TEXT NOT NULL,
  "asset_id" TEXT NOT NULL,
  "checker_id" TEXT NOT NULL,
  "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "checked_location_id" TEXT,
  "checked_asset_status" TEXT,
  "checked_owner_id" TEXT,
  "result" "AssetInventoryResult" NOT NULL,
  "exception_types" JSONB NOT NULL DEFAULT '[]',
  "note" TEXT,
  CONSTRAINT "asset_inventory_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "asset_maintenance_records" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "asset_id" TEXT NOT NULL,
  "maintenance_type" "AssetMaintenanceType" NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "vendor" TEXT,
  "planned_at" TIMESTAMP(3),
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "cost" DECIMAL(15,2),
  "status" "AssetMaintenanceStatus" NOT NULL DEFAULT 'SCHEDULED',
  "resource_status_before" TEXT,
  "created_by_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "asset_maintenance_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "asset_maintenance_records_cost_nonnegative" CHECK ("cost" IS NULL OR "cost" >= 0)
);

CREATE TABLE "asset_anomalies" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "asset_id" TEXT NOT NULL,
  "type" "AssetAnomalyType" NOT NULL,
  "severity" "AssetAnomalySeverity" NOT NULL DEFAULT 'MEDIUM',
  "status" "AssetAnomalyStatus" NOT NULL DEFAULT 'OPEN',
  "source_type" TEXT,
  "source_id" TEXT,
  "description" TEXT NOT NULL,
  "assigned_to_id" TEXT,
  "resolution" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closed_at" TIMESTAMP(3),
  CONSTRAINT "asset_anomalies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "asset_exit_requests" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "asset_id" TEXT NOT NULL,
  "applicant_id" TEXT NOT NULL,
  "approval_id" TEXT,
  "exit_type" "AssetExitType" NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "AssetExitStatus" NOT NULL DEFAULT 'PENDING',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  CONSTRAINT "asset_exit_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "asset_inventory_tasks_organization_id_status_created_at_idx" ON "asset_inventory_tasks"("organization_id", "status", "created_at");
CREATE INDEX "asset_inventory_tasks_owner_id_status_idx" ON "asset_inventory_tasks"("owner_id", "status");
CREATE UNIQUE INDEX "asset_inventory_records_task_id_asset_id_key" ON "asset_inventory_records"("task_id", "asset_id");
CREATE INDEX "asset_inventory_records_asset_id_checked_at_idx" ON "asset_inventory_records"("asset_id", "checked_at");
CREATE INDEX "asset_inventory_records_checker_id_checked_at_idx" ON "asset_inventory_records"("checker_id", "checked_at");
CREATE INDEX "asset_maintenance_records_organization_id_status_created_at_idx" ON "asset_maintenance_records"("organization_id", "status", "created_at");
CREATE INDEX "asset_maintenance_records_asset_id_status_planned_at_idx" ON "asset_maintenance_records"("asset_id", "status", "planned_at");
CREATE INDEX "asset_anomalies_organization_id_status_created_at_idx" ON "asset_anomalies"("organization_id", "status", "created_at");
CREATE INDEX "asset_anomalies_asset_id_status_idx" ON "asset_anomalies"("asset_id", "status");
CREATE INDEX "asset_anomalies_source_type_source_id_idx" ON "asset_anomalies"("source_type", "source_id");
CREATE UNIQUE INDEX "asset_exit_requests_approval_id_key" ON "asset_exit_requests"("approval_id");
CREATE INDEX "asset_exit_requests_organization_id_status_created_at_idx" ON "asset_exit_requests"("organization_id", "status", "created_at");
CREATE INDEX "asset_exit_requests_asset_id_status_idx" ON "asset_exit_requests"("asset_id", "status");
CREATE INDEX "asset_exit_requests_applicant_id_status_idx" ON "asset_exit_requests"("applicant_id", "status");

ALTER TABLE "asset_inventory_tasks" ADD CONSTRAINT "asset_inventory_tasks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "asset_inventory_tasks" ADD CONSTRAINT "asset_inventory_tasks_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "asset_inventory_tasks" ADD CONSTRAINT "asset_inventory_tasks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "asset_inventory_records" ADD CONSTRAINT "asset_inventory_records_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "asset_inventory_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "asset_inventory_records" ADD CONSTRAINT "asset_inventory_records_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "asset_inventory_records" ADD CONSTRAINT "asset_inventory_records_checker_id_fkey" FOREIGN KEY ("checker_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "asset_inventory_records" ADD CONSTRAINT "asset_inventory_records_checked_location_id_fkey" FOREIGN KEY ("checked_location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "asset_maintenance_records" ADD CONSTRAINT "asset_maintenance_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "asset_maintenance_records" ADD CONSTRAINT "asset_maintenance_records_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "asset_maintenance_records" ADD CONSTRAINT "asset_maintenance_records_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "asset_anomalies" ADD CONSTRAINT "asset_anomalies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "asset_anomalies" ADD CONSTRAINT "asset_anomalies_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "asset_anomalies" ADD CONSTRAINT "asset_anomalies_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "asset_exit_requests" ADD CONSTRAINT "asset_exit_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "asset_exit_requests" ADD CONSTRAINT "asset_exit_requests_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "asset_exit_requests" ADD CONSTRAINT "asset_exit_requests_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "asset_exit_requests" ADD CONSTRAINT "asset_exit_requests_approval_id_fkey" FOREIGN KEY ("approval_id") REFERENCES "approvals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
