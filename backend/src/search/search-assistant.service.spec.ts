import { describe, expect, it, vi } from "vitest";

import { SearchAssistantService } from "./search-assistant.service";
import { BadRequestException } from "@nestjs/common";

describe("SearchAssistantService", () => {
  const candidate = {
    id: "document-1",
    title: "我界智能服务合同.pdf",
    documentNo: "HT-2026-0001",
    categoryId: "root",
    subcategoryId: "child",
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    category: { id: "root", name: "合同文件", parentId: null },
    subcategory: { id: "child", name: "我界智能", parentId: "root" },
    currentVersion: {
      originalFileName: "我界智能服务合同.pdf",
      fileExt: ".pdf",
      contentIndex: {
        extractedText: "甲方：我界智能，合同期限为一年。",
        status: "READY",
        embedding: null,
      },
    },
    documentTags: [{ tag: { name: "合同" } }],
    documentPartners: [{ partner: { companyName: "我界智能" } }],
  };

  it("returns metadata and content matches without an API key", async () => {
    const prisma = {
      category: { findMany: vi.fn().mockResolvedValue([candidate.category, candidate.subcategory]) },
      document: { findMany: vi.fn().mockResolvedValue([candidate]) },
    };
    const embeddings = { embed: vi.fn().mockResolvedValue(null) };
    const service = new SearchAssistantService(prisma as never, embeddings as never);

    const result = await service.search("我界智能 合同", 10);

    expect(result.mode).toBe("keyword");
    expect(result.results[0]).toEqual(expect.objectContaining({
      documentId: "document-1",
      categoryPath: ["合同文件", "我界智能"],
    }));
    expect(result.results[0].matchedBy).toEqual(expect.arrayContaining(["文件名称", "标签", "合作单位"]));
    expect(result.results[0].snippet).toContain("我界智能");
  });

  it("uses a current-version vector when the embedding API is available", async () => {
    const semanticCandidate = {
      ...candidate,
      currentVersion: {
        ...candidate.currentVersion,
        contentIndex: {
          ...candidate.currentVersion.contentIndex,
          embedding: [1, 0],
        },
      },
    };
    const prisma = {
      category: { findMany: vi.fn().mockResolvedValue([candidate.category, candidate.subcategory]) },
      document: { findMany: vi.fn().mockResolvedValue([semanticCandidate]) },
    };
    const embeddings = { embed: vi.fn().mockResolvedValue({ embedding: [1, 0], model: "test" }) };
    const service = new SearchAssistantService(prisma as never, embeddings as never);

    const result = await service.search("找合同", 10);

    expect(result.mode).toBe("semantic");
    expect(result.results[0].matchedBy).toContain("文件内容语义");
  });

  it("loads full text only for the ranked result set", async () => {
    const prisma = {
      category: { findMany: vi.fn().mockResolvedValue([candidate.category, candidate.subcategory]) },
      document: {
        findMany: vi.fn()
          .mockResolvedValueOnce([{ id: candidate.id }])
          .mockResolvedValueOnce([{
            ...candidate,
            currentVersion: {
              ...candidate.currentVersion,
              contentIndex: { status: "READY", embedding: null },
            },
          }])
          .mockResolvedValueOnce([candidate]),
      },
    };
    const embeddings = { embed: vi.fn().mockResolvedValue(null) };
    const service = new SearchAssistantService(prisma as never, embeddings as never);

    const result = await service.search("我界智能", 10);

    expect(result.results[0].snippet).toContain("我界智能");
    const candidateQuery = prisma.document.findMany.mock.calls[1][0];
    expect(candidateQuery.select.currentVersion.select.contentIndex.select).not.toHaveProperty("extractedText");
  });

  it("rejects a blank natural-language query", async () => {
    const prisma = {
      category: { findMany: vi.fn() },
      document: { findMany: vi.fn() },
    };
    const service = new SearchAssistantService(prisma as never, { embed: vi.fn() } as never);

    await expect(service.search("   ", 10)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.document.findMany).not.toHaveBeenCalled();
  });
});
