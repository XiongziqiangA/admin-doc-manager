CREATE TYPE "FinanceAnalysisJobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

CREATE TYPE "FinanceSuggestionStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');

CREATE TYPE "FinanceAnalysisSource" AS ENUM ('RULES', 'AI');

CREATE TABLE "document_analyses" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "version_id" TEXT NOT NULL,
    "source" "FinanceAnalysisSource" NOT NULL,
    "status" TEXT NOT NULL,
    "extracted_fields" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION,
    "provider" TEXT,
    "model" TEXT,
    "prompt_version" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "document_analyses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "finance_analysis_jobs" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "status" "FinanceAnalysisJobStatus" NOT NULL DEFAULT 'PENDING',
    "total_count" INTEGER NOT NULL DEFAULT 0,
    "processed_count" INTEGER NOT NULL DEFAULT 0,
    "provider" TEXT,
    "model" TEXT,
    "prompt_version" TEXT,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "finance_analysis_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "finance_package_suggestions" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "version_id" TEXT NOT NULL,
    "suggested_group_name" TEXT NOT NULL,
    "suggested_file_name" TEXT NOT NULL,
    "material_type" "FinanceMaterialType" NOT NULL DEFAULT 'OTHER',
    "extracted_fields" JSONB NOT NULL,
    "grouping_key" TEXT,
    "confidence" DOUBLE PRECISION,
    "reasons" JSONB NOT NULL,
    "status" "FinanceSuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "confirmed_group_id" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "finance_package_suggestions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "document_analyses_version_id_key" ON "document_analyses"("version_id");
CREATE INDEX "document_analyses_document_id_idx" ON "document_analyses"("document_id");
CREATE INDEX "document_analyses_status_idx" ON "document_analyses"("status");
CREATE INDEX "finance_analysis_jobs_task_id_created_at_idx" ON "finance_analysis_jobs"("task_id", "created_at");
CREATE INDEX "finance_analysis_jobs_status_idx" ON "finance_analysis_jobs"("status");
CREATE INDEX "finance_analysis_jobs_created_by_id_idx" ON "finance_analysis_jobs"("created_by_id");
CREATE UNIQUE INDEX "finance_package_suggestions_job_id_document_id_key" ON "finance_package_suggestions"("job_id", "document_id");
CREATE INDEX "finance_package_suggestions_job_id_status_idx" ON "finance_package_suggestions"("job_id", "status");
CREATE INDEX "finance_package_suggestions_document_id_idx" ON "finance_package_suggestions"("document_id");
CREATE INDEX "finance_package_suggestions_version_id_idx" ON "finance_package_suggestions"("version_id");

ALTER TABLE "document_analyses" ADD CONSTRAINT "document_analyses_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document_analyses" ADD CONSTRAINT "document_analyses_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "document_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "finance_analysis_jobs" ADD CONSTRAINT "finance_analysis_jobs_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "finance_package_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "finance_analysis_jobs" ADD CONSTRAINT "finance_analysis_jobs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON UPDATE CASCADE;
ALTER TABLE "finance_package_suggestions" ADD CONSTRAINT "finance_package_suggestions_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "finance_analysis_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "finance_package_suggestions" ADD CONSTRAINT "finance_package_suggestions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "finance_package_suggestions" ADD CONSTRAINT "finance_package_suggestions_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "document_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
