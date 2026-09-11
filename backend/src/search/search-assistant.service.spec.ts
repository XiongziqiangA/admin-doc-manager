import { describe, expect, it, vi } from "vitest";

import { SearchAssistantService } from "./search-assistant.service";
import { BadRequestException } from "@nestjs/common";
import { UserRole, UserStatus } from "@prisma/client";

const employee = {
  id: "user-1",
  username: "employee",
  realName: "员工",
  role: UserRole.EMPLOYEE,
  status: UserStatus.ACTIVE,
  organizationId: "org-1",
  departmentId: null,
  phone: null,
  email: null,
  createdAt: new Date("2026-09-11T00:00:00.000Z"),
  updatedAt: new Date("2026-09-11T00:00:00.000Z"),
} as const;

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
      id: "version-1",
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
      documentContentChunk: {
        findMany: vi.fn()
          .mockResolvedValueOnce([{ documentId: candidate.id }])
          .mockResolvedValueOnce([{ documentId: candidate.id, content: "甲方：我界智能，合同期限为一年。" }]),
      },
    };
    const embeddings = { embed: vi.fn().mockResolvedValue(null) };
    const service = new SearchAssistantService(prisma as never, embeddings as never);

    const result = await service.search(employee, "我界智能 合同", 10);

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
      documentContentChunk: {
        findMany: vi.fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ documentId: candidate.id, content: "甲方：我界智能，合同期限为一年。" }]),
      },
    };
    const embeddings = { embed: vi.fn().mockResolvedValue({ embedding: [1, 0], model: "test" }) };
    const service = new SearchAssistantService(prisma as never, embeddings as never);

    const result = await service.search(employee, "找合同", 10);

    expect(result.mode).toBe("semantic");
    expect(result.results[0].matchedBy).toContain("文件内容语义");
  });

  it("loads content chunks only for the ranked result set", async () => {
    const prisma = {
      category: { findMany: vi.fn().mockResolvedValue([candidate.category, candidate.subcategory]) },
      document: {
        findMany: vi.fn().mockResolvedValue([{
          ...candidate,
          currentVersion: {
            ...candidate.currentVersion,
            contentIndex: { status: "READY", embedding: null },
          },
        }]),
      },
      documentContentChunk: {
        findMany: vi.fn()
          .mockResolvedValueOnce([{ documentId: candidate.id }])
          .mockResolvedValueOnce([{
            documentId: candidate.id,
            content: "甲方：我界智能，合同期限为一年。",
            sourceRef: "chars:0-18",
            chunkIndex: 0,
          }]),
      },
    };
    const embeddings = { embed: vi.fn().mockResolvedValue(null) };
    const service = new SearchAssistantService(prisma as never, embeddings as never);

    const result = await service.search(employee, "我界智能", 10);

    expect(result.results[0].snippet).toContain("我界智能");
    const candidateQuery = prisma.document.findMany.mock.calls[0][0];
    expect(candidateQuery.select.currentVersion.select.contentIndex.select).not.toHaveProperty("extractedText");
    expect(prisma.documentContentChunk.findMany.mock.calls[1][0].where.documentId).toEqual({
      in: [candidate.id],
    });
  });

  it("rejects a blank natural-language query", async () => {
    const prisma = {
      category: { findMany: vi.fn() },
      document: { findMany: vi.fn() },
      documentContentChunk: { findMany: vi.fn() },
    };
    const service = new SearchAssistantService(prisma as never, { embed: vi.fn() } as never);

    await expect(service.search(employee, "   ", 10)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.document.findMany).not.toHaveBeenCalled();
  });

  it("scopes candidate and content queries to the current enterprise", async () => {
    const prisma = {
      category: { findMany: vi.fn().mockResolvedValue([]) },
      document: { findMany: vi.fn().mockResolvedValue([]) },
      documentContentChunk: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const service = new SearchAssistantService(prisma as never, { embed: vi.fn().mockResolvedValue(null) } as never);

    await service.search(employee, "合同", 10);

    expect(prisma.document.findMany.mock.calls[0][0].where).toEqual(expect.objectContaining({
      creator: { organizationId: "org-1" },
    }));
    expect(prisma.documentContentChunk.findMany.mock.calls[0][0].where.version.currentFor.is).toEqual(expect.objectContaining({
      creator: { organizationId: "org-1" },
    }));
  });
});
