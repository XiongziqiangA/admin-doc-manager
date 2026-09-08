import { FinanceAnalysisJobStatus, FinanceMaterialType, FinanceSuggestionStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { FinanceAnalysisService } from "./finance-analysis.service";
import { FinanceSuggestionDecision } from "./dto/confirm-finance-analysis.dto";

function createDocument() {
  return {
    id: "document-1",
    title: "张三临平出差",
    documentNo: "CW-2026-001",
    createdAt: new Date("2026-08-18T00:00:00.000Z"),
    updatedAt: new Date("2026-08-18T00:00:00.000Z"),
    category: { name: "财务资料" },
    subcategory: { name: "费用报销" },
    department: { name: "行政部" },
    documentTags: [{ tag: { name: "出差" } }],
    currentVersion: {
      id: "version-1",
      originalFileName: "张三临平出差发票.pdf",
      fileExt: ".pdf",
      contentIndex: { status: "READY", extractedText: "张三 临平 桔子酒店 金额 200.00 日期 2026-08-18" },
    },
  };
}

function createPrisma() {
  const prisma = {
    $transaction: vi.fn(),
    financeAnalysisJob: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    financePackageTask: { findFirst: vi.fn(), update: vi.fn() },
    financePackageItem: { findMany: vi.fn(), findFirst: vi.fn(), aggregate: vi.fn(), create: vi.fn() },
    financePackageGroup: { findFirst: vi.fn(), aggregate: vi.fn(), create: vi.fn() },
    financePackageSuggestion: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    document: { findMany: vi.fn() },
    documentAnalysis: { upsert: vi.fn() },
  };
  prisma.$transaction.mockImplementation(async (operation) => {
    if (Array.isArray(operation)) {
      return Promise.all(operation);
    }
    return operation(prisma);
  });
  return prisma;
}

describe("FinanceAnalysisService", () => {
  it("creates a job and persists AI fields without changing the source document", async () => {
    const prisma = createPrisma();
    const ai = {
      isConfigured: vi.fn().mockReturnValue(true),
      status: vi.fn().mockReturnValue({
        enabled: true,
        configured: true,
        model: "proxy-model",
        baseUrl: "https://proxy.example/v1",
        promptVersion: "finance-classification-v1",
      }),
      completeJson: vi.fn().mockResolvedValue({ data: {
        documents: [{
          documentId: "document-1",
          materialType: "INVOICE",
          expensePerson: "张三",
          documentDate: "2026-08-18",
          amount: 200,
          merchant: "桔子酒店",
          project: "临平出差",
          matterKey: "zhangsan-linping-20260818",
          suggestedGroupName: "张三临平出差",
          suggestedFileName: "张三临平出差发票.pdf",
          confidence: 0.93,
          reasons: ["正文包含报销人、日期和金额"],
        }],
      }, usage: { promptTokens: 12, completionTokens: 8, totalTokens: 20 }, durationMs: 100 }),
    };
    prisma.financePackageTask.findFirst.mockResolvedValue({ id: "task-1", period: "2026-08" });
    prisma.financeAnalysisJob.findFirst.mockResolvedValue(null);
    prisma.financePackageItem.findMany.mockResolvedValue([]);
    prisma.document.findMany.mockResolvedValue([createDocument()]);
    prisma.financeAnalysisJob.create.mockResolvedValue({
      id: "job-1",
      taskId: "task-1",
      status: FinanceAnalysisJobStatus.PENDING,
      totalCount: 1,
      processedCount: 0,
      model: "proxy-model",
      promptVersion: "finance-classification-v1",
      errorMessage: null,
      startedAt: null,
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const service = new FinanceAnalysisService(prisma as never, ai as never);
    const result = await service.start("task-1", {}, { id: "user-1" } as never);
    await vi.waitFor(() => expect(prisma.financePackageSuggestion.create).toHaveBeenCalled());

    expect(result).toMatchObject({ id: "job-1", status: FinanceAnalysisJobStatus.PENDING, totalCount: 1 });
    expect(prisma.financePackageSuggestion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        jobId: "job-1",
        documentId: "document-1",
        versionId: "version-1",
        materialType: FinanceMaterialType.INVOICE,
        suggestedGroupName: "张三临平出差",
        confidence: 0.93,
      }),
    });
    expect(prisma.financePackageTask.update).not.toHaveBeenCalled();
  });

  it("falls back to rule suggestions when a batch response is invalid", async () => {
    const prisma = createPrisma();
    const ai = {
      isConfigured: vi.fn().mockReturnValue(true),
      status: vi.fn().mockReturnValue({ enabled: true, configured: true, model: "proxy-model", baseUrl: "https://proxy.example/v1", promptVersion: "finance-classification-v1" }),
      completeJson: vi.fn().mockRejectedValue(new Error("invalid JSON")),
    };
    prisma.financePackageTask.findFirst.mockResolvedValue({ id: "task-1", period: "2026-08" });
    prisma.financeAnalysisJob.findFirst.mockResolvedValue(null);
    prisma.financePackageItem.findMany.mockResolvedValue([]);
    prisma.document.findMany.mockResolvedValue([createDocument()]);
    prisma.financeAnalysisJob.create.mockResolvedValue({
      id: "job-1", taskId: "task-1", status: FinanceAnalysisJobStatus.PENDING, totalCount: 1, processedCount: 0,
      model: "proxy-model", promptVersion: "finance-classification-v1", errorMessage: null, startedAt: null,
      completedAt: null, createdAt: new Date(), updatedAt: new Date(),
    });

    const service = new FinanceAnalysisService(prisma as never, ai as never);
    await service.start("task-1", {}, { id: "user-1" } as never);
    await vi.waitFor(() => expect(prisma.financePackageSuggestion.create).toHaveBeenCalled());

    expect(prisma.financePackageSuggestion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        materialType: FinanceMaterialType.INVOICE,
        reasons: ["AI 调用失败，已使用规则识别"],
        confidence: 0.15,
      }),
    });
    expect(prisma.financeAnalysisJob.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: FinanceAnalysisJobStatus.COMPLETED, errorMessage: expect.stringContaining("部分文件使用规则降级") }),
    }));
  });

  it("only creates an item and group after an explicit confirmation", async () => {
    const prisma = createPrisma();
    const ai = { status: vi.fn(), isConfigured: vi.fn() };
    prisma.financeAnalysisJob.findFirst.mockResolvedValue({ id: "job-1", taskId: "task-1", status: FinanceAnalysisJobStatus.COMPLETED });
    prisma.financePackageSuggestion.findFirst.mockResolvedValue({
      id: "suggestion-1",
      jobId: "job-1",
      documentId: "document-1",
      versionId: "version-1",
      suggestedGroupName: "张三临平出差",
      suggestedFileName: "张三临平出差发票.pdf",
      materialType: FinanceMaterialType.INVOICE,
    });
    prisma.financePackageGroup.findFirst.mockResolvedValue(null);
    prisma.financePackageGroup.aggregate.mockResolvedValue({ _max: { sort: 3 } });
    prisma.financePackageGroup.create.mockResolvedValue({ id: "group-1" });
    prisma.financePackageItem.findFirst.mockResolvedValue(null);
    prisma.financePackageItem.aggregate.mockResolvedValue({ _max: { sort: 2 } });
    prisma.financePackageItem.create.mockResolvedValue({ id: "item-1" });

    const service = new FinanceAnalysisService(prisma as never, ai as never);
    const result = await service.confirm("task-1", "job-1", {
      createGroups: true,
      suggestions: [{ suggestionId: "suggestion-1", decision: FinanceSuggestionDecision.CONFIRM }],
    });

    expect(result).toEqual({ jobId: "job-1", confirmedCount: 1, rejectedCount: 0, skippedExistingCount: 0, createdGroupCount: 1 });
    expect(prisma.financePackageGroup.create).toHaveBeenCalledWith({
      data: { taskId: "task-1", parentId: null, name: "张三临平出差", sort: 4 },
      select: { id: true },
    });
    expect(prisma.financePackageItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ taskId: "task-1", groupId: "group-1", documentId: "document-1", versionId: "version-1" }),
    });
    expect(prisma.financePackageSuggestion.update).toHaveBeenCalledWith({
      where: { id: "suggestion-1" },
      data: expect.objectContaining({ status: FinanceSuggestionStatus.CONFIRMED, confirmedGroupId: "group-1" }),
    });
  });

  it("puts a confirmed suggestion in the total directory when selected explicitly", async () => {
    const prisma = createPrisma();
    const ai = { status: vi.fn(), isConfigured: vi.fn() };
    prisma.financeAnalysisJob.findFirst.mockResolvedValue({ id: "job-1", taskId: "task-1", status: FinanceAnalysisJobStatus.COMPLETED });
    prisma.financePackageSuggestion.findFirst.mockResolvedValue({
      id: "suggestion-1",
      jobId: "job-1",
      documentId: "document-1",
      versionId: "version-1",
      suggestedGroupName: "张三临平出差",
      suggestedFileName: "张三临平出差发票.pdf",
      materialType: FinanceMaterialType.INVOICE,
    });
    prisma.financePackageItem.findFirst.mockResolvedValue(null);
    prisma.financePackageItem.aggregate.mockResolvedValue({ _max: { sort: 2 } });
    prisma.financePackageItem.create.mockResolvedValue({ id: "item-1" });

    const service = new FinanceAnalysisService(prisma as never, ai as never);
    const result = await service.confirm("task-1", "job-1", {
      createGroups: true,
      suggestions: [{ suggestionId: "suggestion-1", decision: FinanceSuggestionDecision.CONFIRM, groupId: null }],
    });

    expect(result).toEqual({ jobId: "job-1", confirmedCount: 1, rejectedCount: 0, skippedExistingCount: 0, createdGroupCount: 0 });
    expect(prisma.financePackageGroup.create).not.toHaveBeenCalled();
    expect(prisma.financePackageItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ taskId: "task-1", groupId: null, documentId: "document-1", versionId: "version-1" }),
    });
  });

  it("does not trust invalid dates returned by the model", async () => {
    const prisma = createPrisma();
    const ai = {
      isConfigured: vi.fn().mockReturnValue(true),
      status: vi.fn().mockReturnValue({ enabled: true, configured: true, model: "proxy-model", baseUrl: "https://proxy.example/v1", promptVersion: "finance-classification-v1" }),
      completeJson: vi.fn().mockResolvedValue({
        data: { documents: [{ documentId: "document-1", documentDate: "2026-02-31", suggestedGroupName: "事项", suggestedFileName: "事项.pdf" }] },
        usage: { promptTokens: null, completionTokens: null, totalTokens: null },
        durationMs: 100,
      }),
    };
    prisma.financePackageTask.findFirst.mockResolvedValue({ id: "task-1", period: "2026-08" });
    prisma.financeAnalysisJob.findFirst.mockResolvedValue(null);
    prisma.financePackageItem.findMany.mockResolvedValue([]);
    prisma.document.findMany.mockResolvedValue([createDocument()]);
    prisma.financeAnalysisJob.create.mockResolvedValue({
      id: "job-1", taskId: "task-1", status: FinanceAnalysisJobStatus.PENDING, totalCount: 1, processedCount: 0,
      model: "proxy-model", promptVersion: "finance-classification-v1", errorMessage: null, startedAt: null,
      completedAt: null, createdAt: new Date(), updatedAt: new Date(),
    });

    const service = new FinanceAnalysisService(prisma as never, ai as never);
    await service.start("task-1", {}, { id: "user-1" } as never);
    await vi.waitFor(() => expect(prisma.financePackageSuggestion.create).toHaveBeenCalled());

    expect(prisma.financePackageSuggestion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        extractedFields: expect.objectContaining({ documentDate: null }),
      }),
    });
  });
});
