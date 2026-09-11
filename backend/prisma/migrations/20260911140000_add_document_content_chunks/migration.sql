CREATE TABLE "document_content_chunks" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "version_id" TEXT NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "source_ref" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "content_digest" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "document_content_chunks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "document_content_chunks_version_id_chunk_index_key" ON "document_content_chunks"("version_id", "chunk_index");
CREATE INDEX "document_content_chunks_document_id_version_id_idx" ON "document_content_chunks"("document_id", "version_id");
CREATE INDEX "document_content_chunks_content_digest_idx" ON "document_content_chunks"("content_digest");

ALTER TABLE "document_content_chunks"
  ADD CONSTRAINT "document_content_chunks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "document_content_chunks_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "document_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
