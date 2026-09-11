import { ForbiddenException, NotFoundException } from "@nestjs/common";
import {
  ApprovalBusinessType,
  ApprovalStatus,
  AssetReservationStatus,
  UserRole,
  UserStatus,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PublicUser } from "../users/user.presenter";
import { ApprovalsService } from "./approvals.service";

describe("ApprovalsService", () => {
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
  const pendingApproval = {
    id: "approval-1",
    organizationId: "org-1",
    applicantId: employee.id,
    businessType: ApprovalBusinessType.ASSET_RESERVATION,
    businessId: "reservation-1",
    status: ApprovalStatus.PENDING,
    reservation: {
      id: "reservation-1",
      assetId: "asset-1",
      status: AssetReservationStatus.PENDING,
      startAt: new Date("2026-09-20T01:00:00.000Z"),
      endAt: new Date("2026-09-20T03:00:00.000Z"),
      asset: { id: "asset-1", version: 1, resourceStatus: "available", assetStatus: "active" },
    },
    borrow: null,
    transfer: null,
  };
  const prisma = {
    approval: { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    approvalAction: { create: vi.fn() },
    assetReservation: { findFirst: vi.fn(), update: vi.fn() },
    assetBorrowRecord: { findFirst: vi.fn() },
    asset: { findFirst: vi.fn(), updateMany: vi.fn() },
    assetEvent: { create: vi.fn() },
    auditLog: { create: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  };
  const authorization = { assertAllPermissions: vi.fn() };

  beforeEach(() => {
    vi.resetAllMocks();
    authorization.assertAllPermissions.mockResolvedValue(undefined);
    prisma.$transaction.mockImplementation(async (operation: unknown) => {
      if (typeof operation === "function") return (operation as (tx: typeof prisma) => Promise<unknown>)(prisma);
      return Promise.all(operation as Promise<unknown>[]);
    });
    prisma.approval.findFirst.mockResolvedValue(pendingApproval);
    prisma.asset.findFirst.mockResolvedValue(pendingApproval.reservation.asset);
    prisma.assetReservation.findFirst.mockResolvedValue(null);
    prisma.assetBorrowRecord.findFirst.mockResolvedValue(null);
    prisma.asset.updateMany.mockResolvedValue({ count: 1 });
    prisma.assetReservation.update.mockResolvedValue({ ...pendingApproval.reservation, status: AssetReservationStatus.APPROVED });
    prisma.approval.update.mockResolvedValue({ ...pendingApproval, status: ApprovalStatus.APPROVED });
  });

  it("scopes employee approvals to the applicant while admins see the enterprise queue", async () => {
    prisma.approval.findMany.mockResolvedValue([]);
    prisma.approval.count.mockResolvedValue(0);
    const service = new ApprovalsService(prisma as never, authorization as never);

    await service.list(employee, { page: 1, pageSize: 20 });
    expect(prisma.approval.findMany.mock.calls[0][0].where).toEqual(expect.objectContaining({
      organizationId: "org-1",
      applicantId: employee.id,
    }));

    await service.list(admin, { page: 1, pageSize: 20 });
    expect(prisma.approval.findMany.mock.calls[1][0].where).toEqual({ organizationId: "org-1" });
  });

  it("approves a reservation and updates the asset, timeline, and audit in one transaction", async () => {
    const service = new ApprovalsService(prisma as never, authorization as never);

    const result = await service.approve(admin, "approval-1", { comment: "同意使用" });

    expect(result.status).toBe(ApprovalStatus.APPROVED);
    expect(prisma.assetReservation.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: AssetReservationStatus.APPROVED },
    }));
    expect(prisma.asset.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { resourceStatus: "reserved", version: { increment: 1 } },
    }));
    expect(prisma.approvalAction.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "APPROVE", actorId: admin.id }),
    }));
    expect(prisma.assetEvent.create).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("rejects a reservation without changing the asset resource status", async () => {
    prisma.approval.update.mockResolvedValue({ ...pendingApproval, status: ApprovalStatus.REJECTED });
    const service = new ApprovalsService(prisma as never, authorization as never);

    const result = await service.reject(admin, "approval-1", { comment: "时间冲突" });

    expect(result.status).toBe(ApprovalStatus.REJECTED);
    expect(prisma.assetReservation.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: AssetReservationStatus.REJECTED },
    }));
    expect(prisma.asset.updateMany).not.toHaveBeenCalled();
  });

  it("returns an already approved record without writing duplicate actions", async () => {
    const approved = { ...pendingApproval, status: ApprovalStatus.APPROVED };
    prisma.approval.findFirst.mockResolvedValue(approved);
    const service = new ApprovalsService(prisma as never, authorization as never);

    await expect(service.approve(admin, "approval-1", {})).resolves.toBe(approved);
    expect(prisma.approvalAction.create).not.toHaveBeenCalled();
  });

  it("does not reveal an approval from another organization", async () => {
    prisma.approval.findFirst.mockResolvedValue(null);
    const service = new ApprovalsService(prisma as never, authorization as never);

    await expect(service.approve(admin, "approval-other", {})).rejects.toBeInstanceOf(NotFoundException);
  });

  it("stops review when the user lacks approval.review", async () => {
    authorization.assertAllPermissions.mockRejectedValueOnce(new ForbiddenException("没有权限"));
    const service = new ApprovalsService(prisma as never, authorization as never);

    await expect(service.approve(employee, "approval-1", {})).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.approval.findFirst).not.toHaveBeenCalled();
  });
});
