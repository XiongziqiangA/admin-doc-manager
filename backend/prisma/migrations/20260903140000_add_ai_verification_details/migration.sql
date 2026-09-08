ALTER TABLE "ai_provider_settings"
ADD COLUMN "last_test_status" TEXT,
ADD COLUMN "last_test_model" TEXT,
ADD COLUMN "last_test_duration_ms" INTEGER,
ADD COLUMN "last_test_endpoint" TEXT;
