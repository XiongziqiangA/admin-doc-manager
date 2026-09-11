CREATE TABLE "asset_documents" (
    "organization_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "asset_documents_pkey" PRIMARY KEY ("asset_id", "document_id")
);

CREATE INDEX "asset_documents_organization_id_document_id_idx" ON "asset_documents"("organization_id", "document_id");
CREATE INDEX "asset_documents_document_id_idx" ON "asset_documents"("document_id");

ALTER TABLE "asset_documents"
  ADD CONSTRAINT "asset_documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "asset_documents_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "asset_documents_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
