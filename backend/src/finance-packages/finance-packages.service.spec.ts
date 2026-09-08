import { BadRequestException } from "@nestjs/common";
import { FinanceMaterialType, FinancePackageStatus } from "@prisma/client";
import { Response } from "express";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import * as unzipper from "unzipper";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FinancePackagesService } from "./finance-packages.service";

describe("FinancePackagesService", () => {
  const prisma = {
    $transaction: vi.fn(),
    financePackageTask: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    financePackageGroup: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    financePackageItem: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      createMany: vi.fn(),
      aggregate: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    financePackageExport: {
      create: vi.fn(),
    },
    document: {
      findMany: vi.fn(),
    },
    category: {
      findMany: vi.fn(),
    },
  };

  let service: FinancePackagesService;
  const tempDirectories: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(async (operations) =>
      Array.isArray(operations) ? Promise.all(operations) : operations(prisma),
    );
    service = new FinancePackagesService(prisma as never, {} as never);
  });

  afterEach(async () => {
    await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  });

  it("creates a monthly task without changing document classifications", async () => {
    prisma.financePackageTask.create.mockResolvedValue({ id: "task-1" });

    const result = await service.create(
      {
        name: "2026年8月财务资料",
        period: "2026-08",
        rootFolderName: "我界报销单(打包）",
        includeManifest: true,
      },
      { id: "user-1" } as never,
    );

    expect(prisma.financePackageTask.create).toHaveBeenCalledWith({
      data: {
        name: "2026年8月财务资料",
        period: "2026-08",
        rootFolderName: "我界报销单(打包）",
        includeManifest: true,
        createdById: "user-1",
      },
    });
    expect(result).toEqual({ id: "task-1" });
  });

  it("adds active documents once and locks each current version", async () => {
    prisma.financePackageTask.findFirst.mockResolvedValue({ id: "task-1" });
    prisma.financePackageGroup.findFirst.mockResolvedValue({ id: "group-1", taskId: "task-1" });
    prisma.document.findMany.mockResolvedValue([
      {
        id: "doc-1",
        title: "酒店发票",
        currentVersionId: "version-1",
        currentVersion: { id: "version-1", originalFileName: "18000-酒店发票.pdf" },
      },
      {
        id: "doc-2",
        title: "付款资料",
        currentVersionId: "version-2",
        currentVersion: { id: "version-2", originalFileName: "陈曦提交的付款单.pdf" },
      },
    ]);
    prisma.financePackageItem.findMany.mockResolvedValue([{ documentId: "doc-2" }]);
    prisma.financePackageItem.aggregate.mockResolvedValue({ _max: { sort: 4 } });
    prisma.financePackageItem.createMany.mockResolvedValue({ count: 1 });

    const result = await service.addItems("task-1", {
      groupId: "group-1",
      documentIds: ["doc-1", "doc-2", "doc-1"],
    });

    expect(prisma.financePackageItem.createMany).toHaveBeenCalledWith({
      data: [
        {
          taskId: "task-1",
          groupId: "group-1",
          documentId: "doc-1",
          versionId: "version-1",
          materialType: FinanceMaterialType.INVOICE,
          sort: 5,
        },
      ],
      skipDuplicates: true,
    });
    expect(result).toEqual({ addedCount: 1, skippedCount: 1 });
  });

  it("refuses to delete a group that still contains files", async () => {
    prisma.financePackageTask.findFirst.mockResolvedValue({ id: "task-1" });
    prisma.financePackageGroup.findFirst.mockResolvedValue({ id: "group-1", taskId: "task-1" });
    prisma.financePackageGroup.count.mockResolvedValue(0);
    prisma.financePackageItem.count.mockResolvedValue(2);

    await expect(service.removeGroup("task-1", "group-1")).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.financePackageGroup.delete).not.toHaveBeenCalled();
  });

  it("switches a task item to the document's latest version only when requested", async () => {
    prisma.financePackageTask.findFirst.mockResolvedValue({ id: "task-1" });
    prisma.financePackageItem.findFirst.mockResolvedValue({
      id: "item-1",
      taskId: "task-1",
      versionId: "version-1",
      document: { currentVersionId: "version-2" },
    });
    prisma.financePackageItem.update.mockResolvedValue({ id: "item-1", versionId: "version-2" });

    const result = await service.updateItem("task-1", "item-1", { useLatestVersion: true });

    expect(prisma.financePackageItem.update).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: {
        versionId: "version-2",
        groupId: undefined,
        materialType: undefined,
        exportFileName: undefined,
        sort: undefined,
        remark: undefined,
      },
      include: expect.any(Object),
    });
    expect(result).toEqual({ id: "item-1", versionId: "version-2" });
  });

  it("generates the configured Chinese folder structure and preserves source bytes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "finance-package-"));
    tempDirectories.push(directory);
    const sourcePath = join(directory, "invoice.pdf");
    const sourceBytes = Buffer.from("test-pdf-content");
    await writeFile(sourcePath, sourceBytes);
    const storageService = { getStoredFilePath: vi.fn().mockResolvedValue(sourcePath) };
    service = new FinancePackagesService(prisma as never, storageService as never);
    prisma.financePackageTask.findFirst.mockResolvedValue({
      id: "task-1",
      name: "2026年8月财务资料",
      period: "2026-08",
      rootFolderName: "我界报销单(打包）",
      includeManifest: true,
      groups: [{ id: "group-1", parentId: null, name: "临平赛场桔子酒店", sort: 1 }],
      items: [
        {
          id: "item-1",
          groupId: "group-1",
          versionId: "version-1",
          exportFileName: null,
          materialType: FinanceMaterialType.INVOICE,
          version: {
            id: "version-1",
            originalFileName: "18000-临平桔子酒店发票.pdf",
            storageKey: "documents/invoice.pdf",
            fileSize: sourceBytes.length,
            checksum: "abc123",
            versionLabel: "V1.0 - 2026-08-18",
            createdAt: new Date("2026-08-18T00:00:00.000Z"),
          },
          document: {
            id: "doc-1",
            title: "临平酒店住宿",
            documentNo: "CW-2026-001",
            currentVersionId: "version-1",
          },
        },
      ],
    });
    prisma.financePackageTask.update.mockResolvedValue({ id: "task-1", status: FinancePackageStatus.EXPORTED });
    prisma.financePackageExport.create.mockResolvedValue({ id: "export-1" });

    const chunks: Buffer[] = [];
    const output = new PassThrough();
    output.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    const setHeader = vi.fn();
    Object.assign(output, { setHeader });

    await service.exportPackage("task-1", { id: "user-1" } as never, output as unknown as Response);

    const archive = await unzipper.Open.buffer(Buffer.concat(chunks));
    const invoice = archive.files.find(
      (file) => file.path === "我界报销单(打包）/临平赛场桔子酒店/18000-临平桔子酒店发票.pdf",
    );
    expect(invoice).toBeDefined();
    await expect(invoice!.buffer()).resolves.toEqual(sourceBytes);
    expect(archive.files.some((file) => file.path === "我界报销单(打包）/文件清单.xlsx")).toBe(true);
    expect(setHeader).toHaveBeenCalledWith("Content-Type", "application/zip");
    expect(prisma.financePackageTask.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: { status: FinancePackageStatus.EXPORTED, lastExportedAt: expect.any(Date) },
    });
    expect(prisma.financePackageExport.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ taskId: "task-1", exportedById: "user-1", fileCount: 1 }),
    });
  });

  it("returns only positively ranked candidate documents", async () => {
    prisma.financePackageTask.findFirst.mockResolvedValue({ id: "task-1", period: "2026-08" });
    prisma.financePackageItem.findMany.mockResolvedValue([]);
    prisma.document.findMany.mockResolvedValue([
      {
        id: "doc-finance",
        title: "临平酒店发票",
        remark: null,
        createdAt: new Date("2026-08-18T00:00:00.000Z"),
        updatedAt: new Date("2026-08-18T00:00:00.000Z"),
        category: { name: "财务资料" },
        subcategory: { name: "费用报销" },
        documentTags: [],
        currentVersion: {
          originalFileName: "酒店发票.pdf",
          contentIndex: null,
        },
      },
      {
        id: "doc-unrelated",
        title: "员工手册",
        remark: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        category: { name: "制度文件" },
        subcategory: null,
        documentTags: [],
        currentVersion: {
          originalFileName: "员工手册.docx",
          contentIndex: null,
        },
      },
    ]);

    const result = await service.listCandidates("task-1", { page: 1, pageSize: 50 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ document: { id: "doc-finance" } });
    expect(result.items[0].materialType).toBe(FinanceMaterialType.INVOICE);
    expect(result.items[0].reasons).toEqual(expect.arrayContaining(["归集月份", "财务关键词", "财务分类"]));
  });

  it("filters candidates by category scope, department, tag, date and material type", async () => {
    prisma.financePackageTask.findFirst.mockResolvedValue({ id: "task-1", period: "2026-08" });
    prisma.financePackageItem.findMany.mockResolvedValue([]);
    prisma.category.findMany.mockResolvedValue([
      { id: "category-root", name: "财务票据", parentId: null },
      { id: "category-child", name: "发票", parentId: "category-root" },
    ]);
    prisma.document.findMany.mockResolvedValue([
      {
        id: "doc-invoice",
        title: "办公发票",
        remark: null,
        category: { name: "财务票据" },
        subcategory: { name: "发票" },
        department: { id: "department-1", name: "行政部" },
        documentTags: [{ tag: { name: "八月" } }],
        createdAt: new Date("2026-08-18T00:00:00.000Z"),
        updatedAt: new Date("2026-08-18T00:00:00.000Z"),
        currentVersion: { originalFileName: "办公发票.pdf", contentIndex: null },
      },
      {
        id: "doc-contract",
        title: "办公合同",
        remark: null,
        category: { name: "财务票据" },
        subcategory: { name: "费用" },
        department: { id: "department-1", name: "行政部" },
        documentTags: [{ tag: { name: "八月" } }],
        createdAt: new Date("2026-08-19T00:00:00.000Z"),
        updatedAt: new Date("2026-08-19T00:00:00.000Z"),
        currentVersion: { originalFileName: "办公合同.pdf", contentIndex: null },
      },
    ]);

    const result = await service.listCandidates("task-1", {
      page: 1,
      pageSize: 50,
      categoryId: "category-root",
      subcategoryId: "category-child",
      departmentId: "department-1",
      tagId: "tag-1",
      materialType: FinanceMaterialType.INVOICE,
      uploadedFrom: "2026-08-01",
      uploadedTo: "2026-08-31",
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ document: { id: "doc-invoice" }, materialType: FinanceMaterialType.INVOICE });
    expect(prisma.document.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        categoryId: "category-root",
        subcategoryId: { in: ["category-child"] },
        departmentId: "department-1",
        documentTags: { some: { tagId: "tag-1" } },
        createdAt: {
          gte: new Date("2026-08-01"),
          lte: new Date("2026-08-31T23:59:59.999Z"),
        },
      }),
    }));
  });
});
