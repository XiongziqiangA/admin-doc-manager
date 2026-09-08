import { Injectable, Optional } from "@nestjs/common";
import { DocumentStatus, Prisma } from "@prisma/client";

import { StorageService } from "../documents/storage.service";
import { PrismaService } from "../prisma/prisma.service";
import { DocumentContentParserService } from "./document-content.parser";
import { CONTENT_INDEX_STATUS, ExtractedDocumentContent } from "./document-content.types";
import { EmbeddingService } from "./embedding.service";

@Injectable()
export class DocumentContentIndexService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly parser: DocumentContentParserService,
    @Optional() private readonly embeddingService?: EmbeddingService,
  ) {}

  async indexVersion(versionId: string) {
    const version = await this.prisma.documentVersion.findUnique({
      where: { id: versionId },
      select: { id: true, documentId: true, storageKey: true, fileExt: true },
    });
    if (!version) {
      return null;
    }

    await this.saveIndex(version.documentId, version.id, {
      extractedText: "",
      textLength: 0,
      parser: "pending",
      status: CONTENT_INDEX_STATUS.INDEXING,
    });

    try {
      const path = await this.storageService.getStoredFilePath(version.storageKey);
      const result = await this.parser.extract(path, version.fileExt);
      let embedding: { embedding: number[]; model: string } | null = null;
      let embeddingError: string | undefined;
      if (result.status === CONTENT_INDEX_STATUS.READY && this.embeddingService) {
        try {
          embedding = await this.embeddingService.embed(result.extractedText);
        } catch (error) {
          embeddingError = this.errorMessage(error);
        }
      }
      const indexedResult = embeddingError ? { ...result, errorMessage: embeddingError } : result;
      await this.saveIndex(version.documentId, version.id, indexedResult, embedding);
      return indexedResult;
    } catch (error) {
      const result: ExtractedDocumentContent = {
        extractedText: "",
        textLength: 0,
        parser: "failed",
        status: CONTENT_INDEX_STATUS.FAILED,
        errorMessage: this.errorMessage(error),
      };
      await this.saveIndex(version.documentId, version.id, result).catch(() => undefined);
      return result;
    }
  }

  async rebuildAll() {
    const versions = await this.prisma.documentVersion.findMany({
      where: {
        document: {
          deletedAt: null,
          status: { not: DocumentStatus.DELETED },
        },
      },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });

    let ready = 0;
    let unsupported = 0;
    let failed = 0;
    let embeddingFailed = 0;
    for (const version of versions) {
      const result = await this.indexVersion(version.id);
      if (result?.status === CONTENT_INDEX_STATUS.READY) {
        ready += 1;
        if (result.errorMessage) {
          embeddingFailed += 1;
        }
      } else if (result?.status === CONTENT_INDEX_STATUS.UNSUPPORTED) {
        unsupported += 1;
      } else {
        failed += 1;
      }
    }
    return { total: versions.length, ready, unsupported, failed, embeddingFailed };
  }

  private saveIndex(
    documentId: string,
    versionId: string,
    result: ExtractedDocumentContent,
    embedding?: { embedding: number[]; model: string } | null,
  ) {
    return this.prisma.documentContentIndex.upsert({
      where: { versionId },
      create: {
        documentId,
        versionId,
        extractedText: result.extractedText,
        textLength: result.textLength,
        parser: result.parser,
        status: result.status,
        errorMessage: result.errorMessage,
        embedding: embedding?.embedding,
        embeddingModel: embedding?.model,
        indexedAt: new Date(),
      },
      update: {
        extractedText: result.extractedText,
        textLength: result.textLength,
        parser: result.parser,
        status: result.status,
        errorMessage: result.errorMessage ?? null,
        ...(result.status === CONTENT_INDEX_STATUS.READY
          ? {
              embedding: embedding?.embedding ?? Prisma.JsonNull,
              embeddingModel: embedding?.model ?? null,
            }
          : { embedding: Prisma.JsonNull, embeddingModel: null }),
        indexedAt: new Date(),
      },
    });
  }

  private errorMessage(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return message.slice(0, 1000);
  }
}
