import { BadRequestException, ConflictException } from "@nestjs/common";
import { AssetTransferStatus, UserRole, UserStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PublicUser } from "../users/user.presenter";
import { AssetTransfersService } from "./asset-transfers.service";

describe("AssetTransfersService", () => {
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
    departmentId: "department-1",
    locationId: "location-1",
    ownerUserId: "owner-1",
    assetStatus: "active",
    resourceStatus: "available",
    version: 1,
  };
  const transfer = {
    id: "transfer-1",
    organizationId: "org-1",
    assetId: "asset-1",
    status: AssetTransferStatus.APPROVED,
    fromOwnerId: "owner-1",
    toOwnerId: "owner-2",
    toDepartmentId: "department-2",
    toLocationId: "location-2",
    asset: { ...asset, resourceStatus: "transferring" },
  };
  const dto = {
    assetId: "asset-1",
    toDepartmentId: "department-2",
    toLocationId: "location-2",
    toOwnerId: "owner-2",
    reason: "调整至新办公区",
  };
  const prisma = {
    asset: { findFirst: vi.fn(), updateMany: vi.fn() },
    department: { findFirst: vi.fn() },
    location: { findFirst: vi.fn() },
    user: { findFirst: vi.fn() },
    assetTransfer: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
    assetReservation: { count: vi.fn() },
    approval: { create: vi.fn(), updateMany: vi.fn() },
    approvalAction: { create: vi.fn() },
    assetHandoverRecord: { create: vi.fn() },
    assetEvent: { create: vi.fn() },
    auditLog: { create: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  };
  const authorization = { assertAllPermissions: vi.fn() };
  const idempotency = {
    execute: vi.fn().mockImplementation(
      (_user: unknown, _operation: string, _key: string, _payload: unknown, handler: (tx: typeof prisma) => Promise<unknown>) => handler(prisma),
    ),
  };

  beforeEach(() => {
    vi.resetAllMocks();
    authorization.assertAllPermissions.mockResolvedValue(undefined);
    idempotency.execute.mockImplementation(
      (_user: unknown, _operation: string, _key: string, _payload: unknown, handler: (tx: typeof prisma) => Promise<unknown>) => handler(prisma),
    );
    prisma.$transaction.mockImplementation(async (operation: unknown) => {
      if (typeof operation === "function") return (operation as (tx: typeof prisma) => Promise<unknown>)(prisma);
      return Promise.all(operation as Promise<unknown>[]);
    });
    prisma.asset.findFirst.mockResolvedValue(asset);
    prisma.department.findFirst.mockResolvedValue({ id: "department-2" });
    prisma.location.findFirst.mockResolvedValue({ id: "location-2", organizationId: "org-1", enabled: true });
    prisma.user.findFirst.mockResolvedValue({ id: "owner-2", organizationId: "org-1", status: "ACTIVE" });
    prisma.assetTransfer.create.mockResolvedValue(transfer);
    prisma.asset.updateMany.mockResolvedValue({ count: 1 });
    prisma.assetReservation.count.mockResolvedValue(0);
  });

  it("creates an approved transfer and locks the asset for handover", async () => {
    const service = new AssetTransfersService(prisma as never, authorization as never, idempotency as never);

    const result = await service.create(admin, "request-0001", dto);

    expect(result.status).toBe(AssetTransferStatus.APPROVED);
    expect(prisma.assetTransfer.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ fromDepartmentId: "department-1", toDepartmentId: "department-2" }),
    }));
    expect(prisma.asset.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { resourceStatus: "transferring", version: { increment: 1 } },
    }));
    expect(prisma.approval.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ businessType: "ASSET_TRANSFER", status: "APPROVED" }),
    }));
  });

  it("rejects a transfer with no destination change", async () => {
    const service = new AssetTransfersService(prisma as never, authorization as never, idempotency as never);

    await expect(service.create(admin, "request-0001", {
      ...dto,
      toDepartmentId: asset.departmentId,
      toLocationId: asset.locationId,
      toOwnerId: asset.ownerUserId,
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.assetTransfer.create).not.toHaveBeenCalled();
  });

  it("prevents a borrowed asset from entering transfer", async () => {
    prisma.asset.findFirst.mockResolvedValue({ ...asset, resourceStatus: "borrowed" });
    const service = new AssetTransfersService(prisma as never, authorization as never, idempotency as never);

    await expect(service.create(admin, "request-0001", dto)).rejects.toBeInstanceOf(ConflictException);
  });

  it.each(["maintenance", "exit_pending"])("prevents an asset in %s state from entering transfer", async (resourceStatus) => {
    prisma.asset.findFirst.mockResolvedValue({ ...asset, resourceStatus });
    const service = new AssetTransfersService(prisma as never, authorization as never, idempotency as never);

    await expect(service.create(admin, "request-0001", dto)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.assetTransfer.create).not.toHaveBeenCalled();
  });

  it("completes a transfer and records its handover atomically", async () => {
    prisma.assetTransfer.findFirst.mockResolvedValue(transfer);
    prisma.assetTransfer.update.mockResolvedValue({ ...transfer, status: AssetTransferStatus.COMPLETED });
    const service = new AssetTransfersService(prisma as never, authorization as never, idempotency as never);

    const result = await service.complete(admin, "transfer-1", { items: ["电源适配器"], note: "交接完成" });

    expect(result.status).toBe(AssetTransferStatus.COMPLETED);
    expect(prisma.asset.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        departmentId: "department-2",
        locationId: "location-2",
        ownerUserId: "owner-2",
        resourceStatus: "available",
      }),
    }));
    expect(prisma.assetHandoverRecord.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ handoverType: "TRANSFER", status: "CONFIRMED" }),
    }));
  });
});
