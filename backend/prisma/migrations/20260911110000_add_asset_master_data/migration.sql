CREATE TABLE "asset_types" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "parent_id" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "field_schema" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "asset_types_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "locations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "parent_id" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "business_matter_id" TEXT,
    "asset_type_id" TEXT NOT NULL,
    "department_id" TEXT,
    "location_id" TEXT,
    "asset_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "model" TEXT,
    "serial_number" TEXT,
    "supplier" TEXT,
    "purchase_date" TIMESTAMP(3),
    "purchase_amount" DECIMAL(15,2),
    "asset_status" TEXT NOT NULL DEFAULT 'active',
    "resource_status" TEXT NOT NULL DEFAULT 'available',
    "owner_user_id" TEXT,
    "using_user_id" TEXT,
    "custom_fields" JSONB NOT NULL DEFAULT '{}',
    "description" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "qr_token" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),
    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "asset_identifiers" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "identifier_type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "asset_identifiers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pending_assets" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "submitted_by" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "raw_payload" JSONB NOT NULL,
    "ai_fields" JSONB,
    "confidence" DOUBLE PRECISION,
    "duplicate_candidates" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "review_note" TEXT,
    "reviewed_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(3),
    CONSTRAINT "pending_assets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "asset_types_organization_id_code_key" ON "asset_types"("organization_id", "code");
CREATE INDEX "asset_types_organization_id_enabled_idx" ON "asset_types"("organization_id", "enabled");
CREATE INDEX "asset_types_parent_id_idx" ON "asset_types"("parent_id");
CREATE UNIQUE INDEX "locations_organization_id_code_key" ON "locations"("organization_id", "code");
CREATE INDEX "locations_organization_id_enabled_idx" ON "locations"("organization_id", "enabled");
CREATE INDEX "locations_parent_id_idx" ON "locations"("parent_id");
CREATE UNIQUE INDEX "assets_qr_token_key" ON "assets"("qr_token");
CREATE UNIQUE INDEX "assets_organization_id_asset_code_key" ON "assets"("organization_id", "asset_code");
CREATE UNIQUE INDEX "assets_organization_id_serial_number_key" ON "assets"("organization_id", "serial_number");
CREATE INDEX "assets_organization_id_asset_status_resource_status_idx" ON "assets"("organization_id", "asset_status", "resource_status");
CREATE INDEX "assets_organization_id_updated_at_idx" ON "assets"("organization_id", "updated_at");
CREATE INDEX "assets_business_matter_id_idx" ON "assets"("business_matter_id");
CREATE INDEX "assets_department_id_idx" ON "assets"("department_id");
CREATE INDEX "assets_location_id_idx" ON "assets"("location_id");
CREATE UNIQUE INDEX "asset_identifiers_identifier_type_value_key" ON "asset_identifiers"("identifier_type", "value");
CREATE UNIQUE INDEX "asset_identifiers_asset_id_identifier_type_primary_key" ON "asset_identifiers"("asset_id", "identifier_type") WHERE "is_primary" = true;
CREATE INDEX "asset_identifiers_asset_id_idx" ON "asset_identifiers"("asset_id");
CREATE INDEX "pending_assets_organization_id_status_created_at_idx" ON "pending_assets"("organization_id", "status", "created_at");
CREATE INDEX "pending_assets_submitted_by_idx" ON "pending_assets"("submitted_by");

ALTER TABLE "asset_types"
  ADD CONSTRAINT "asset_types_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "asset_types_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "asset_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "locations"
  ADD CONSTRAINT "locations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "locations_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "assets"
  ADD CONSTRAINT "assets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "assets_business_matter_id_fkey" FOREIGN KEY ("business_matter_id") REFERENCES "business_matters"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "assets_asset_type_id_fkey" FOREIGN KEY ("asset_type_id") REFERENCES "asset_types"("id") ON UPDATE CASCADE,
  ADD CONSTRAINT "assets_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "assets_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "assets_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "assets_using_user_id_fkey" FOREIGN KEY ("using_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "assets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON UPDATE CASCADE;

ALTER TABLE "asset_identifiers"
  ADD CONSTRAINT "asset_identifiers_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pending_assets"
  ADD CONSTRAINT "pending_assets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "pending_assets_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "users"("id") ON UPDATE CASCADE,
  ADD CONSTRAINT "pending_assets_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
