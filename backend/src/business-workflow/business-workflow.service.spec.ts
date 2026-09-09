import { BadRequestException, ConflictException } from "@nestjs/common";
import {
  BusinessContractStatus,
  BusinessFinanceKind,
  BusinessFinanceStatus,
  BusinessMatterType,
  BusinessTaskStatus,
  UserRole,
  UserStatus,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BusinessMattersService } from "../business-matters/business-matters.service";
import { PrismaService } from "../prisma/prisma.service";
import { PublicUser } from "../users/user.presenter";
import { BusinessWorkflowService } from "./business-workflow.service";

describe("BusinessWorkflowService", () => {
  const prisma = {
    businessMatterTask: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    businessMatterContract: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
    },
    businessMatterFinanceRecord: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      aggregate: vi.fn(),
    },
    businessMatterFinanceDocument: {
      findMany: vi.fn(),
      createMany: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
    },
    businessMatterActivity: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    businessMatter: {
      count: vi.fn(),
    },
    document: {
      findMany: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
  };

  const user: PublicUser = {
    id: "user-1",
    username: "employee",
    realName: "员工",
    role: UserRole.EMPLOYEE,
    status: UserStatus.ACTIVE,
    departmentId: null,
    phone: null,
    email: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const matters = {
    requireReadable: vi.fn(),
    requireEditableForRelatedData: vi.fn(),
  };

  let service: BusinessWorkflowService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new BusinessWorkflowService(
      prisma as unknown as PrismaService,
      matters as unknown as BusinessMattersService,
    );
    matters.requireEditableForRelatedData.mockResolvedValue({
      id: "matter-1",
      ownerId: user.id,
      type: BusinessMatterType.PROJECT,
    });
    matters.requireReadable.mockResolvedValue({ id: "matter-1" });
    prisma.user.findFirst.mockResolvedValue({ id: user.id });
    prisma.businessMatterActivity.create.mockResolvedValue({ id: "activity-1" });
  });

  it("creates a follow-up task assigned to the matter owner and records activity", async () => {
    prisma.businessMatterTask.create.mockResolvedValue({
      id: "task-1",
      title: "整理合同盖章件",
      status: BusinessTaskStatus.TODO,
    });

    await service.createTask(
      "matter-1",
      { title: " 整理合同盖章件 ", dueDate: "2026-09-30T00:00:00.000Z" },
      user,
    );

    expect(prisma.businessMatterTask.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: "整理合同盖章件",
          assigneeId: user.id,
          status: BusinessTaskStatus.TODO,
          completedAt: null,
        }),
      }),
    );
    expect(prisma.businessMatterActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "TASK_CREATED" }) }),
    );
  });

  it("sets completion time when a task is completed", async () => {
    prisma.businessMatterTask.findFirst.mockResolvedValue({
      id: "task-1",
      title: "准备材料",
      status: BusinessTaskStatus.TODO,
      completedAt: null,
    });
    prisma.businessMatterTask.update.mockResolvedValue({ id: "task-1", title: "准备材料", status: BusinessTaskStatus.COMPLETED });

    await service.updateTask("matter-1", "task-1", { status: BusinessTaskStatus.COMPLETED }, user);

    expect(prisma.businessMatterTask.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ completedAt: expect.any(Date) }) }),
    );
    expect(prisma.businessMatterActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "TASK_COMPLETED" }) }),
    );
  });

  it("rejects a contract with reversed dates before writing", async () => {
    matters.requireEditableForRelatedData.mockResolvedValue({ type: BusinessMatterType.CONTRACT });

    await expect(
      service.upsertContract(
        "matter-1",
        {
          partyName: "合作方",
          effectiveAt: "2026-10-01T00:00:00.000Z",
          expiresAt: "2026-09-01T00:00:00.000Z",
        },
        user,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.businessMatterContract.upsert).not.toHaveBeenCalled();
  });

  it("validates merged existing contract dates when only one date is updated", async () => {
    matters.requireEditableForRelatedData.mockResolvedValue({ type: BusinessMatterType.CONTRACT });
    prisma.businessMatterContract.findUnique.mockResolvedValue({
      effectiveAt: new Date("2026-10-01T00:00:00.000Z"),
      signedAt: new Date("2026-09-20T00:00:00.000Z"),
      expiresAt: new Date("2026-12-01T00:00:00.000Z"),
    });

    await expect(
      service.upsertContract(
        "matter-1",
        { partyName: "合作方", expiresAt: "2026-09-01T00:00:00.000Z" },
        user,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.businessMatterContract.upsert).not.toHaveBeenCalled();
  });

  it("creates a finance record and preserves its business type", async () => {
    prisma.businessMatterFinanceRecord.create.mockResolvedValue({
      id: "finance-1",
      title: "项目备用金",
      kind: BusinessFinanceKind.LOAN,
      status: BusinessFinanceStatus.DRAFT,
    });

    await service.createFinanceRecord(
      "matter-1",
      { kind: BusinessFinanceKind.LOAN, title: "项目备用金", amount: 1200 },
      user,
    );

    expect(prisma.businessMatterFinanceRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: BusinessFinanceKind.LOAN,
          amount: expect.anything(),
          currency: "CNY",
        }),
      }),
    );
  });

  it("attaches current document versions and rejects duplicate vouchers", async () => {
    prisma.businessMatterFinanceRecord.findFirst.mockResolvedValue({ id: "finance-1", title: "报销", kind: BusinessFinanceKind.REIMBURSEMENT });
    prisma.document.findMany.mockResolvedValue([{ id: "document-1", currentVersionId: "version-1" }]);
    prisma.businessMatterFinanceDocument.findMany.mockResolvedValue([]);
    prisma.businessMatterFinanceDocument.createMany.mockResolvedValue({ count: 1 });

    await service.attachFinanceDocuments("matter-1", "finance-1", { documentIds: ["document-1"] }, user);

    expect(prisma.businessMatterFinanceDocument.createMany).toHaveBeenCalledWith({
      data: [{ recordId: "finance-1", documentId: "document-1", versionId: "version-1", relationType: "VOUCHER" }],
    });

    prisma.businessMatterFinanceDocument.findMany.mockResolvedValue([{ documentId: "document-1" }]);
    await expect(
      service.attachFinanceDocuments("matter-1", "finance-1", { documentIds: ["document-1"] }, user),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
