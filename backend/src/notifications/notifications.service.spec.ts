import { UserRole, UserStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationsService } from "./notifications.service";

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
};

describe("NotificationsService", () => {
  const prisma = {
    approval: { findMany: vi.fn() },
    businessMatterTask: { findMany: vi.fn() },
    businessMatterFollowUp: { findMany: vi.fn() },
    businessMatterContract: { findMany: vi.fn() },
    assetBorrowRecord: { findMany: vi.fn() },
    notification: {
      upsert: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    $transaction: vi.fn((queries: Promise<unknown>[]) => Promise.all(queries)),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.approval.findMany.mockResolvedValue([]);
    prisma.businessMatterTask.findMany.mockResolvedValue([]);
    prisma.businessMatterFollowUp.findMany.mockResolvedValue([]);
    prisma.businessMatterContract.findMany.mockResolvedValue([]);
    prisma.assetBorrowRecord.findMany.mockResolvedValue([]);
    prisma.notification.upsert.mockResolvedValue({});
    prisma.notification.findMany.mockResolvedValue([]);
    prisma.notification.count.mockResolvedValue(0);
    prisma.notification.updateMany.mockResolvedValue({ count: 0 });
  });

  it("materializes an overdue task reminder only for the current employee", async () => {
    const dueDate = new Date(Date.now() - 60 * 60 * 1000);
    prisma.businessMatterTask.findMany.mockResolvedValueOnce([
      { id: "task-1", title: "提交材料", dueDate, matterId: "matter-1" },
    ]);
    prisma.notification.findMany.mockResolvedValueOnce([{ id: "notice-1", recipientId: employee.id, readAt: null }]);
    prisma.notification.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);

    const result = await new NotificationsService(prisma as never).list(employee, { page: 1, pageSize: 20, unreadOnly: false });

    expect(result.unreadCount).toBe(1);
    expect(prisma.notification.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { dedupeKey: expect.stringContaining("task:org-1:user-1:task-1:overdue") },
      create: expect.objectContaining({ recipientId: "user-1", entityType: "business_matter", entityId: "matter-1" }),
    }));
    expect(prisma.businessMatterTask.findMany.mock.calls[0][0].where).toEqual(expect.objectContaining({
      assigneeId: "user-1",
      matter: expect.objectContaining({ createdBy: { organizationId: "org-1" } }),
    }));
  });

  it("marks only the current user's notification as read", async () => {
    prisma.notification.updateMany.mockResolvedValueOnce({ count: 1 });
    prisma.notification.findUniqueOrThrow.mockResolvedValueOnce({ id: "notice-1", readAt: new Date() });

    await new NotificationsService(prisma as never).markRead(employee, "notice-1");

    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { id: "notice-1", organizationId: "org-1", recipientId: "user-1", readAt: null },
      data: { readAt: expect.any(Date) },
    });
  });

  it("does not expose a notification belonging to another employee", async () => {
    prisma.notification.updateMany.mockResolvedValueOnce({ count: 0 });
    prisma.notification.findFirst.mockResolvedValueOnce(null);

    await expect(new NotificationsService(prisma as never).markRead(employee, "notice-other")).rejects.toThrow("通知不存在");
    expect(prisma.notification.findFirst).toHaveBeenCalledWith({
      where: { id: "notice-other", organizationId: "org-1", recipientId: "user-1" },
    });
  });
});
