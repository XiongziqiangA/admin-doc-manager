import { ConflictException, ForbiddenException } from "@nestjs/common";
import { AssetReservationStatus, UserRole, UserStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PublicUser } from "../users/user.presenter";
import { AssetReservationsService } from "./asset-reservations.service";

describe("AssetReservationsService", () => {
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
    startAt: "2026-09-20T01:00:00.000Z",
    endAt: "2026-09-20T03:00:00.000Z",
    purpose: "会议演示",
  };
  const prisma = {
    asset: { findFirst: vi.fn(), updateMany: vi.fn() },
    assetReservation: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
    assetBorrowRecord: { findFirst: vi.fn() },
    businessMatter: { findFirst: vi.fn() },
    approval: { create: vi.fn(), updateMany: vi.fn() },
    approvalAction: { create: vi.fn() },
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
    prisma.asset.findFirst.mockResolvedValue({
      id: "asset-1",
      organizationId: "org-1",
      assetStatus: "active",
      resourceStatus: "available",
      version: 1,
    });
    prisma.assetReservation.findFirst.mockResolvedValue(null);
    prisma.assetBorrowRecord.findFirst.mockResolvedValue(null);
    prisma.approval.create.mockResolvedValue({ id: "approval-1" });
    prisma.assetReservation.create.mockResolvedValue({
      id: "reservation-1",
      status: AssetReservationStatus.PENDING,
      ...dto,
    });
    prisma.$transaction.mockImplementation(async (operation: unknown) => {
      if (typeof operation === "function") {
        return (operation as (tx: typeof prisma) => Promise<unknown>)(prisma);
      }
      return Promise.all(operation as Promise<unknown>[]);
    });
  });

  it("creates an employee reservation as a pending approval with business and audit records", async () => {
    const service = new AssetReservationsService(prisma as never, authorization as never, idempotency as never);

    const result = await service.create(employee, "request-0001", dto);

    expect(result.status).toBe(AssetReservationStatus.PENDING);
    expect(prisma.approval.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ applicantId: employee.id, status: "PENDING" }),
    }));
    expect(prisma.assetReservation.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ organizationId: "org-1", applicantId: employee.id }),
    }));
    expect(prisma.assetEvent.create).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("rejects overlapping reservation periods before persistence", async () => {
    prisma.assetReservation.findFirst.mockResolvedValueOnce({ id: "existing-reservation" });
    const service = new AssetReservationsService(prisma as never, authorization as never, idempotency as never);

    await expect(service.create(employee, "request-0001", dto)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.assetReservation.create).not.toHaveBeenCalled();
  });

  it("scopes employee lists to their own applications while admins see the enterprise list", async () => {
    prisma.assetReservation.findMany.mockResolvedValue([]);
    prisma.assetReservation.count.mockResolvedValue(0);
    prisma.$transaction.mockImplementation((operations: Promise<unknown>[]) => Promise.all(operations));
    const service = new AssetReservationsService(prisma as never, authorization as never, idempotency as never);

    await service.list(employee, { page: 1, pageSize: 20 });
    expect(prisma.assetReservation.findMany.mock.calls[0][0].where).toEqual(expect.objectContaining({
      organizationId: "org-1",
      applicantId: employee.id,
    }));

    await service.list(admin, { page: 1, pageSize: 20 });
    expect(prisma.assetReservation.findMany.mock.calls[1][0].where).toEqual({ organizationId: "org-1" });
  });

  it("prevents an employee from cancelling another employee's reservation", async () => {
    prisma.assetReservation.findFirst.mockResolvedValue({
      id: "reservation-2",
      applicantId: "user-2",
      organizationId: "org-1",
      status: AssetReservationStatus.PENDING,
    });
    const service = new AssetReservationsService(prisma as never, authorization as never, idempotency as never);

    await expect(service.cancel(employee, "reservation-2", { reason: "不再需要" })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.assetReservation.update).not.toHaveBeenCalled();
  });

  it("treats repeated cancellation as a successful no-op", async () => {
    const cancelled = {
      id: "reservation-1",
      applicantId: employee.id,
      organizationId: "org-1",
      status: AssetReservationStatus.CANCELLED,
    };
    prisma.assetReservation.findFirst.mockResolvedValue(cancelled);
    const service = new AssetReservationsService(prisma as never, authorization as never, idempotency as never);

    await expect(service.cancel(employee, "reservation-1", { reason: "不再需要" })).resolves.toBe(cancelled);
    expect(prisma.assetReservation.update).not.toHaveBeenCalled();
  });
});
