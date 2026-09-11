import { ConflictException, ForbiddenException } from "@nestjs/common";
import { AssetBorrowStatus, AssetReservationStatus, UserRole, UserStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PublicUser } from "../users/user.presenter";
import { AssetBorrowsService } from "./asset-borrows.service";

describe("AssetBorrowsService", () => {
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
  const dto = {
    assetId: "asset-1",
    borrowStart: "2026-09-20T01:00:00.000Z",
    borrowEnd: "2026-09-20T03:00:00.000Z",
    purpose: "外出会议",
  };
  const asset = {
    id: "asset-1",
    organizationId: "org-1",
    assetStatus: "active",
    resourceStatus: "available",
    version: 1,
  };
  const pendingBorrow = {
    id: "borrow-1",
    organizationId: "org-1",
    assetId: "asset-1",
    applicantId: employee.id,
    reservationId: null,
    approvalId: "approval-1",
    status: AssetBorrowStatus.REQUESTED,
    asset,
    applicant: { id: employee.id, realName: employee.realName, username: employee.username },
  };
  const prisma = {
    asset: { findFirst: vi.fn(), updateMany: vi.fn() },
    assetReservation: { findFirst: vi.fn(), count: vi.fn(), updateMany: vi.fn() },
    assetBorrowRecord: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
    businessMatter: { findFirst: vi.fn() },
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
    prisma.assetReservation.findFirst.mockResolvedValue(null);
    prisma.assetReservation.count.mockResolvedValue(0);
    prisma.assetBorrowRecord.findFirst.mockResolvedValue(null);
    prisma.approval.create.mockResolvedValue({ id: "approval-1" });
    prisma.assetBorrowRecord.create.mockResolvedValue(pendingBorrow);
    prisma.asset.updateMany.mockResolvedValue({ count: 1 });
  });

  it("creates an employee borrow request with an approval and audit trail", async () => {
    const service = new AssetBorrowsService(prisma as never, authorization as never, idempotency as never);

    const result = await service.create(employee, "request-0001", dto);

    expect(result.status).toBe(AssetBorrowStatus.REQUESTED);
    expect(prisma.approval.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ businessType: "ASSET_BORROW", applicantId: employee.id, status: "PENDING" }),
    }));
    expect(prisma.assetBorrowRecord.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ organizationId: "org-1", applicantId: employee.id }),
    }));
    expect(prisma.assetEvent.create).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("rejects a borrow request when another borrow overlaps", async () => {
    prisma.assetBorrowRecord.findFirst.mockResolvedValueOnce({ id: "borrow-existing" });
    const service = new AssetBorrowsService(prisma as never, authorization as never, idempotency as never);

    await expect(service.create(employee, "request-0001", dto)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.assetBorrowRecord.create).not.toHaveBeenCalled();
  });

  it.each(["maintenance", "exit_pending"])("rejects a borrow request while the asset resource state is %s", async (resourceStatus) => {
    prisma.asset.findFirst.mockResolvedValue({ ...pendingBorrow.asset, organizationId: "org-1", resourceStatus });
    const service = new AssetBorrowsService(prisma as never, authorization as never, idempotency as never);

    await expect(service.create(employee, "request-0001", dto)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.assetBorrowRecord.create).not.toHaveBeenCalled();
  });

  it("allows the applicant to convert their approved reservation into a borrow request", async () => {
    prisma.assetReservation.findFirst
      .mockResolvedValueOnce({
        id: "reservation-1",
        assetId: "asset-1",
        applicantId: employee.id,
        status: AssetReservationStatus.APPROVED,
        startAt: new Date(dto.borrowStart),
        endAt: new Date(dto.borrowEnd),
      })
      .mockResolvedValueOnce(null);
    const service = new AssetBorrowsService(prisma as never, authorization as never, idempotency as never);

    await service.create(employee, "request-0001", { ...dto, reservationId: "reservation-1" });

    expect(prisma.assetBorrowRecord.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ reservationId: "reservation-1" }),
    }));
  });

  it("checks out an approved borrow and creates a confirmed handover", async () => {
    prisma.assetBorrowRecord.findFirst.mockResolvedValue({ ...pendingBorrow, status: AssetBorrowStatus.APPROVED });
    prisma.assetBorrowRecord.update.mockResolvedValue({ ...pendingBorrow, status: AssetBorrowStatus.ACTIVE });
    const service = new AssetBorrowsService(prisma as never, authorization as never, idempotency as never);

    const result = await service.checkout(admin, "borrow-1", { items: ["电源适配器"], note: "外观正常" });

    expect(result.status).toBe(AssetBorrowStatus.ACTIVE);
    expect(prisma.asset.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ resourceStatus: "borrowed", usingUserId: employee.id }),
    }));
    expect(prisma.assetHandoverRecord.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ handoverType: "CHECKOUT", status: "CONFIRMED" }),
    }));
  });

  it("allows only the applicant or an administrator to request return", async () => {
    prisma.assetBorrowRecord.findFirst.mockResolvedValue({ ...pendingBorrow, applicantId: "user-2", status: AssetBorrowStatus.ACTIVE });
    const service = new AssetBorrowsService(prisma as never, authorization as never, idempotency as never);

    await expect(service.requestReturn(employee, "borrow-1", { note: "准备归还" })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.assetBorrowRecord.update).not.toHaveBeenCalled();
  });

  it("confirms return, releases the asset, and completes its source reservation", async () => {
    prisma.assetBorrowRecord.findFirst.mockResolvedValue({
      ...pendingBorrow,
      reservationId: "reservation-1",
      status: AssetBorrowStatus.RETURN_PENDING,
    });
    prisma.assetBorrowRecord.update.mockResolvedValue({ ...pendingBorrow, status: AssetBorrowStatus.RETURNED });
    const service = new AssetBorrowsService(prisma as never, authorization as never, idempotency as never);

    const result = await service.confirmReturn(admin, "borrow-1", { items: ["电源适配器"], note: "归还完整" });

    expect(result.status).toBe(AssetBorrowStatus.RETURNED);
    expect(prisma.asset.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ resourceStatus: "available", usingUserId: null }),
    }));
    expect(prisma.assetReservation.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: AssetReservationStatus.COMPLETED },
    }));
    expect(prisma.assetHandoverRecord.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ handoverType: "RETURN", status: "CONFIRMED" }),
    }));
  });
});
