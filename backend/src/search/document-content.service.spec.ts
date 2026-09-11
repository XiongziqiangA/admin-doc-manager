import { DocumentContentIndexService } from "./document-content.service";
import { CONTENT_INDEX_STATUS } from "./document-content.types";
import { describe, expect, it, vi } from "vitest";

describe("DocumentContentIndexService", () => {
  it("records indexing progress and stores extracted content", async () => {
    const prisma = {
      documentVersion: {
        findUnique: vi.fn().mockResolvedValue({
          id: "version-1",
          documentId: "document-1",
          storageKey: "documents/test.txt",
          fileExt: ".txt",
        }),
      },
      documentContentIndex: {
        upsert: vi.fn().mockResolvedValue({}),
      },
      documentContentChunk: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: vi.fn().mockImplementation((operations: Promise<unknown>[]) => Promise.all(operations)),
    };
    const storage = { getStoredFilePath: vi.fn().mockResolvedValue("C:/storage/test.txt") };
    const parser = {
      extract: vi.fn().mockResolvedValue({
        extractedText: "contract text",
        textLength: 13,
        parser: "text",
        status: CONTENT_INDEX_STATUS.READY,
      }),
    };
    const service = new DocumentContentIndexService(prisma as never, storage as never, parser as never);

    const result = await service.indexVersion("version-1");

    expect(result?.status).toBe(CONTENT_INDEX_STATUS.READY);
    expect(prisma.documentContentIndex.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.documentContentIndex.upsert.mock.calls[0][0].create.status).toBe(CONTENT_INDEX_STATUS.INDEXING);
    expect(prisma.documentContentIndex.upsert.mock.calls[1][0].update).toEqual(
      expect.objectContaining({
        extractedText: "contract text",
        status: CONTENT_INDEX_STATUS.READY,
      }),
    );
    expect(prisma.documentContentChunk.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        documentId: "document-1",
        versionId: "version-1",
        chunkIndex: 0,
        sourceRef: "chars:0-13",
        content: "contract text",
        contentDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
      })],
    });
  });

  it("records parser failures without throwing to the upload caller", async () => {
    const prisma = {
      documentVersion: {
        findUnique: vi.fn().mockResolvedValue({
          id: "version-1",
          documentId: "document-1",
          storageKey: "documents/missing.pdf",
          fileExt: ".pdf",
        }),
      },
      documentContentIndex: {
        upsert: vi.fn().mockResolvedValue({}),
      },
      documentContentChunk: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        createMany: vi.fn(),
      },
      $transaction: vi.fn().mockImplementation((operations: Promise<unknown>[]) => Promise.all(operations)),
    };
    const storage = { getStoredFilePath: vi.fn().mockRejectedValue(new Error("file missing")) };
    const parser = { extract: vi.fn() };
    const service = new DocumentContentIndexService(prisma as never, storage as never, parser as never);

    const result = await service.indexVersion("version-1");

    expect(result).toEqual(expect.objectContaining({
      status: CONTENT_INDEX_STATUS.FAILED,
      errorMessage: "file missing",
    }));
    expect(parser.extract).not.toHaveBeenCalled();
    expect(prisma.documentContentIndex.upsert.mock.calls[1][0].update.status).toBe(CONTENT_INDEX_STATUS.FAILED);
    expect(prisma.documentContentChunk.deleteMany).toHaveBeenCalledWith({ where: { versionId: "version-1" } });
  });

  it("clears stale embeddings when a ready index has no current vector", async () => {
    const prisma = {
      documentVersion: {
        findUnique: vi.fn().mockResolvedValue({
          id: "version-1",
          documentId: "document-1",
          storageKey: "documents/test.txt",
          fileExt: ".txt",
        }),
      },
      documentContentIndex: {
        upsert: vi.fn().mockResolvedValue({}),
      },
      documentContentChunk: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: vi.fn().mockImplementation((operations: Promise<unknown>[]) => Promise.all(operations)),
    };
    const storage = { getStoredFilePath: vi.fn().mockResolvedValue("C:/storage/test.txt") };
    const parser = {
      extract: vi.fn().mockResolvedValue({
        extractedText: "contract text",
        textLength: 13,
        parser: "text",
        status: CONTENT_INDEX_STATUS.READY,
      }),
    };
    const embeddings = { embed: vi.fn().mockResolvedValue(null) };
    const service = new DocumentContentIndexService(
      prisma as never,
      storage as never,
      parser as never,
      embeddings as never,
    );

    await service.indexVersion("version-1");

    expect(prisma.documentContentIndex.upsert.mock.calls[1][0].update).toEqual(
      expect.objectContaining({
        embedding: expect.anything(),
        embeddingModel: null,
      }),
    );
  });

  it("stores the embedding returned for a ready document", async () => {
    const prisma = {
      documentVersion: {
        findUnique: vi.fn().mockResolvedValue({
          id: "version-1",
          documentId: "document-1",
          storageKey: "documents/test.txt",
          fileExt: ".txt",
        }),
      },
      documentContentIndex: {
        upsert: vi.fn().mockResolvedValue({}),
      },
      documentContentChunk: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: vi.fn().mockImplementation((operations: Promise<unknown>[]) => Promise.all(operations)),
    };
    const parser = {
      extract: vi.fn().mockResolvedValue({
        extractedText: "contract text",
        textLength: 13,
        parser: "text",
        status: CONTENT_INDEX_STATUS.READY,
      }),
    };
    const service = new DocumentContentIndexService(
      prisma as never,
      { getStoredFilePath: vi.fn().mockResolvedValue("C:/storage/test.txt") } as never,
      parser as never,
      { embed: vi.fn().mockResolvedValue({ embedding: [0.25, 0.75], model: "test-model" }) } as never,
    );

    await service.indexVersion("version-1");

    expect(prisma.documentContentIndex.upsert.mock.calls[1][0].update).toEqual(
      expect.objectContaining({
        embedding: [0.25, 0.75],
        embeddingModel: "test-model",
      }),
    );
  });

  it("reports embedding failures while keeping the text index ready", async () => {
    const prisma = {
      documentVersion: {
        findUnique: vi.fn().mockResolvedValue({
          id: "version-1",
          documentId: "document-1",
          storageKey: "documents/test.txt",
          fileExt: ".txt",
        }),
      },
      documentContentIndex: {
        upsert: vi.fn().mockResolvedValue({}),
      },
      documentContentChunk: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: vi.fn().mockImplementation((operations: Promise<unknown>[]) => Promise.all(operations)),
    };
    const parser = {
      extract: vi.fn().mockResolvedValue({
        extractedText: "contract text",
        textLength: 13,
        parser: "text",
        status: CONTENT_INDEX_STATUS.READY,
      }),
    };
    const service = new DocumentContentIndexService(
      prisma as never,
      { getStoredFilePath: vi.fn().mockResolvedValue("C:/storage/test.txt") } as never,
      parser as never,
      { embed: vi.fn().mockRejectedValue(new Error("provider unavailable")) } as never,
    );

    const result = await service.indexVersion("version-1");

    expect(result).toEqual(expect.objectContaining({
      status: CONTENT_INDEX_STATUS.READY,
      errorMessage: "provider unavailable",
    }));
    expect(prisma.documentContentIndex.upsert.mock.calls[1][0].update).toEqual(
      expect.objectContaining({
        status: CONTENT_INDEX_STATUS.READY,
        errorMessage: "provider unavailable",
        embeddingModel: null,
      }),
    );
  });
});
