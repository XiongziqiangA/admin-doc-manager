import { ForbiddenException } from "@nestjs/common";
import {
  AssetAnomalySeverity,
  AssetAnomalyStatus,
  AssetAnomalyType,
  UserRole,
  UserStatus,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PublicUser } from "../users/user.presenter";
import { AssetAnomaliesService } from "./asset-anomalies.service";

describe("AssetAnomaliesService", () => {
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
  const anomaly = {
    id: "anomaly-1",
    organizationId: "org-1",
    assetId: "asset-1",
    type: AssetAnomalyType.DAMAGE,
    severity: AssetAnomalySeverity.HIGH,
    status: AssetAnomalyStatus.OPEN,
    description: "显示屏破损",
    assignedToId: employee.id,
  };
  const prisma = {
    asset: { findFirst: vi.fn() },
    user: { findFirst: vi.fn() },
    assetAnomaly: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
    assetEvent: { create: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  const authorization = { assertAllPermissions: vi.fn() };

  beforeEach(() => {
    vi.resetAllMocks();
    authorization.assertAllPermissions.mockResolvedValue(undefined);
    prisma.asset.findFirst.mockResolvedValue({ id: "asset-1", assetCode: "DEV-001", name: "会议电脑" });
    prisma.user.findFirst.mockResolvedValue({ id: employee.id });
    prisma.assetAnomaly.findFirst.mockResolvedValue(anomaly);
    prisma.assetAnomaly.findMany.mockResolvedValue([]);
    prisma.assetAnomaly.count.mockResolvedValue(0);
    prisma.assetAnomaly.create.mockResolvedValue(anomaly);
    prisma.assetAnomaly.update.mockResolvedValue(anomaly);
    prisma.$transaction.mockImplementation(async (operation: unknown) => {
      if (typeof operation === "function") return (operation as (tx: typeof prisma) => Promise<unknown>)(prisma);
      return Promise.all(operation as Promise<unknown>[]);
    });
  });

  it("limits employee lists to assigned anomalies", async () => {
    const service = new AssetAnomaliesService(prisma as never, authorization as never);

    await service.list(employee, { page: 1, pageSize: 20 });
    expect(prisma.assetAnomaly.findMany.mock.calls[0][0].where).toEqual(expect.objectContaining({
      organizationId: "org-1",
      assignedToId: employee.id,
    }));

    await service.list(admin, { page: 1, pageSize: 20 });
    expect(prisma.assetAnomaly.findMany.mock.calls[1][0].where).toEqual({ organizationId: "org-1" });
  });

  it("lets an employee report an anomaly and assigns it to the reporter", async () => {
    const service = new AssetAnomaliesService(prisma as never, authorization as never);

    await service.create(employee, {
      assetId: "asset-1",
      type: AssetAnomalyType.DAMAGE,
      severity: AssetAnomalySeverity.HIGH,
      description: "显示屏破损",
    });

    expect(prisma.assetAnomaly.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ assignedToId: employee.id, sourceType: "manual_report" }),
    }));
    expect(prisma.assetEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ eventType: "anomaly_reported" }),
    }));
  });

  it("lets an administrator reassign an anomaly to an active enterprise user", async () => {
    const service = new AssetAnomaliesService(prisma as never, authorization as never);

    await service.assign(admin, anomaly.id, { assignedToId: "user-2" });

    expect(prisma.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "user-2", organizationId: "org-1", status: UserStatus.ACTIVE }),
    }));
    expect(prisma.assetAnomaly.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { assignedToId: "user-2" },
    }));
  });

  it("lets the assignee resolve an anomaly and records the result", async () => {
    prisma.assetAnomaly.update.mockResolvedValue({
      ...anomaly,
      status: AssetAnomalyStatus.RESOLVED,
      resolution: "已更换显示屏",
    });
    const service = new AssetAnomaliesService(prisma as never, authorization as never);

    await service.resolve(employee, anomaly.id, { resolution: "已更换显示屏" });

    expect(prisma.assetAnomaly.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: AssetAnomalyStatus.RESOLVED, resolution: "已更换显示屏" }),
    }));
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "asset_anomaly.resolved" }),
    }));
  });

  it("prevents another employee from resolving an unassigned anomaly", async () => {
    prisma.assetAnomaly.findFirst.mockResolvedValue({ ...anomaly, assignedToId: "user-2" });
    const service = new AssetAnomaliesService(prisma as never, authorization as never);

    await expect(service.resolve(employee, anomaly.id, { resolution: "已处理" })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.assetAnomaly.update).not.toHaveBeenCalled();
  });
});
