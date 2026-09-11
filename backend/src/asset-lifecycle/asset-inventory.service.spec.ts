import { ConflictException, ForbiddenException } from "@nestjs/common";
import {
  AssetAnomalyStatus,
  AssetInventoryResult,
  AssetInventoryScopeType,
  AssetInventoryStatus,
  UserRole,
  UserStatus,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PublicUser } from "../users/user.presenter";
import { AssetInventoryService } from "./asset-inventory.service";

describe("AssetInventoryService", () => {
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
  const task = {
    id: "task-1",
    organizationId: "org-1",
    name: "九月固定资产盘点",
    scopeType: AssetInventoryScopeType.ORGANIZATION,
    scopeValue: null,
    plannedStart: new Date("2026-09-12T00:00:00.000Z"),
    plannedEnd: new Date("2026-09-20T00:00:00.000Z"),
    ownerId: employee.id,
    status: AssetInventoryStatus.OPEN,
    createdById: admin.id,
  };
  const prisma = {
    user: { findFirst: vi.fn() },
    department: { findFirst: vi.fn() },
    location: { findFirst: vi.fn() },
    businessMatter: { findFirst: vi.fn() },
    assetType: { findFirst: vi.fn() },
    asset: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    assetInventoryTask: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), update: vi.fn() },
    assetInventoryRecord: { upsert: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    assetAnomaly: { findMany: vi.fn(), createMany: vi.fn(), updateMany: vi.fn() },
    assetEvent: { create: vi.fn(), createMany: vi.fn() },
    auditLog: { create: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  };
  const authorization = { assertAllPermissions: vi.fn() };

  beforeEach(() => {
    vi.resetAllMocks();
    authorization.assertAllPermissions.mockResolvedValue(undefined);
    prisma.user.findFirst.mockResolvedValue({ id: employee.id });
    prisma.location.findFirst.mockResolvedValue({ id: "location-b" });
    prisma.assetInventoryTask.findFirst.mockResolvedValue(task);
    prisma.assetInventoryTask.create.mockResolvedValue(task);
    prisma.assetInventoryTask.findMany.mockResolvedValue([]);
    prisma.assetInventoryTask.count.mockResolvedValue(0);
    prisma.assetInventoryRecord.findMany.mockResolvedValue([]);
    prisma.assetAnomaly.findMany.mockResolvedValue([]);
    prisma.assetAnomaly.createMany.mockResolvedValue({ count: 0 });
    prisma.assetAnomaly.updateMany.mockResolvedValue({ count: 0 });
    prisma.assetEvent.createMany.mockResolvedValue({ count: 0 });
    prisma.asset.count.mockResolvedValue(0);
    prisma.$transaction.mockImplementation(async (operation: unknown) => {
      if (typeof operation === "function") {
        return (operation as (tx: typeof prisma) => Promise<unknown>)(prisma);
      }
      return Promise.all(operation as Promise<unknown>[]);
    });
  });

  it("creates a scoped task with an active enterprise owner and audit record", async () => {
    const service = new AssetInventoryService(prisma as never, authorization as never);

    await service.create(admin, {
      name: "九月固定资产盘点",
      scopeType: AssetInventoryScopeType.ORGANIZATION,
      plannedStart: "2026-09-12T00:00:00.000Z",
      plannedEnd: "2026-09-20T00:00:00.000Z",
      ownerId: employee.id,
    });

    expect(prisma.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: employee.id, organizationId: "org-1", status: UserStatus.ACTIVE }),
    }));
    expect(prisma.assetInventoryTask.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ organizationId: "org-1", ownerId: employee.id, scopeValue: undefined }),
    }));
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "asset_inventory.created", targetType: "asset_inventory_task" }),
    }));
  });

  it("only lists assigned tasks for employees while administrators see the enterprise list", async () => {
    const service = new AssetInventoryService(prisma as never, authorization as never);

    await service.list(employee, { page: 1, pageSize: 20 });
    expect(prisma.assetInventoryTask.findMany.mock.calls[0][0].where).toEqual(expect.objectContaining({
      organizationId: "org-1",
      ownerId: employee.id,
    }));

    await service.list(admin, { page: 1, pageSize: 20 });
    expect(prisma.assetInventoryTask.findMany.mock.calls[1][0].where).toEqual({ organizationId: "org-1" });
  });

  it("records all observed mismatches and opens matching anomalies", async () => {
    prisma.asset.findFirst.mockResolvedValue({
      id: "asset-1",
      organizationId: "org-1",
      assetCode: "DEV-001",
      name: "会议电脑",
      locationId: "location-a",
      ownerUserId: "user-2",
      assetStatus: "active",
      archivedAt: null,
    });
    prisma.assetInventoryRecord.upsert.mockResolvedValue({ id: "record-1", taskId: task.id, assetId: "asset-1" });
    const service = new AssetInventoryService(prisma as never, authorization as never);

    const result = await service.record(employee, task.id, {
      assetId: "asset-1",
      checkedLocationId: "location-b",
      checkedOwnerId: employee.id,
      checkedAssetStatus: "damaged",
      note: "外壳破损",
    });

    expect(prisma.assetInventoryRecord.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        result: AssetInventoryResult.LOCATION_MISMATCH,
        exceptionTypes: ["LOCATION_MISMATCH", "STATUS_MISMATCH", "OWNER_MISMATCH"],
      }),
    }));
    expect(prisma.assetAnomaly.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.arrayContaining([
        expect.objectContaining({ type: "LOCATION_MISMATCH", sourceType: "inventory_record", sourceId: "record-1" }),
        expect.objectContaining({ type: "STATUS_MISMATCH" }),
        expect.objectContaining({ type: "OWNER_MISMATCH" }),
      ]),
    }));
    expect(result).toEqual(expect.objectContaining({ id: "record-1" }));
  });

  it("prevents an employee from recording another owner's task", async () => {
    prisma.assetInventoryTask.findFirst.mockResolvedValue({ ...task, ownerId: "user-2" });
    const service = new AssetInventoryService(prisma as never, authorization as never);

    await expect(service.record(employee, task.id, { assetId: "asset-1" })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.assetInventoryRecord.upsert).not.toHaveBeenCalled();
  });

  it("completes a task and creates one missing anomaly for each uncounted scoped asset", async () => {
    prisma.asset.findMany.mockResolvedValue([
      { id: "asset-1", assetCode: "DEV-001", name: "会议电脑" },
      { id: "asset-2", assetCode: "DEV-002", name: "投影仪" },
    ]);
    prisma.assetInventoryRecord.findMany.mockResolvedValue([{ assetId: "asset-1" }]);
    prisma.assetAnomaly.findMany.mockResolvedValue([]);
    prisma.assetInventoryTask.update.mockResolvedValue({ ...task, status: AssetInventoryStatus.COMPLETED });
    const service = new AssetInventoryService(prisma as never, authorization as never);

    await service.complete(admin, task.id);

    expect(prisma.assetAnomaly.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        assetId: "asset-2",
        type: "MISSING",
        status: AssetAnomalyStatus.OPEN,
        sourceType: "inventory_task",
        sourceId: task.id,
      })],
    });
    expect(prisma.assetInventoryTask.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: task.id },
      data: expect.objectContaining({ status: AssetInventoryStatus.COMPLETED }),
    }));
  });

  it("rejects completion when the inventory task is already cancelled", async () => {
    prisma.assetInventoryTask.findFirst.mockResolvedValue({ ...task, status: AssetInventoryStatus.CANCELLED });
    const service = new AssetInventoryService(prisma as never, authorization as never);

    await expect(service.complete(admin, task.id)).rejects.toBeInstanceOf(ConflictException);
  });
});
