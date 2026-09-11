import { ConflictException } from "@nestjs/common";
import {
  AssetMaintenanceStatus,
  AssetMaintenanceType,
  UserRole,
  UserStatus,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PublicUser } from "../users/user.presenter";
import { AssetMaintenanceService } from "./asset-maintenance.service";

describe("AssetMaintenanceService", () => {
  const admin: PublicUser = {
    id: "admin-1",
    username: "admin",
    realName: "管理员",
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
    organizationId: "org-1",
    departmentId: null,
    phone: null,
    email: null,
    createdAt: new Date("2026-09-11T00:00:00.000Z"),
    updatedAt: new Date("2026-09-11T00:00:00.000Z"),
  };
  const asset = {
    id: "asset-1",
    organizationId: "org-1",
    assetCode: "DEV-001",
    name: "会议电脑",
    assetStatus: "active",
    resourceStatus: "available",
    version: 3,
    archivedAt: null,
  };
  const scheduled = {
    id: "maintenance-1",
    organizationId: "org-1",
    assetId: asset.id,
    maintenanceType: AssetMaintenanceType.REPAIR,
    title: "更换电池",
    status: AssetMaintenanceStatus.SCHEDULED,
    resourceStatusBefore: null,
    asset,
  };
  const prisma = {
    asset: { findFirst: vi.fn(), updateMany: vi.fn() },
    assetMaintenanceRecord: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    assetEvent: { create: vi.fn() },
    auditLog: { create: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  };
  const authorization = { assertAllPermissions: vi.fn() };

  beforeEach(() => {
    vi.resetAllMocks();
    authorization.assertAllPermissions.mockResolvedValue(undefined);
    prisma.asset.findFirst.mockResolvedValue(asset);
    prisma.assetMaintenanceRecord.findFirst.mockResolvedValue(null);
    prisma.assetMaintenanceRecord.findMany.mockResolvedValue([]);
    prisma.assetMaintenanceRecord.count.mockResolvedValue(0);
    prisma.assetMaintenanceRecord.create.mockResolvedValue(scheduled);
    prisma.assetMaintenanceRecord.update.mockResolvedValue(scheduled);
    prisma.asset.updateMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockImplementation(async (operation: unknown) => {
      if (typeof operation === "function") {
        return (operation as (tx: typeof prisma) => Promise<unknown>)(prisma);
      }
      return Promise.all(operation as Promise<unknown>[]);
    });
  });

  it("creates a scheduled maintenance record without locking the asset", async () => {
    const service = new AssetMaintenanceService(prisma as never, authorization as never);

    await service.create(admin, {
      assetId: asset.id,
      maintenanceType: AssetMaintenanceType.REPAIR,
      title: "更换电池",
      plannedAt: "2026-09-15T01:00:00.000Z",
      cost: 350,
    });

    expect(prisma.assetMaintenanceRecord.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ organizationId: "org-1", assetId: asset.id, status: AssetMaintenanceStatus.SCHEDULED }),
    }));
    expect(prisma.asset.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "asset_maintenance.created" }),
    }));
  });

  it("rejects a second unfinished maintenance record for the same asset", async () => {
    prisma.assetMaintenanceRecord.findFirst.mockResolvedValue(scheduled);
    const service = new AssetMaintenanceService(prisma as never, authorization as never);

    await expect(service.create(admin, {
      assetId: asset.id,
      maintenanceType: AssetMaintenanceType.INSPECTION,
      title: "设备巡检",
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it("starts maintenance and moves an available asset into maintenance state", async () => {
    prisma.assetMaintenanceRecord.findFirst.mockResolvedValue(scheduled);
    prisma.assetMaintenanceRecord.update.mockResolvedValue({
      ...scheduled,
      status: AssetMaintenanceStatus.IN_PROGRESS,
      resourceStatusBefore: "available",
    });
    const service = new AssetMaintenanceService(prisma as never, authorization as never);

    await service.start(admin, scheduled.id);

    expect(prisma.asset.updateMany).toHaveBeenCalledWith({
      where: { id: asset.id, organizationId: "org-1", version: 3, resourceStatus: "available" },
      data: { resourceStatus: "maintenance", version: { increment: 1 } },
    });
    expect(prisma.assetMaintenanceRecord.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: AssetMaintenanceStatus.IN_PROGRESS, resourceStatusBefore: "available" }),
    }));
  });

  it("completes maintenance and restores the resource state held before maintenance", async () => {
    prisma.assetMaintenanceRecord.findFirst.mockResolvedValue({
      ...scheduled,
      status: AssetMaintenanceStatus.IN_PROGRESS,
      resourceStatusBefore: "reserved",
      asset: { ...asset, resourceStatus: "maintenance", version: 4 },
    });
    prisma.assetMaintenanceRecord.update.mockResolvedValue({ ...scheduled, status: AssetMaintenanceStatus.COMPLETED });
    const service = new AssetMaintenanceService(prisma as never, authorization as never);

    await service.complete(admin, scheduled.id, { cost: 420, description: "已更换电池并测试" });

    expect(prisma.asset.updateMany).toHaveBeenCalledWith({
      where: { id: asset.id, organizationId: "org-1", version: 4, resourceStatus: "maintenance" },
      data: { resourceStatus: "reserved", version: { increment: 1 } },
    });
    expect(prisma.assetMaintenanceRecord.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: AssetMaintenanceStatus.COMPLETED, cost: 420 }),
    }));
  });

  it("cancels active maintenance and restores the asset state", async () => {
    prisma.assetMaintenanceRecord.findFirst.mockResolvedValue({
      ...scheduled,
      status: AssetMaintenanceStatus.IN_PROGRESS,
      resourceStatusBefore: "available",
      asset: { ...asset, resourceStatus: "maintenance", version: 4 },
    });
    prisma.assetMaintenanceRecord.update.mockResolvedValue({ ...scheduled, status: AssetMaintenanceStatus.CANCELLED });
    const service = new AssetMaintenanceService(prisma as never, authorization as never);

    await service.cancel(admin, scheduled.id, { reason: "维修计划调整" });

    expect(prisma.asset.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { resourceStatus: "available", version: { increment: 1 } },
    }));
  });
});
