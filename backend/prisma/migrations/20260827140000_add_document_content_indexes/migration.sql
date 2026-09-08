-- CreateTable
CREATE TABLE "document_content_indexes" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "version_id" TEXT NOT NULL,
    "extracted_text" TEXT NOT NULL,
    "text_length" INTEGER NOT NULL,
    "parser" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "embedding" JSONB,
    "embedding_model" TEXT,
    "error_message" TEXT,
    "indexed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_content_indexes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "document_content_indexes_version_id_key" ON "document_content_indexes"("version_id");

-- CreateIndex
CREATE INDEX "document_content_indexes_document_id_idx" ON "document_content_indexes"("document_id");

-- CreateIndex
CREATE INDEX "document_content_indexes_status_idx" ON "document_content_indexes"("status");

-- AddForeignKey
ALTER TABLE "document_content_indexes" ADD CONSTRAINT "document_content_indexes_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_content_indexes" ADD CONSTRAINT "document_content_indexes_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "document_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
