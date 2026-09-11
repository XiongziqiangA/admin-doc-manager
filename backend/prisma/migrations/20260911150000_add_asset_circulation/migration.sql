CREATE TYPE "AssetReservationStatus" AS ENUM ('PENDING', 'APPROVED', 'ACTIVE', 'CANCELLED', 'REJECTED', 'EXPIRED');
CREATE TYPE "AssetBorrowStatus" AS ENUM ('REQUESTED', 'APPROVED', 'ACTIVE', 'RETURN_PENDING', 'RETURNED', 'REJECTED', 'CANCELLED');
CREATE TYPE "AssetHandoverType" AS ENUM ('CHECKOUT', 'RETURN', 'TRANSFER');
CREATE TYPE "AssetHandoverStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');
CREATE TYPE "AssetTransferStatus" AS ENUM ('PENDING', 'APPROVED', 'IN_TRANSIT', 'COMPLETED', 'REJECTED', 'CANCELLED');
CREATE TYPE "ApprovalBusinessType" AS ENUM ('ASSET_RESERVATION', 'ASSET_BORROW', 'ASSET_TRANSFER');
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TYPE "ApprovalActionType" AS ENUM ('SUBMIT', 'APPROVE', 'REJECT', 'CANCEL');
CREATE TYPE "OperationResult" AS ENUM ('SUCCESS', 'FAILURE');

CREATE TABLE "asset_reservations" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "asset_id" TEXT NOT NULL,
  "applicant_id" TEXT NOT NULL,
  "business_matter_id" TEXT,
  "approval_id" TEXT,
  "start_at" TIMESTAMP(3) NOT NULL,
  "end_at" TIMESTAMP(3) NOT NULL,
  "purpose" TEXT NOT NULL,
  "status" "AssetReservationStatus" NOT NULL DEFAULT 'PENDING',
  "cancel_reason" TEXT,
  "cancelled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "asset_reservations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "asset_reservations_valid_range" CHECK ("start_at" < "end_at")
);

CREATE TABLE "asset_borrow_records" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "asset_id" TEXT NOT NULL,
  "applicant_id" TEXT NOT NULL,
  "business_matter_id" TEXT,
  "approval_id" TEXT,
  "borrow_start" TIMESTAMP(3) NOT NULL,
  "borrow_end" TIMESTAMP(3) NOT NULL,
  "actual_return_at" TIMESTAMP(3),
  "purpose" TEXT NOT NULL,
  "note" TEXT,
  "status" "AssetBorrowStatus" NOT NULL DEFAULT 'REQUESTED',
  "cancel_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "asset_borrow_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "asset_borrow_records_valid_range" CHECK ("borrow_start" < "borrow_end")
);

CREATE TABLE "asset_transfers" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "asset_id" TEXT NOT NULL,
  "approval_id" TEXT,
  "from_department_id" TEXT,
  "to_department_id" TEXT,
  "from_location_id" TEXT,
  "to_location_id" TEXT,
  "from_owner_id" TEXT,
  "to_owner_id" TEXT,
  "reason" TEXT NOT NULL,
  "status" "AssetTransferStatus" NOT NULL DEFAULT 'PENDING',
  "created_by_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  CONSTRAINT "asset_transfers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "asset_handover_records" (
  "id" TEXT NOT NULL,
  "asset_id" TEXT NOT NULL,
  "borrow_id" TEXT,
  "transfer_id" TEXT,
  "from_user_id" TEXT,
  "to_user_id" TEXT,
  "handover_type" "AssetHandoverType" NOT NULL,
  "items_snapshot" JSONB NOT NULL DEFAULT '[]',
  "note" TEXT,
  "status" "AssetHandoverStatus" NOT NULL DEFAULT 'DRAFT',
  "created_by_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmed_at" TIMESTAMP(3),
  CONSTRAINT "asset_handover_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "approvals" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "business_type" "ApprovalBusinessType" NOT NULL,
  "business_id" TEXT NOT NULL,
  "applicant_id" TEXT NOT NULL,
  "assigned_to_id" TEXT,
  "current_node" TEXT NOT NULL DEFAULT 'ADMIN_REVIEW',
  "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "comment" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  CONSTRAINT "approvals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "approval_actions" (
  "id" TEXT NOT NULL,
  "approval_id" TEXT NOT NULL,
  "actor_id" TEXT NOT NULL,
  "action" "ApprovalActionType" NOT NULL,
  "comment" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "approval_actions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "asset_events" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "asset_id" TEXT NOT NULL,
  "actor_id" TEXT,
  "event_type" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "asset_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_logs" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "actor_id" TEXT,
  "action" TEXT NOT NULL,
  "target_type" TEXT NOT NULL,
  "target_id" TEXT NOT NULL,
  "before_value" JSONB,
  "after_value" JSONB,
  "result" "OperationResult" NOT NULL DEFAULT 'SUCCESS',
  "request_id" TEXT,
  "ip_address" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "idempotency_records" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "request_digest" TEXT NOT NULL,
  "response_body" JSONB,
  "response_status" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "asset_reservations_approval_id_key" ON "asset_reservations"("approval_id");
CREATE INDEX "asset_reservations_organization_id_status_created_at_idx" ON "asset_reservations"("organization_id", "status", "created_at");
CREATE INDEX "asset_reservations_asset_id_start_at_end_at_status_idx" ON "asset_reservations"("asset_id", "start_at", "end_at", "status");
CREATE INDEX "asset_reservations_applicant_id_status_idx" ON "asset_reservations"("applicant_id", "status");
CREATE INDEX "asset_reservations_business_matter_id_idx" ON "asset_reservations"("business_matter_id");
CREATE UNIQUE INDEX "asset_borrow_records_approval_id_key" ON "asset_borrow_records"("approval_id");
CREATE INDEX "asset_borrow_records_organization_id_status_created_at_idx" ON "asset_borrow_records"("organization_id", "status", "created_at");
CREATE INDEX "asset_borrow_records_asset_id_borrow_start_borrow_end_status_idx" ON "asset_borrow_records"("asset_id", "borrow_start", "borrow_end", "status");
CREATE INDEX "asset_borrow_records_applicant_id_status_idx" ON "asset_borrow_records"("applicant_id", "status");
CREATE INDEX "asset_borrow_records_business_matter_id_idx" ON "asset_borrow_records"("business_matter_id");
CREATE UNIQUE INDEX "asset_transfers_approval_id_key" ON "asset_transfers"("approval_id");
CREATE INDEX "asset_transfers_organization_id_status_created_at_idx" ON "asset_transfers"("organization_id", "status", "created_at");
CREATE INDEX "asset_transfers_asset_id_status_idx" ON "asset_transfers"("asset_id", "status");
CREATE INDEX "asset_handover_records_asset_id_created_at_idx" ON "asset_handover_records"("asset_id", "created_at");
CREATE INDEX "asset_handover_records_borrow_id_idx" ON "asset_handover_records"("borrow_id");
CREATE INDEX "asset_handover_records_transfer_id_idx" ON "asset_handover_records"("transfer_id");
CREATE UNIQUE INDEX "approvals_organization_id_business_type_business_id_key" ON "approvals"("organization_id", "business_type", "business_id");
CREATE INDEX "approvals_organization_id_status_created_at_idx" ON "approvals"("organization_id", "status", "created_at");
CREATE INDEX "approvals_applicant_id_status_idx" ON "approvals"("applicant_id", "status");
CREATE INDEX "approvals_assigned_to_id_status_idx" ON "approvals"("assigned_to_id", "status");
CREATE INDEX "approval_actions_approval_id_created_at_idx" ON "approval_actions"("approval_id", "created_at");
CREATE INDEX "approval_actions_actor_id_created_at_idx" ON "approval_actions"("actor_id", "created_at");
CREATE INDEX "asset_events_organization_id_created_at_idx" ON "asset_events"("organization_id", "created_at");
CREATE INDEX "asset_events_asset_id_created_at_idx" ON "asset_events"("asset_id", "created_at");
CREATE INDEX "audit_logs_organization_id_created_at_idx" ON "audit_logs"("organization_id", "created_at");
CREATE INDEX "audit_logs_target_type_target_id_created_at_idx" ON "audit_logs"("target_type", "target_id", "created_at");
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at");
CREATE UNIQUE INDEX "idempotency_records_organization_id_user_id_operation_key_key" ON "idempotency_records"("organization_id", "user_id", "operation", "key");
CREATE INDEX "idempotency_records_created_at_idx" ON "idempotency_records"("created_at");

ALTER TABLE "asset_reservations" ADD CONSTRAINT "asset_reservations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "asset_reservations" ADD CONSTRAINT "asset_reservations_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "asset_reservations" ADD CONSTRAINT "asset_reservations_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "asset_reservations" ADD CONSTRAINT "asset_reservations_business_matter_id_fkey" FOREIGN KEY ("business_matter_id") REFERENCES "business_matters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "asset_reservations" ADD CONSTRAINT "asset_reservations_approval_id_fkey" FOREIGN KEY ("approval_id") REFERENCES "approvals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "asset_borrow_records" ADD CONSTRAINT "asset_borrow_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "asset_borrow_records" ADD CONSTRAINT "asset_borrow_records_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "asset_borrow_records" ADD CONSTRAINT "asset_borrow_records_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "asset_borrow_records" ADD CONSTRAINT "asset_borrow_records_business_matter_id_fkey" FOREIGN KEY ("business_matter_id") REFERENCES "business_matters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "asset_borrow_records" ADD CONSTRAINT "asset_borrow_records_approval_id_fkey" FOREIGN KEY ("approval_id") REFERENCES "approvals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "asset_transfers" ADD CONSTRAINT "asset_transfers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "asset_transfers" ADD CONSTRAINT "asset_transfers_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "asset_transfers" ADD CONSTRAINT "asset_transfers_approval_id_fkey" FOREIGN KEY ("approval_id") REFERENCES "approvals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "asset_transfers" ADD CONSTRAINT "asset_transfers_from_department_id_fkey" FOREIGN KEY ("from_department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "asset_transfers" ADD CONSTRAINT "asset_transfers_to_department_id_fkey" FOREIGN KEY ("to_department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "asset_transfers" ADD CONSTRAINT "asset_transfers_from_location_id_fkey" FOREIGN KEY ("from_location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "asset_transfers" ADD CONSTRAINT "asset_transfers_to_location_id_fkey" FOREIGN KEY ("to_location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "asset_transfers" ADD CONSTRAINT "asset_transfers_from_owner_id_fkey" FOREIGN KEY ("from_owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "asset_transfers" ADD CONSTRAINT "asset_transfers_to_owner_id_fkey" FOREIGN KEY ("to_owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "asset_transfers" ADD CONSTRAINT "asset_transfers_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "asset_handover_records" ADD CONSTRAINT "asset_handover_records_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "asset_handover_records" ADD CONSTRAINT "asset_handover_records_borrow_id_fkey" FOREIGN KEY ("borrow_id") REFERENCES "asset_borrow_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "asset_handover_records" ADD CONSTRAINT "asset_handover_records_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "asset_transfers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "asset_handover_records" ADD CONSTRAINT "asset_handover_records_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "asset_handover_records" ADD CONSTRAINT "asset_handover_records_to_user_id_fkey" FOREIGN KEY ("to_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "asset_handover_records" ADD CONSTRAINT "asset_handover_records_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "approval_actions" ADD CONSTRAINT "approval_actions_approval_id_fkey" FOREIGN KEY ("approval_id") REFERENCES "approvals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "approval_actions" ADD CONSTRAINT "approval_actions_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "asset_events" ADD CONSTRAINT "asset_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "asset_events" ADD CONSTRAINT "asset_events_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "asset_events" ADD CONSTRAINT "asset_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "asset_reservations"
  ADD CONSTRAINT "asset_reservations_no_time_overlap"
  EXCLUDE USING gist (
    "asset_id" WITH =,
    tsrange("start_at", "end_at", '[)') WITH &&
  ) WHERE ("status" IN ('PENDING', 'APPROVED', 'ACTIVE'));
