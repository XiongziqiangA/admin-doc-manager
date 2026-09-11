import { ConflictException, ForbiddenException } from "@nestjs/common";
import {
  ApprovalStatus,
  AssetExitStatus,
  AssetExitType,
  UserRole,
  UserStatus,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PublicUser } from "../users/user.presenter";
import { AssetExitsService } from "./asset-exits.service";

describe("AssetExitsService", () => {
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
  const request = {
    id: "exit-1",
    organizationId: "org-1",
    assetId: asset.id,
    applicantId: employee.id,
    approvalId: "approval-1",
    exitType: AssetExitType.SCRAPPED,
    reason: "设备无法修复",
    status: AssetExitStatus.PENDING,
    resourceStatusBefore: "available",
    asset: { ...asset, resourceStatus: "exit_pending", version: 4 },
  };
  const prisma = {
    asset: { findFirst: vi.fn(), updateMany: vi.fn() },
    assetExitRequest: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
    approval: { create: vi.fn(), updateMany: vi.fn() },
    approvalAction: { create: vi.fn() },
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
    prisma.assetExitRequest.findFirst.mockResolvedValue(null);
    prisma.assetExitRequest.findMany.mockResolvedValue([]);
    prisma.assetExitRequest.count.mockResolvedValue(0);
    prisma.assetExitRequest.create.mockResolvedValue(request);
    prisma.assetExitRequest.update.mockResolvedValue(request);
    prisma.asset.updateMany.mockResolvedValue({ count: 1 });
    prisma.approval.create.mockResolvedValue({ id: "approval-1", status: ApprovalStatus.PENDING });
    prisma.$transaction.mockImplementation(async (operation: unknown) => {
      if (typeof operation === "function") return (operation as (tx: typeof prisma) => Promise<unknown>)(prisma);
      return Promise.all(operation as Promise<unknown>[]);
    });
  });

  it("creates an employee exit request, approval, and pending asset lock", async () => {
    const service = new AssetExitsService(prisma as never, authorization as never);

    await service.create(employee, {
      assetId: asset.id,
      exitType: AssetExitType.SCRAPPED,
      reason: "设备无法修复",
    });

    expect(prisma.approval.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ businessType: "ASSET_EXIT", applicantId: employee.id, status: ApprovalStatus.PENDING }),
    }));
    expect(prisma.assetExitRequest.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ resourceStatusBefore: "available", status: AssetExitStatus.PENDING }),
    }));
    expect(prisma.asset.updateMany).toHaveBeenCalledWith({
      where: { id: asset.id, organizationId: "org-1", version: 3, resourceStatus: "available" },
      data: { resourceStatus: "exit_pending", version: { increment: 1 } },
    });
  });

  it("auto-approves an administrator request and archives the asset immediately", async () => {
    prisma.assetExitRequest.create.mockResolvedValue({ ...request, applicantId: admin.id, status: AssetExitStatus.APPROVED });
    const service = new AssetExitsService(prisma as never, authorization as never);

    await service.create(admin, {
      assetId: asset.id,
      exitType: AssetExitType.LOST,
      reason: "确认遗失",
    });

    expect(prisma.asset.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ assetStatus: "lost", resourceStatus: "retired", archivedAt: expect.any(Date) }),
    }));
    expect(prisma.approvalAction.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "APPROVE" }),
    }));
  });

  it("scopes employee lists to their own requests", async () => {
    const service = new AssetExitsService(prisma as never, authorization as never);

    await service.list(employee, { page: 1, pageSize: 20 });
    expect(prisma.assetExitRequest.findMany.mock.calls[0][0].where).toEqual(expect.objectContaining({
      organizationId: "org-1",
      applicantId: employee.id,
    }));
  });

  it("cancels a pending own request and restores the previous resource state", async () => {
    prisma.assetExitRequest.findFirst.mockResolvedValue(request);
    prisma.assetExitRequest.update.mockResolvedValue({ ...request, status: AssetExitStatus.CANCELLED });
    const service = new AssetExitsService(prisma as never, authorization as never);

    await service.cancel(employee, request.id, { reason: "信息填写错误" });

    expect(prisma.asset.updateMany).toHaveBeenCalledWith({
      where: { id: asset.id, organizationId: "org-1", version: 4, resourceStatus: "exit_pending" },
      data: { resourceStatus: "available", version: { increment: 1 } },
    });
    expect(prisma.approval.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: ApprovalStatus.CANCELLED }),
    }));
  });

  it("prevents an employee from cancelling another employee's request", async () => {
    prisma.assetExitRequest.findFirst.mockResolvedValue({ ...request, applicantId: "user-2" });
    const service = new AssetExitsService(prisma as never, authorization as never);

    await expect(service.cancel(employee, request.id, {})).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects exit requests for assets that are currently borrowed", async () => {
    prisma.asset.findFirst.mockResolvedValue({ ...asset, resourceStatus: "borrowed" });
    const service = new AssetExitsService(prisma as never, authorization as never);

    await expect(service.create(employee, {
      assetId: asset.id,
      exitType: AssetExitType.SCRAPPED,
      reason: "设备无法修复",
    })).rejects.toBeInstanceOf(ConflictException);
  });
});
