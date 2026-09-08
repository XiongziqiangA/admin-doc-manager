ALTER TABLE "ai_provider_settings"
ADD COLUMN "last_test_at" TIMESTAMP(3),
ADD COLUMN "last_test_ok" BOOLEAN,
ADD COLUMN "last_test_message" TEXT;
