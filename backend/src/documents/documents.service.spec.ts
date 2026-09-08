import { describe, expect, it, beforeEach, vi } from "vitest";
import { DocumentStatus } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import { DocumentsService } from "./documents.service";

describe("DocumentsService.findDuplicatesByFileName", () => {
  const prisma = {
    document: {
      findMany: vi.fn(),
    },
  };

  const storageService = {} as never;
  let service: DocumentsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new DocumentsService(prisma as never, storageService, {} as never);
  });

  it("finds active documents with the same display or current file name", async () => {
    prisma.document.findMany.mockResolvedValue([{ id: "doc-1" }, { id: "doc-2" }]);

    const result = await service.findDuplicatesByFileName("员工手册.pdf");

    expect(prisma.document.findMany).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        status: { not: DocumentStatus.DELETED },
        OR: [
          {
            title: {
              equals: "员工手册.pdf",
              mode: "insensitive",
            },
          },
          {
            currentVersion: {
              is: {
                originalFileName: {
                  equals: "员工手册.pdf",
                  mode: "insensitive",
                },
              },
            },
          },
        ],
      },
      include: expect.any(Object),
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });
    expect(result).toHaveLength(2);
  });
});

describe("DocumentsService.list", () => {
  const prisma = {
    $transaction: vi.fn(),
    document: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  };

  let service: DocumentsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new DocumentsService(prisma as never, {} as never, {} as never);
  });

  it("splits partial keywords and searches document metadata and current file name", async () => {
    prisma.document.findMany.mockResolvedValue([]);
    prisma.document.count.mockResolvedValue(0);
    prisma.$transaction.mockImplementation(async (operations) => Promise.all(operations));

    await service.list({
      page: 1,
      pageSize: 20,
      keyword: "金华 预付款 pdf",
      sortBy: "updatedAt",
      sortOrder: "desc",
    });

    expect(prisma.document.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        AND: [
          {
            OR: expect.arrayContaining([
              { title: { contains: "金华", mode: "insensitive" } },
              { currentVersion: { is: { originalFileName: { contains: "金华", mode: "insensitive" } } } },
              { documentTags: { some: { tag: { name: { contains: "金华", mode: "insensitive" } } } } },
            ]),
          },
          {
            OR: expect.arrayContaining([
              { title: { contains: "预付款", mode: "insensitive" } },
              { remark: { contains: "预付款", mode: "insensitive" } },
            ]),
          },
          {
            OR: expect.arrayContaining([
              { title: { contains: "pdf", mode: "insensitive" } },
              { currentVersion: { is: { fileExt: { contains: "pdf", mode: "insensitive" } } } },
            ]),
          },
        ],
      }),
      include: expect.any(Object),
      orderBy: { updatedAt: "desc" },
      skip: 0,
      take: 20,
    });
  });

  it("includes descendant files when a nested category is selected", async () => {
    const prisma = {
      $transaction: vi.fn(),
      category: {
        findMany: vi.fn().mockResolvedValue([
          { id: "root", name: "合同文件", parentId: null },
          { id: "child", name: "客户合同", parentId: "root" },
          { id: "grandchild", name: "年度合同", parentId: "child" },
        ]),
      },
      document: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    };
    prisma.$transaction.mockImplementation(async (operations) => Promise.all(operations));
    const service = new DocumentsService(prisma as never, {} as never, {} as never);

    await service.list({
      page: 1,
      pageSize: 20,
      subcategoryId: "child",
      sortBy: "updatedAt",
      sortOrder: "desc",
    });

    expect(prisma.document.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          subcategoryId: { in: ["child", "grandchild"] },
        }),
      }),
    );
  });

  it("combines category, tag, and partner filters", async () => {
    const prisma = {
      $transaction: vi.fn(),
      category: {
        findMany: vi.fn().mockResolvedValue([
          { id: "root", name: "合同文件", parentId: null },
          { id: "child", name: "客户合同", parentId: "root" },
        ]),
      },
      document: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    };
    prisma.$transaction.mockImplementation(async (operations) => Promise.all(operations));
    const service = new DocumentsService(prisma as never, {} as never, {} as never);

    await service.list({
      page: 1,
      pageSize: 20,
      categoryId: "root",
      subcategoryId: "child",
      tagId: "tag-1",
      partnerId: "partner-1",
      sortBy: "updatedAt",
      sortOrder: "desc",
    });

    expect(prisma.document.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          categoryId: "root",
          subcategoryId: { in: ["child"] },
          documentTags: { some: { tagId: "tag-1" } },
          documentPartners: { some: { partnerId: "partner-1" } },
        }),
      }),
    );
  });
});

describe("DocumentsService.update", () => {
  it("moves a document by changing only its category fields without creating a version", async () => {
    const transaction = {
      document: {
        update: vi.fn().mockResolvedValue({ id: "doc-1", currentVersionId: "version-1" }),
        findUnique: vi.fn().mockResolvedValue({ id: "doc-1", categoryId: "category-new", subcategoryId: "child-new" }),
      },
      documentLog: {
        create: vi.fn(),
      },
      documentVersion: {
        create: vi.fn(),
      },
    };
    const prisma = {
      document: {
        findFirst: vi.fn().mockResolvedValue({
          id: "doc-1",
          creatorId: "user-1",
          categoryId: "category-old",
          subcategoryId: "child-old",
          currentVersionId: "version-1",
        }),
      },
      category: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({ id: "category-new", level: 1, deletedAt: null })
          .mockResolvedValueOnce({ id: "child-new", level: 2, parentId: "category-new", deletedAt: null }),
      },
      $transaction: vi.fn(async (callback) => callback(transaction)),
    };
    const service = new DocumentsService(prisma as never, {} as never, {} as never);

    const result = await service.update(
      "doc-1",
      { categoryId: "category-new", subcategoryId: "child-new" },
      { id: "admin-1", role: "ADMIN" } as never,
      {} as never,
    );

    expect(transaction.document.update).toHaveBeenCalledWith({
      where: { id: "doc-1" },
      data: expect.objectContaining({ categoryId: "category-new", subcategoryId: "child-new" }),
    });
    const updateData = transaction.document.update.mock.calls[0][0].data;
    expect(Object.values(updateData).filter((value) => value !== undefined)).toEqual(["category-new", "child-new"]);
    expect(transaction.documentVersion.create).not.toHaveBeenCalled();
    expect(transaction.documentLog.create).toHaveBeenCalledOnce();
    expect(result).toEqual({ id: "doc-1", categoryId: "category-new", subcategoryId: "child-new" });
  });
});
