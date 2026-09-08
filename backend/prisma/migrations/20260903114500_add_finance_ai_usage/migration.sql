ALTER TABLE "finance_analysis_jobs"
ADD COLUMN "request_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "input_tokens" INTEGER,
ADD COLUMN "output_tokens" INTEGER,
ADD COLUMN "total_tokens" INTEGER,
ADD COLUMN "duration_ms" INTEGER;
