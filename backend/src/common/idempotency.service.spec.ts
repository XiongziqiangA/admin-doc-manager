import { BadRequestException, ConflictException } from "@nestjs/common";
import { UserRole, UserStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PublicUser } from "../users/user.presenter";
import { IdempotencyService } from "./idempotency.service";

describe("IdempotencyService", () => {
  const user: PublicUser = {
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
  const prisma = {
    idempotencyRecord: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  };

  beforeEach(() => {
    vi.resetAllMocks();
    prisma.$transaction.mockImplementation((handler: (tx: typeof prisma) => Promise<unknown>) => handler(prisma));
  });

  it("requires a usable idempotency key", async () => {
    const service = new IdempotencyService(prisma as never);

    await expect(service.execute(user, "reservation.create", "", {}, vi.fn())).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("replays a completed response without executing the operation again", async () => {
    prisma.idempotencyRecord.findUnique.mockResolvedValue({
      requestDigest: expect.anything(),
      responseBody: { id: "reservation-1", status: "PENDING" },
      responseStatus: 201,
    });
    const operation = vi.fn();
    const service = new IdempotencyService(prisma as never);
    const digest = service.digest({ assetId: "asset-1" });
    prisma.idempotencyRecord.findUnique.mockResolvedValue({
      requestDigest: digest,
      responseBody: { id: "reservation-1", status: "PENDING" },
      responseStatus: 201,
    });

    await expect(service.execute(user, "reservation.create", "request-0001", { assetId: "asset-1" }, operation))
      .resolves.toEqual({ id: "reservation-1", status: "PENDING" });
    expect(operation).not.toHaveBeenCalled();
  });

  it("rejects reuse of a key with a different request", async () => {
    prisma.idempotencyRecord.findUnique.mockResolvedValue({
      requestDigest: "different-digest",
      responseBody: { id: "reservation-1" },
      responseStatus: 201,
    });
    const service = new IdempotencyService(prisma as never);

    await expect(service.execute(user, "reservation.create", "request-0001", { assetId: "asset-2" }, vi.fn()))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it("stores the response in the same transaction as the business operation", async () => {
    prisma.idempotencyRecord.findUnique.mockResolvedValue(null);
    prisma.idempotencyRecord.create.mockResolvedValue({ id: "idem-1" });
    const operation = vi.fn().mockResolvedValue({ id: "reservation-1", createdAt: new Date("2026-09-11T01:00:00.000Z") });
    const service = new IdempotencyService(prisma as never);

    const result = await service.execute(user, "reservation.create", "request-0001", { assetId: "asset-1" }, operation);

    expect(result).toEqual(expect.objectContaining({ id: "reservation-1" }));
    expect(operation).toHaveBeenCalledWith(prisma);
    expect(prisma.idempotencyRecord.update).toHaveBeenCalledWith({
      where: { id: "idem-1" },
      data: {
        responseBody: { id: "reservation-1", createdAt: "2026-09-11T01:00:00.000Z" },
        responseStatus: 201,
      },
    });
  });
});
