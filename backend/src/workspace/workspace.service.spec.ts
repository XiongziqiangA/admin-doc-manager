import { UserRole, UserStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PublicUser } from "../users/user.presenter";
import { WorkspaceService } from "./workspace.service";

describe("WorkspaceService", () => {
  const employee: PublicUser = {
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
  };
  const admin = { ...employee, id: "admin-1", username: "admin", role: UserRole.ADMIN };
  const prisma = {
    document: { count: vi.fn(), findMany: vi.fn() },
    asset: { count: vi.fn(), findMany: vi.fn() },
    businessMatter: { count: vi.fn(), findMany: vi.fn() },
    businessMatterTask: { count: vi.fn() },
    businessMatterFollowUp: { count: vi.fn() },
    businessMatterContract: { count: vi.fn() },
    businessMatterFinanceRecord: { aggregate: vi.fn() },
    approval: { count: vi.fn() },
  };

  beforeEach(() => {
    vi.resetAllMocks();
    prisma.document.count.mockResolvedValue(0);
    prisma.asset.count.mockResolvedValue(0);
    prisma.businessMatter.count.mockResolvedValue(0);
    prisma.businessMatterTask.count.mockResolvedValue(0);
    prisma.businessMatterFollowUp.count.mockResolvedValue(0);
    prisma.businessMatterContract.count.mockResolvedValue(0);
    prisma.businessMatterFinanceRecord.aggregate.mockResolvedValue({ _count: { _all: 0 }, _sum: { amount: null } });
    prisma.approval.count.mockResolvedValue(0);
    prisma.document.findMany.mockResolvedValue([]);
    prisma.businessMatter.findMany.mockResolvedValue([]);
    prisma.asset.findMany.mockResolvedValue([]);
  });

  it("returns a permission-scoped overview with separate document and operational metrics", async () => {
    prisma.document.count.mockResolvedValueOnce(12).mockResolvedValueOnce(3);
    prisma.asset.count.mockResolvedValueOnce(8).mockResolvedValueOnce(7).mockResolvedValueOnce(5).mockResolvedValueOnce(1).mockResolvedValueOnce(2).mockResolvedValueOnce(1);
    prisma.businessMatter.count.mockResolvedValueOnce(10).mockResolvedValueOnce(4);
    prisma.businessMatterTask.count.mockResolvedValueOnce(6).mockResolvedValueOnce(2).mockResolvedValueOnce(1);
    prisma.businessMatterFollowUp.count.mockResolvedValueOnce(3).mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    prisma.businessMatterContract.count.mockResolvedValue(2);
    prisma.approval.count.mockResolvedValue(1);
    prisma.businessMatterFinanceRecord.aggregate
      .mockResolvedValueOnce({ _count: { _all: 2 }, _sum: { amount: { toString: () => "1200.50" } } })
      .mockResolvedValueOnce({ _count: { _all: 1 }, _sum: { amount: { toString: () => "88.00" } } });

    const result = await new WorkspaceService(prisma as never).overview(employee);

    expect(result.documents).toEqual({ total: 12, monthAdded: 3 });
    expect(result.assets).toEqual({ total: 8, active: 7, available: 5, borrowed: 1, maintenance: 2, exitPending: 1 });
    expect(result.tasks).toEqual({ pending: 6, overdue: 2, dueSoon: 1 });
    expect(result.finance).toEqual({ loanCount: 2, loanAmount: "1200.50", reimbursementCount: 1, reimbursementAmount: "88.00" });

    const taskWhere = prisma.businessMatterTask.count.mock.calls[0][0].where;
    expect(taskWhere).toEqual(expect.objectContaining({ assigneeId: employee.id }));
    expect(taskWhere.matter).toEqual(expect.objectContaining({ createdBy: { organizationId: "org-1" } }));
    expect(prisma.approval.count).toHaveBeenCalledWith({ where: { organizationId: "org-1", status: "PENDING", applicantId: employee.id } });
  });

  it("searches incomplete terms across files, matters, and assets within the current enterprise", async () => {
    prisma.document.findMany.mockResolvedValueOnce([
      { id: "doc-1", title: "办公采购合同", documentNo: "DOC-1", updatedAt: new Date(), category: { name: "合同" }, subcategory: { name: "采购" }, currentVersion: { fileExt: "pdf" } },
    ]);
    prisma.businessMatter.findMany.mockResolvedValueOnce([
      { id: "matter-1", title: "办公采购项目", matterNo: "MATTER-1", type: "PROJECT", status: "IN_PROGRESS", updatedAt: new Date() },
    ]);
    prisma.asset.findMany.mockResolvedValueOnce([
      { id: "asset-1", name: "采购电脑", assetCode: "ASSET-1", assetStatus: "active", resourceStatus: "available", updatedAt: new Date() },
    ]);

    const result = await new WorkspaceService(prisma as never).search(employee, { q: "采购电", limit: 8 });

    expect(result.total).toBe(3);
    expect(result.results.documents[0].categoryPath).toEqual(["合同", "采购"]);
    expect(prisma.document.findMany.mock.calls[0][0].where).toEqual(expect.objectContaining({
      creator: { organizationId: "org-1" },
      deletedAt: null,
    }));
    expect(prisma.asset.findMany.mock.calls[0][0].where).toEqual(expect.objectContaining({ organizationId: "org-1", archivedAt: null }));
  });

  it("shows enterprise approval counts to administrators", async () => {
    await new WorkspaceService(prisma as never).overview(admin);

    expect(prisma.approval.count).toHaveBeenCalledWith({ where: { organizationId: "org-1", status: "PENDING" } });
    expect(prisma.businessMatterTask.count.mock.calls[0][0].where.assigneeId).toBeUndefined();
  });
});
