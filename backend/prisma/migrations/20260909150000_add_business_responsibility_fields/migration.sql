ALTER TABLE "business_matter_tasks"
  ADD COLUMN "progress" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "started_at" TIMESTAMP(3),
  ADD COLUMN "completed_by_id" TEXT,
  ADD COLUMN "completion_note" TEXT,
  ADD COLUMN "cancelled_by_id" TEXT,
  ADD COLUMN "cancellation_reason" TEXT;

ALTER TABLE "business_matter_finance_records"
  ADD COLUMN "applicant_id" TEXT,
  ADD COLUMN "handler_id" TEXT,
  ADD COLUMN "approver_id" TEXT,
  ADD COLUMN "payer_id" TEXT,
  ADD COLUMN "settlement_owner_id" TEXT,
  ADD COLUMN "approved_at" TIMESTAMP(3),
  ADD COLUMN "approved_by_id" TEXT,
  ADD COLUMN "paid_at" TIMESTAMP(3),
  ADD COLUMN "paid_by_id" TEXT,
  ADD COLUMN "rejected_at" TIMESTAMP(3),
  ADD COLUMN "rejected_by_id" TEXT,
  ADD COLUMN "rejection_reason" TEXT,
  ADD COLUMN "settlement_note" TEXT;

UPDATE "business_matter_finance_records"
SET "applicant_id" = "created_by_id",
    "handler_id" = "created_by_id"
WHERE "applicant_id" IS NULL OR "handler_id" IS NULL;

UPDATE "business_matter_tasks"
SET "progress" = CASE WHEN "status" = 'COMPLETED' THEN 100 ELSE 0 END
WHERE "progress" = 0;

CREATE INDEX "business_matter_tasks_completed_by_id_idx" ON "business_matter_tasks"("completed_by_id");
CREATE INDEX "business_matter_tasks_cancelled_by_id_idx" ON "business_matter_tasks"("cancelled_by_id");
CREATE INDEX "business_matter_finance_records_applicant_id_idx" ON "business_matter_finance_records"("applicant_id");
CREATE INDEX "business_matter_finance_records_handler_id_idx" ON "business_matter_finance_records"("handler_id");
CREATE INDEX "business_matter_finance_records_approver_id_idx" ON "business_matter_finance_records"("approver_id");
CREATE INDEX "business_matter_finance_records_payer_id_idx" ON "business_matter_finance_records"("payer_id");
CREATE INDEX "business_matter_finance_records_settlement_owner_id_idx" ON "business_matter_finance_records"("settlement_owner_id");

ALTER TABLE "business_matter_tasks"
  ADD CONSTRAINT "business_matter_tasks_completed_by_id_fkey"
  FOREIGN KEY ("completed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "business_matter_tasks_cancelled_by_id_fkey"
  FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "business_matter_finance_records"
  ADD CONSTRAINT "business_matter_finance_records_applicant_id_fkey"
  FOREIGN KEY ("applicant_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "business_matter_finance_records_handler_id_fkey"
  FOREIGN KEY ("handler_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "business_matter_finance_records_approver_id_fkey"
  FOREIGN KEY ("approver_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "business_matter_finance_records_payer_id_fkey"
  FOREIGN KEY ("payer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "business_matter_finance_records_settlement_owner_id_fkey"
  FOREIGN KEY ("settlement_owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "business_matter_finance_records_approved_by_id_fkey"
  FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "business_matter_finance_records_paid_by_id_fkey"
  FOREIGN KEY ("paid_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "business_matter_finance_records_rejected_by_id_fkey"
  FOREIGN KEY ("rejected_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
