import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import {
  BusinessFollowUpMethod,
  BusinessContractStatus,
  BusinessFinanceKind,
  BusinessFinanceStatus,
  BusinessIssueKind,
  BusinessIssueStatus,
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
      groupBy: vi.fn(),
    },
    businessMatterFollowUp: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      groupBy: vi.fn(),
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
      groupBy: vi.fn(),
    },
    businessMatterFinanceDocument: {
      findMany: vi.fn(),
      createMany: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
    },
    businessMatterTaskDocument: {
      findMany: vi.fn(),
      createMany: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
    },
    businessMatterFollowUpDocument: {
      findMany: vi.fn(),
      createMany: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
    },
    businessMatterIssue: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    businessMatterIssueDocument: {
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
      findMany: vi.fn(),
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

  it("stores a custom task assignee without binding a system account", async () => {
    prisma.businessMatterTask.create.mockResolvedValue({
      id: "task-custom",
      title: "联系外部顾问",
      status: BusinessTaskStatus.TODO,
      assigneeId: null,
      assigneeName: "外部顾问李老师",
    });

    await service.createTask("matter-1", {
      title: "联系外部顾问",
      assigneeName: " 外部顾问李老师 ",
    }, user);

    expect(prisma.businessMatterTask.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ assigneeId: null, assigneeName: "外部顾问李老师" }),
      }),
    );
  });

  it("rejects a task with both an account and a custom assignee", async () => {
    await expect(service.createTask("matter-1", {
      title: "重复责任人",
      assigneeId: user.id,
      assigneeName: "外部负责人",
    }, user)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.businessMatterTask.create).not.toHaveBeenCalled();
  });

  it("requires a next assignee when a next follow-up date is provided", async () => {
    await expect(
      service.createFollowUp(
        "matter-1",
        {
          method: BusinessFollowUpMethod.CALL,
          content: "已联系合作方",
          nextDueAt: "2026-09-20T09:00:00.000Z",
        },
        user,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.businessMatterFollowUp.create).not.toHaveBeenCalled();
  });

  it("prevents an employee from assigning the next follow-up to another employee", async () => {
    await expect(
      service.createFollowUp(
        "matter-1",
        {
          method: BusinessFollowUpMethod.WECHAT,
          content: "发送了资料",
          nextAssigneeId: "user-2",
          nextDueAt: "2026-09-20T09:00:00.000Z",
        },
        user,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.businessMatterFollowUp.create).not.toHaveBeenCalled();
  });

  it("creates a detailed follow-up and records it in the activity stream", async () => {
    prisma.businessMatterFollowUp.create.mockResolvedValue({
      id: "follow-up-1",
      content: "已与供应商确认交付时间",
      nextDueAt: new Date("2026-09-20T09:00:00.000Z"),
    });

    await service.createFollowUp(
      "matter-1",
      {
        method: BusinessFollowUpMethod.MEETING,
        content: " 已与供应商确认交付时间 ",
        result: "对方承诺周五发货",
        nextAction: "周五核对物流单号",
        nextAssigneeId: user.id,
        nextDueAt: "2026-09-20T09:00:00.000Z",
      },
      user,
    );

    expect(prisma.businessMatterFollowUp.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          method: BusinessFollowUpMethod.MEETING,
          content: "已与供应商确认交付时间",
          result: "对方承诺周五发货",
          nextAction: "周五核对物流单号",
          nextAssigneeId: user.id,
          nextDueAt: new Date("2026-09-20T09:00:00.000Z"),
          createdById: user.id,
        }),
      }),
    );
    expect(prisma.businessMatterActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "FOLLOW_UP_CREATED",
          summary: "记录一次会议跟进",
        }),
      }),
    );
  });

  it("allows a custom next follow-up assignee when a due date is provided", async () => {
    prisma.businessMatterFollowUp.create.mockResolvedValue({
      id: "follow-up-custom",
      content: "等待外部人员反馈",
      nextAssigneeId: null,
      nextAssigneeName: "代账公司李老师",
      nextDueAt: new Date("2026-09-20T09:00:00.000Z"),
    });

    await service.createFollowUp("matter-1", {
      method: BusinessFollowUpMethod.EMAIL,
      content: "等待外部人员反馈",
      nextAssigneeName: "代账公司李老师",
      nextDueAt: "2026-09-20T09:00:00.000Z",
    }, user);

    expect(prisma.businessMatterFollowUp.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ nextAssigneeId: null, nextAssigneeName: "代账公司李老师" }),
      }),
    );
  });

  it("includes assigned follow-ups in the personal workflow overview", async () => {
    prisma.businessMatter.count.mockResolvedValueOnce(8).mockResolvedValueOnce(3);
    prisma.businessMatterTask.count.mockResolvedValueOnce(5).mockResolvedValueOnce(2).mockResolvedValueOnce(1);
    prisma.businessMatterFollowUp.count.mockResolvedValueOnce(4).mockResolvedValueOnce(2).mockResolvedValueOnce(1);
    prisma.businessMatterContract.count.mockResolvedValue(1);
    prisma.businessMatterFinanceRecord.aggregate
      .mockResolvedValueOnce({ _sum: { amount: null }, _count: { _all: 0 } })
      .mockResolvedValueOnce({ _sum: { amount: null }, _count: { _all: 0 } });

    const overview = await service.getOverview(user);

    expect(overview.followUps).toEqual({ pending: 4, overdue: 2, dueSoon: 1 });
  });

  it("returns assigned follow-ups as personal reminders", async () => {
    const nextDueAt = new Date(Date.now() - 60_000);
    prisma.businessMatterTask.findMany.mockResolvedValue([]);
    prisma.businessMatterContract.findMany.mockResolvedValue([]);
    prisma.businessMatterFollowUp.findMany.mockResolvedValue([
      {
        id: "follow-up-1",
        content: "联系供应商确认发货",
        nextDueAt,
        matter: { id: "matter-1", title: "采购事项", matterNo: "MAT-1" },
      },
    ]);

    const reminders = await service.listReminders(user);

    expect(reminders.items).toEqual([
      expect.objectContaining({
        kind: "FOLLOW_UP",
        id: "follow-up-1",
        title: "跟进：联系供应商确认发货",
        overdue: true,
      }),
    ]);
  });

  it("aggregates responsibility metrics by employee and business role", async () => {
    prisma.user.findMany.mockResolvedValue([{ id: "user-1", username: "employee", realName: "员工" }]);
    prisma.businessMatterTask.groupBy
      .mockResolvedValueOnce([
        { assigneeId: "user-1", status: BusinessTaskStatus.TODO, _count: { _all: 2 } },
        { assigneeId: "user-1", status: BusinessTaskStatus.COMPLETED, _count: { _all: 3 } },
      ])
      .mockResolvedValueOnce([{ assigneeId: "user-1", _count: { _all: 1 } }]);
    prisma.businessMatterFinanceRecord.groupBy
      .mockResolvedValueOnce([
        { handlerId: "user-1", kind: BusinessFinanceKind.LOAN, _count: { _all: 4 } },
        { handlerId: "user-1", kind: BusinessFinanceKind.REIMBURSEMENT, _count: { _all: 5 } },
      ])
      .mockResolvedValueOnce([{ approvedById: "user-1", _count: { _all: 2 } }])
      .mockResolvedValueOnce([{ paidById: "user-1", _count: { _all: 1 } }])
      .mockResolvedValueOnce([{ settlementOwnerId: "user-1", _count: { _all: 1 } }]);
    prisma.businessMatterFollowUp.groupBy
      .mockResolvedValueOnce([{ createdById: "user-1", _count: { _all: 6 } }])
      .mockResolvedValueOnce([{ nextAssigneeId: "user-1", _count: { _all: 2 } }]);

    const report = await service.getResponsibilityReport({});

    expect(report.items[0]).toMatchObject({
      userId: "user-1",
      tasks: { pending: 2, completed: 3, overdue: 1 },
      finance: { loansHandled: 4, reimbursementsHandled: 5, approved: 2, paid: 1, settled: 1 },
      followUps: { created: 6, overdue: 2 },
    });
  });

  it("sets completion time when a task is completed", async () => {
    prisma.businessMatterTask.findFirst.mockResolvedValue({
      id: "task-1",
      title: "准备材料",
      status: BusinessTaskStatus.IN_PROGRESS,
      assigneeId: user.id,
      completedAt: null,
    });
    prisma.businessMatterTask.update.mockResolvedValue({ id: "task-1", title: "准备材料", status: BusinessTaskStatus.COMPLETED });

    await service.updateTask("matter-1", "task-1", {
      status: BusinessTaskStatus.COMPLETED,
      completionNote: "已完成材料整理",
    }, user);

    expect(prisma.businessMatterTask.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ completedAt: expect.any(Date) }) }),
    );
    expect(prisma.businessMatterActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "TASK_COMPLETED" }) }),
    );
  });

  it("requires the assigned person or an admin to complete a task", async () => {
    prisma.businessMatterTask.findFirst.mockResolvedValue({
      id: "task-1",
      title: "准备材料",
      status: BusinessTaskStatus.IN_PROGRESS,
      progress: 40,
      assigneeId: "another-user",
      completedAt: null,
    });

    await expect(
      service.updateTask("matter-1", "task-1", {
        status: BusinessTaskStatus.COMPLETED,
        completionNote: "已完成材料整理",
      }, user),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.businessMatterTask.update).not.toHaveBeenCalled();
  });

  it("requires a completion note and records the completion owner", async () => {
    prisma.businessMatterTask.findFirst.mockResolvedValue({
      id: "task-1",
      title: "准备材料",
      status: BusinessTaskStatus.IN_PROGRESS,
      progress: 40,
      assigneeId: user.id,
      completedAt: null,
    });

    await expect(
      service.updateTask("matter-1", "task-1", { status: BusinessTaskStatus.COMPLETED }, user),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.businessMatterTask.update.mockResolvedValue({ id: "task-1", title: "准备材料", status: BusinessTaskStatus.COMPLETED });
    await service.updateTask("matter-1", "task-1", {
      status: BusinessTaskStatus.COMPLETED,
      completionNote: "已完成材料整理",
    }, user);

    expect(prisma.businessMatterTask.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          progress: 100,
          completedBy: { connect: { id: user.id } },
          completionNote: "已完成材料整理",
        }),
      }),
    );
  });

  it("records the cancellation time and responsible person", async () => {
    prisma.businessMatterTask.findFirst.mockResolvedValue({
      id: "task-1",
      title: "准备材料",
      status: BusinessTaskStatus.IN_PROGRESS,
      progress: 40,
      assigneeId: user.id,
      completedAt: null,
      cancelledAt: null,
      cancellationReason: null,
    });
    prisma.businessMatterTask.update.mockResolvedValue({
      id: "task-1",
      title: "准备材料",
      status: BusinessTaskStatus.CANCELLED,
    });

    await service.updateTask("matter-1", "task-1", {
      status: BusinessTaskStatus.CANCELLED,
      cancellationReason: "事项已取消",
    }, user);

    expect(prisma.businessMatterTask.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cancelledAt: expect.any(Date),
          cancelledBy: { connect: { id: user.id } },
          cancellationReason: "事项已取消",
        }),
      }),
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
          applicantId: user.id,
          handlerId: user.id,
        }),
      }),
    );
  });

  it("stores custom names for every finance responsibility role", async () => {
    prisma.businessMatterFinanceRecord.create.mockResolvedValue({
      id: "finance-custom",
      title: "外部代办报销",
      kind: BusinessFinanceKind.REIMBURSEMENT,
      status: BusinessFinanceStatus.DRAFT,
    });

    await service.createFinanceRecord("matter-1", {
      kind: BusinessFinanceKind.REIMBURSEMENT,
      title: "外部代办报销",
      amount: 88,
      applicantName: "申请人甲",
      handlerName: "经办人乙",
      approverName: "审批人丙",
      payerName: "付款人丁",
      settlementOwnerName: "结算人戊",
    }, user);

    expect(prisma.businessMatterFinanceRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          applicantId: null,
          applicantName: "申请人甲",
          handlerId: null,
          handlerName: "经办人乙",
          approverId: null,
          approverName: "审批人丙",
          payerId: null,
          payerName: "付款人丁",
          settlementOwnerId: null,
          settlementOwnerName: "结算人戊",
        }),
      }),
    );
  });

  it("does not allow a custom approver name to authorize approval for an employee", async () => {
    prisma.businessMatterFinanceRecord.findFirst.mockResolvedValue({
      id: "finance-1",
      title: "外部审批报销",
      kind: BusinessFinanceKind.REIMBURSEMENT,
      status: BusinessFinanceStatus.PENDING,
      approverId: null,
      approverName: "外部审批人",
    });

    await expect(service.updateFinanceRecord("matter-1", "finance-1", {
      status: BusinessFinanceStatus.APPROVED,
    }, user)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.businessMatterFinanceRecord.update).not.toHaveBeenCalled();
  });

  it("can switch an existing finance responsibility from an account to a custom person", async () => {
    const admin = { ...user, role: UserRole.ADMIN };
    prisma.businessMatterFinanceRecord.findFirst.mockResolvedValue({
      id: "finance-1",
      recordNo: "REIM-1",
      title: "切换责任人",
      kind: BusinessFinanceKind.REIMBURSEMENT,
      status: BusinessFinanceStatus.DRAFT,
      approverId: user.id,
      approverName: null,
      amount: "20.00",
      currency: "CNY",
      dueDate: null,
      settledAt: null,
      rejectionReason: null,
      settlementNote: null,
    });
    prisma.businessMatterFinanceRecord.update.mockResolvedValue({
      id: "finance-1",
      recordNo: "REIM-1",
      title: "切换责任人",
      kind: BusinessFinanceKind.REIMBURSEMENT,
      status: BusinessFinanceStatus.DRAFT,
      approverId: null,
      approverName: "外部审批人",
      amount: "20.00",
      currency: "CNY",
      dueDate: null,
      settledAt: null,
      rejectionReason: null,
      settlementNote: null,
    });

    await service.updateFinanceRecord("matter-1", "finance-1", {
      approverId: null,
      approverName: "外部审批人",
    }, admin);

    expect(prisma.businessMatterFinanceRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          approver: { disconnect: true },
          approverName: "外部审批人",
        }),
      }),
    );
  });

  it("records the responsible people and timestamps when finance status advances", async () => {
    prisma.businessMatterFinanceRecord.findFirst.mockResolvedValue({
      id: "finance-1",
      title: "项目备用金",
      kind: BusinessFinanceKind.LOAN,
      status: BusinessFinanceStatus.PENDING,
      approverId: user.id,
      payerId: user.id,
      settlementOwnerId: user.id,
      settledAt: null,
    });
    prisma.businessMatterFinanceRecord.update.mockResolvedValue({
      id: "finance-1",
      title: "项目备用金",
      status: BusinessFinanceStatus.APPROVED,
    });

    await service.updateFinanceRecord("matter-1", "finance-1", {
      status: BusinessFinanceStatus.APPROVED,
    }, user);

    expect(prisma.businessMatterFinanceRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: BusinessFinanceStatus.APPROVED,
          approvedAt: expect.any(Date),
          approvedBy: { connect: { id: user.id } },
        }),
      }),
    );
  });

  it("records before-and-after responsibility values in the activity metadata", async () => {
    const admin = { ...user, role: UserRole.ADMIN };
    prisma.businessMatterFinanceRecord.findFirst.mockResolvedValue({
      id: "finance-1",
      recordNo: "REIM-1",
      title: "办公用品报销",
      kind: BusinessFinanceKind.REIMBURSEMENT,
      status: BusinessFinanceStatus.PENDING,
      applicantId: user.id,
      handlerId: user.id,
      approverId: user.id,
      payerId: null,
      settlementOwnerId: null,
      amount: "1280.00",
      currency: "CNY",
      dueDate: null,
      settledAt: null,
      rejectionReason: null,
      settlementNote: null,
    });
    prisma.businessMatterFinanceRecord.update.mockResolvedValue({
      id: "finance-1",
      recordNo: "REIM-1",
      title: "办公用品报销",
      kind: BusinessFinanceKind.REIMBURSEMENT,
      status: BusinessFinanceStatus.PENDING,
      applicantId: user.id,
      handlerId: user.id,
      approverId: "user-2",
      payerId: null,
      settlementOwnerId: null,
      amount: "1280.00",
      currency: "CNY",
      dueDate: null,
      settledAt: null,
      rejectionReason: null,
      settlementNote: null,
    });

    await service.updateFinanceRecord("matter-1", "finance-1", { approverId: "user-2" }, admin);

    expect(prisma.businessMatterActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            objectType: "FINANCE_RECORD",
            objectId: "finance-1",
            changes: expect.arrayContaining([
              { field: "审批负责人", before: user.id, after: "user-2" },
            ]),
          }),
        }),
      }),
    );
  });

  it("does not allow approving finance records without an assigned approver", async () => {
    prisma.businessMatterFinanceRecord.findFirst.mockResolvedValue({
      id: "finance-1",
      title: "报销",
      kind: BusinessFinanceKind.REIMBURSEMENT,
      status: BusinessFinanceStatus.PENDING,
      approverId: null,
    });

    await expect(
      service.updateFinanceRecord("matter-1", "finance-1", { status: BusinessFinanceStatus.APPROVED }, user),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.businessMatterFinanceRecord.update).not.toHaveBeenCalled();
  });

  it("requires a rejection reason when a finance record is rejected", async () => {
    prisma.businessMatterFinanceRecord.findFirst.mockResolvedValue({
      id: "finance-1",
      title: "报销",
      kind: BusinessFinanceKind.REIMBURSEMENT,
      status: BusinessFinanceStatus.PENDING,
      approverId: user.id,
    });

    await expect(
      service.updateFinanceRecord("matter-1", "finance-1", { status: BusinessFinanceStatus.REJECTED }, user),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.businessMatterFinanceRecord.update).not.toHaveBeenCalled();
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

  it("attaches and detaches task documents without deleting the source document", async () => {
    prisma.businessMatterTask.findFirst.mockResolvedValue({ id: "task-1", title: "整理材料" });
    prisma.document.findMany.mockResolvedValue([{ id: "document-1", currentVersionId: "version-1" }]);
    prisma.businessMatterTaskDocument.findMany.mockResolvedValue([]);
    prisma.businessMatterTaskDocument.createMany.mockResolvedValue({ count: 1 });

    await service.attachTaskDocuments("matter-1", "task-1", { documentIds: ["document-1"] }, user);

    expect(prisma.businessMatterTaskDocument.createMany).toHaveBeenCalledWith({
      data: [{ taskId: "task-1", documentId: "document-1", versionId: "version-1", relationType: "ATTACHMENT" }],
    });

    prisma.businessMatterTaskDocument.findFirst.mockResolvedValue({ taskId: "task-1", documentId: "document-1" });
    prisma.businessMatterTaskDocument.delete.mockResolvedValue({ taskId: "task-1", documentId: "document-1" });
    await service.detachTaskDocument("matter-1", "task-1", "document-1", user);

    expect(prisma.businessMatterTaskDocument.delete).toHaveBeenCalledWith({
      where: { taskId_documentId: { taskId: "task-1", documentId: "document-1" } },
    });
    expect(prisma.document.findMany).toHaveBeenCalledTimes(1);
  });

  it("attaches follow-up documents and rejects duplicate links", async () => {
    prisma.businessMatterFollowUp.findFirst.mockResolvedValue({ id: "follow-up-1", matterId: "matter-1" });
    prisma.document.findMany.mockResolvedValue([{ id: "document-2", currentVersionId: "version-2" }]);
    prisma.businessMatterFollowUpDocument.findMany.mockResolvedValue([]);
    prisma.businessMatterFollowUpDocument.createMany.mockResolvedValue({ count: 1 });

    await service.attachFollowUpDocuments("matter-1", "follow-up-1", { documentIds: ["document-2"] }, user);
    expect(prisma.businessMatterFollowUpDocument.createMany).toHaveBeenCalledWith({
      data: [{ followUpId: "follow-up-1", documentId: "document-2", versionId: "version-2", relationType: "ATTACHMENT" }],
    });

    prisma.businessMatterFollowUpDocument.findMany.mockResolvedValue([{ documentId: "document-2" }]);
    await expect(service.attachFollowUpDocuments("matter-1", "follow-up-1", { documentIds: ["document-2"] }, user)).rejects.toBeInstanceOf(ConflictException);
  });

  it("creates an issue for the matter owner and records its severity", async () => {
    prisma.businessMatterIssue.create.mockResolvedValue({
      id: "issue-1",
      kind: BusinessIssueKind.ISSUE,
      title: "供应商交付延期",
      severity: "HIGH",
      status: BusinessIssueStatus.OPEN,
      ownerId: user.id,
      ownerName: null,
      dueDate: null,
    });

    await service.createIssue("matter-1", {
      kind: BusinessIssueKind.ISSUE,
      title: " 供应商交付延期 ",
      severity: "HIGH",
    }, user);

    expect(prisma.businessMatterIssue.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        title: "供应商交付延期",
        severity: "HIGH",
        status: BusinessIssueStatus.OPEN,
        ownerId: user.id,
      }),
    }));
    expect(prisma.businessMatterActivity.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "ISSUE_CREATED" }),
    }));
  });

  it("requires a resolution before an issue can be marked resolved", async () => {
    prisma.businessMatterIssue.findFirst.mockResolvedValue({
      id: "issue-1",
      matterId: "matter-1",
      kind: BusinessIssueKind.ISSUE,
      title: "待处理问题",
      severity: "MEDIUM",
      status: BusinessIssueStatus.IN_PROGRESS,
      ownerId: user.id,
      ownerName: null,
      dueDate: null,
      resolution: null,
      resolvedAt: null,
      resolvedById: null,
    });

    await expect(service.updateIssue("matter-1", "issue-1", {
      status: BusinessIssueStatus.RESOLVED,
    }, user)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.businessMatterIssue.update).not.toHaveBeenCalled();
  });

  it("records the resolver and resolution when an issue is closed", async () => {
    prisma.businessMatterIssue.findFirst.mockResolvedValue({
      id: "issue-1",
      matterId: "matter-1",
      kind: BusinessIssueKind.RISK,
      title: "预算风险",
      severity: "HIGH",
      status: BusinessIssueStatus.IN_PROGRESS,
      ownerId: user.id,
      ownerName: null,
      dueDate: null,
      resolution: null,
      resolvedAt: null,
      resolvedById: null,
    });
    prisma.businessMatterIssue.update.mockResolvedValue({
      id: "issue-1",
      kind: BusinessIssueKind.RISK,
      title: "预算风险",
      severity: "HIGH",
      status: BusinessIssueStatus.RESOLVED,
      ownerId: user.id,
      ownerName: null,
      resolution: "已完成预算复核",
      resolvedById: user.id,
      resolvedAt: new Date(),
    });

    await service.updateIssue("matter-1", "issue-1", {
      status: BusinessIssueStatus.RESOLVED,
      resolution: "已完成预算复核",
    }, user);

    expect(prisma.businessMatterIssue.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: BusinessIssueStatus.RESOLVED,
        resolution: "已完成预算复核",
        resolvedBy: { connect: { id: user.id } },
      }),
    }));
  });

  it("attaches current document versions to issues and rejects duplicate links", async () => {
    prisma.businessMatterIssue.findFirst.mockResolvedValue({ id: "issue-1", matterId: "matter-1" });
    prisma.document.findMany.mockResolvedValue([{ id: "document-3", currentVersionId: "version-3" }]);
    prisma.businessMatterIssueDocument.findMany.mockResolvedValue([]);
    prisma.businessMatterIssueDocument.createMany.mockResolvedValue({ count: 1 });

    await service.attachIssueDocuments("matter-1", "issue-1", { documentIds: ["document-3"] }, user);

    expect(prisma.businessMatterIssueDocument.createMany).toHaveBeenCalledWith({
      data: [{ issueId: "issue-1", documentId: "document-3", versionId: "version-3", relationType: "ATTACHMENT" }],
    });

    prisma.businessMatterIssueDocument.findMany.mockResolvedValue([{ documentId: "document-3" }]);
    await expect(service.attachIssueDocuments("matter-1", "issue-1", { documentIds: ["document-3"] }, user))
      .rejects.toBeInstanceOf(ConflictException);
  });
});
