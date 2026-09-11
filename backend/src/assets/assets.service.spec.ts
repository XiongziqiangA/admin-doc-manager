import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, UserRole, UserStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthorizationService } from "../authorization/authorization.service";
import { PrismaService } from "../prisma/prisma.service";
import { PublicUser } from "../users/user.presenter";
import { AssetsService } from "./assets.service";

describe("AssetsService", () => {
  const prisma = {
    assetType: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    location: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    asset: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    assetEvent: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    assetIdentifier: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    assetDocument: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      createMany: vi.fn(),
      delete: vi.fn(),
    },
    document: {
      findMany: vi.fn(),
      delete: vi.fn(),
    },
    pendingAsset: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    department: { findFirst: vi.fn() },
    user: { findFirst: vi.fn() },
    businessMatter: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  };

  const authorization = {
    assertAllPermissions: vi.fn(),
  };

  const admin: PublicUser = {
    id: "user-1",
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

  const createDto = {
    assetTypeId: "type-1",
    name: "测试电脑",
    customFields: {},
  };

  let service: AssetsService;

  beforeEach(() => {
    vi.resetAllMocks();
    authorization.assertAllPermissions.mockResolvedValue(undefined);
    prisma.assetType.findFirst.mockResolvedValue({
      id: "type-1",
      organizationId: "org-1",
      enabled: true,
      fieldSchema: [],
      parentId: null,
    });
    prisma.asset.create.mockResolvedValue({ id: "asset-1", version: 1 });
    prisma.$transaction.mockImplementation(async (operation: unknown) => {
      if (typeof operation === "function") {
        return (operation as (client: typeof prisma) => Promise<unknown>)(prisma);
      }
      return Promise.all(operation as Promise<unknown>[]);
    });
    service = new AssetsService(
      prisma as unknown as PrismaService,
      authorization as unknown as AuthorizationService,
    );
  });

  it("returns real totals and page slices when an organization has more than 100 assets", async () => {
    prisma.asset.findMany.mockResolvedValue([]);
    prisma.asset.count.mockResolvedValue(246);

    const result = await service.list(admin, {
      page: 2,
      pageSize: 100,
      sortBy: "updatedAt",
      sortOrder: "desc",
    });

    expect(prisma.asset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: "org-1", archivedAt: null }),
        skip: 100,
        take: 100,
      }),
    );
    expect(result.pagination).toEqual({
      page: 2,
      pageSize: 100,
      totalItems: 246,
      totalPages: 3,
    });
  });

  it("builds organization-scoped asset overview metrics", async () => {
    prisma.asset.count
      .mockResolvedValueOnce(246)
      .mockResolvedValueOnce(212)
      .mockResolvedValueOnce(180)
      .mockResolvedValueOnce(17);
    prisma.pendingAsset.count.mockResolvedValue(3);

    await expect(service.overview(admin)).resolves.toEqual({
      total: 246,
      active: 212,
      available: 180,
      borrowed: 17,
      pending: 3,
    });
    expect(prisma.asset.count).toHaveBeenNthCalledWith(1, {
      where: { organizationId: "org-1", archivedAt: null },
    });
    expect(prisma.asset.count).toHaveBeenNthCalledWith(2, {
      where: { organizationId: "org-1", archivedAt: null, assetStatus: "active" },
    });
    expect(prisma.asset.count).toHaveBeenNthCalledWith(3, {
      where: { organizationId: "org-1", archivedAt: null, resourceStatus: "available" },
    });
    expect(prisma.asset.count).toHaveBeenNthCalledWith(4, {
      where: { organizationId: "org-1", archivedAt: null, resourceStatus: "borrowed" },
    });
    expect(prisma.pendingAsset.count).toHaveBeenCalledWith({
      where: { organizationId: "org-1", status: "pending" },
    });
  });

  it("never returns an asset belonging to another organization", async () => {
    prisma.asset.findFirst.mockResolvedValue(null);

    await expect(service.findById(admin, "asset-other")).rejects.toThrow("资产不存在");
    expect(prisma.asset.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "asset-other", organizationId: "org-1" } }),
    );
  });

  it("returns a paginated lifecycle timeline for an asset in the current organization", async () => {
    prisma.asset.findFirst.mockResolvedValue({ id: "asset-1" });
    prisma.assetEvent.findMany.mockResolvedValue([{ id: "event-1", summary: "资产已归还" }]);
    prisma.assetEvent.count.mockResolvedValue(21);

    const result = await service.listEvents(admin, "asset-1", { page: 2, pageSize: 20 });

    expect(prisma.assetEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId: "org-1", assetId: "asset-1" },
      skip: 20,
      take: 20,
      orderBy: { createdAt: "desc" },
    }));
    expect(result.pagination).toEqual({ page: 2, pageSize: 20, totalItems: 21, totalPages: 2 });
  });

  it("stops formal asset creation when the user lacks asset.create", async () => {
    authorization.assertAllPermissions.mockRejectedValueOnce(
      new ForbiddenException("没有执行该操作的权限"),
    );

    await expect(service.create(admin, createDto)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.asset.create).not.toHaveBeenCalled();
  });

  it("uses the real compatibility policy to reject employee create and update operations", async () => {
    const realAuthorization = new AuthorizationService({
      userRoleBinding: { findMany: vi.fn().mockResolvedValue([]) },
    } as never);
    const restrictedService = new AssetsService(
      prisma as unknown as PrismaService,
      realAuthorization,
    );
    const employee = { ...admin, role: UserRole.EMPLOYEE, username: "employee" };

    await expect(restrictedService.create(employee, createDto)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      restrictedService.update(employee, "asset-1", { version: 1, name: "不能修改" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.asset.create).not.toHaveBeenCalled();
    expect(prisma.asset.updateMany).not.toHaveBeenCalled();
  });

  it("normalizes a blank serial number to null before persistence", async () => {
    await service.create(admin, { ...createDto, serialNumber: "   " });

    expect(prisma.asset.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          serialNumber: null,
          qrToken: expect.stringMatching(/^asset:/),
          identifiers: {
            create: {
              identifierType: "qr",
              value: expect.stringMatching(/^asset:/),
              isPrimary: true,
            },
          },
        }),
      }),
    );
  });

  it("turns database uniqueness failures into a readable conflict", async () => {
    prisma.asset.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "6.19.3",
        meta: { target: ["organization_id", "asset_code"] },
      }),
    );

    await expect(service.create(admin, createDto)).rejects.toThrow(
      "资产编号、序列号或二维码已存在",
    );
  });

  it("atomically rejects an update when the version changed after it was read", async () => {
    prisma.asset.findFirst.mockResolvedValue({
      id: "asset-1",
      organizationId: "org-1",
      assetTypeId: "type-1",
      version: 2,
      customFields: {},
    });
    prisma.asset.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.update(admin, "asset-1", { version: 2, name: "新名称" }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.asset.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "asset-1", organizationId: "org-1", version: 2, archivedAt: null },
      }),
    );
  });

  it("keeps archived assets readable but rejects further edits", async () => {
    prisma.asset.findFirst.mockResolvedValue({
      id: "asset-1",
      organizationId: "org-1",
      assetTypeId: "type-1",
      version: 4,
      customFields: {},
      archivedAt: new Date("2026-09-11T08:00:00.000Z"),
    });

    await expect(service.update(admin, "asset-1", { version: 4, name: "不应修改" })).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.asset.updateMany).not.toHaveBeenCalled();
  });

  it("clears optional asset values when the client explicitly sends null", async () => {
    prisma.asset.findFirst.mockResolvedValue({
      id: "asset-1",
      organizationId: "org-1",
      assetTypeId: "type-1",
      version: 1,
      customFields: {},
    });
    prisma.asset.updateMany.mockResolvedValue({ count: 1 });
    prisma.asset.findUnique.mockResolvedValue({ id: "asset-1", version: 2 });

    await service.update(admin, "asset-1", {
      version: 1,
      brand: null,
      locationId: null,
      purchaseDate: null,
      purchaseAmount: null,
    });

    expect(prisma.asset.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          brand: null,
          locationId: null,
          purchaseDate: null,
          purchaseAmount: null,
        }),
      }),
    );
  });

  it("does not allow a formal asset to be physically deleted", async () => {
    prisma.asset.findFirst.mockResolvedValue({ id: "asset-1", organizationId: "org-1" });

    await expect(service.assertNotDeletable(admin, "asset-1")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("links active documents from the current organization to an asset", async () => {
    prisma.asset.findFirst.mockResolvedValue({ id: "asset-1", organizationId: "org-1" });
    prisma.document.findMany.mockResolvedValue([{ id: "document-1" }, { id: "document-2" }]);
    prisma.assetDocument.findMany.mockResolvedValue([]);
    prisma.assetDocument.createMany.mockResolvedValue({ count: 2 });

    const result = await service.attachDocuments(
      admin,
      "asset-1",
      { documentIds: ["document-1", "document-2", "document-1"] },
    );

    expect(prisma.document.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["document-1", "document-2"] },
        deletedAt: null,
        status: { not: "DELETED" },
        creator: { organizationId: "org-1" },
      },
      select: { id: true },
    });
    expect(prisma.assetDocument.createMany).toHaveBeenCalledWith({
      data: [
        { organizationId: "org-1", assetId: "asset-1", documentId: "document-1" },
        { organizationId: "org-1", assetId: "asset-1", documentId: "document-2" },
      ],
    });
    expect(result).toEqual({ assetId: "asset-1", addedCount: 2 });
  });

  it("rejects document links when a document is unavailable to the current organization", async () => {
    prisma.asset.findFirst.mockResolvedValue({ id: "asset-1", organizationId: "org-1" });
    prisma.document.findMany.mockResolvedValue([]);

    await expect(
      service.attachDocuments(admin, "asset-1", { documentIds: ["document-other-org"] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.assetDocument.createMany).not.toHaveBeenCalled();
  });

  it("rejects duplicate document links", async () => {
    prisma.asset.findFirst.mockResolvedValue({ id: "asset-1", organizationId: "org-1" });
    prisma.document.findMany.mockResolvedValue([{ id: "document-1" }]);
    prisma.assetDocument.findMany.mockResolvedValue([{ documentId: "document-1" }]);

    await expect(
      service.attachDocuments(admin, "asset-1", { documentIds: ["document-1"] }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.assetDocument.createMany).not.toHaveBeenCalled();
  });

  it("removes only the asset-document link", async () => {
    prisma.asset.findFirst.mockResolvedValue({ id: "asset-1", organizationId: "org-1" });
    prisma.assetDocument.findFirst.mockResolvedValue({
      assetId: "asset-1",
      documentId: "document-1",
      organizationId: "org-1",
    });
    prisma.assetDocument.delete.mockResolvedValue({
      assetId: "asset-1",
      documentId: "document-1",
    });

    await service.detachDocument(admin, "asset-1", "document-1");

    expect(prisma.assetDocument.delete).toHaveBeenCalledWith({
      where: { assetId_documentId: { assetId: "asset-1", documentId: "document-1" } },
    });
    expect(prisma.document.delete).not.toHaveBeenCalled();
  });

  it("reports a missing asset-document link", async () => {
    prisma.asset.findFirst.mockResolvedValue({ id: "asset-1", organizationId: "org-1" });
    prisma.assetDocument.findFirst.mockResolvedValue(null);

    await expect(
      service.detachDocument(admin, "asset-1", "document-1"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("confirms a pending asset and updates its status in one transaction", async () => {
    prisma.pendingAsset.findFirst.mockResolvedValue({
      id: "pending-1",
      organizationId: "org-1",
      status: "pending",
      rawPayload: {},
    });
    prisma.pendingAsset.updateMany.mockResolvedValue({ count: 1 });

    await service.confirmPending(admin, "pending-1", {
      ...createDto,
      reviewNote: "信息已核实",
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.pendingAsset.updateMany).toHaveBeenCalledWith({
      where: { id: "pending-1", organizationId: "org-1", status: "pending" },
      data: expect.objectContaining({
        status: "confirmed",
        reviewedById: "user-1",
        reviewNote: "信息已核实",
        reviewedAt: expect.any(Date),
      }),
    });
  });

  it("lists, creates, updates and safely disables locations inside the current organization", async () => {
    prisma.location.findMany.mockResolvedValue([]);
    prisma.location.findFirst.mockResolvedValue({
      id: "location-1",
      organizationId: "org-1",
      parentId: null,
      enabled: true,
    });
    prisma.location.create.mockResolvedValue({ id: "location-2" });
    prisma.location.update.mockResolvedValue({ id: "location-1", enabled: false });
    prisma.location.count.mockResolvedValue(0);
    prisma.asset.count.mockResolvedValue(0);

    await service.listLocations(admin, false);
    await service.createLocation(admin, { name: " 一楼库房 ", code: " wh-01 " });
    await service.updateLocation(admin, "location-1", { name: "二楼库房" });
    await service.removeLocation(admin, "location-1");

    expect(prisma.location.findMany).toHaveBeenCalledWith({
      where: { organizationId: "org-1", enabled: true },
      orderBy: [{ parentId: "asc" }, { name: "asc" }],
    });
    expect(prisma.location.create).toHaveBeenCalledWith({
      data: {
        organizationId: "org-1",
        name: "一楼库房",
        code: "WH-01",
        parentId: undefined,
      },
    });
    expect(prisma.location.update).toHaveBeenLastCalledWith({
      where: { id: "location-1" },
      data: { enabled: false },
    });
  });

  it("rejects location parent changes that would form a cycle", async () => {
    prisma.location.findFirst
      .mockResolvedValueOnce({ id: "location-1", organizationId: "org-1", parentId: null })
      .mockResolvedValueOnce({ id: "location-2", organizationId: "org-1", parentId: "location-1" });

    await expect(
      service.updateLocation(admin, "location-1", { parentId: "location-2" }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.location.update).not.toHaveBeenCalled();
  });

  it("manages non-system identifiers and keeps only one primary value per type", async () => {
    prisma.asset.findFirst.mockResolvedValue({ id: "asset-1", organizationId: "org-1" });
    prisma.assetIdentifier.create.mockResolvedValue({ id: "identifier-1" });

    await service.createIdentifier(admin, "asset-1", {
      identifierType: "rfid",
      value: " RFID-001 ",
      isPrimary: true,
    });

    expect(prisma.assetIdentifier.updateMany).toHaveBeenCalledWith({
      where: { assetId: "asset-1", identifierType: "rfid", isPrimary: true },
      data: { isPrimary: false },
    });
    expect(prisma.assetIdentifier.create).toHaveBeenCalledWith({
      data: {
        assetId: "asset-1",
        identifierType: "rfid",
        value: "RFID-001",
        isPrimary: true,
      },
    });
  });

  it("updates and deletes a non-system identifier only inside its asset", async () => {
    prisma.asset.findFirst.mockResolvedValue({ id: "asset-1", organizationId: "org-1" });
    prisma.assetIdentifier.findFirst.mockResolvedValue({
      id: "identifier-1",
      assetId: "asset-1",
      identifierType: "rfid",
      isPrimary: false,
    });
    prisma.assetIdentifier.update.mockResolvedValue({ id: "identifier-1", isPrimary: true });
    prisma.assetIdentifier.delete.mockResolvedValue({ id: "identifier-1" });

    await service.updateIdentifier(admin, "asset-1", "identifier-1", {
      value: " RFID-002 ",
      isPrimary: true,
    });
    await service.removeIdentifier(admin, "asset-1", "identifier-1");

    expect(prisma.assetIdentifier.update).toHaveBeenCalledWith({
      where: { id: "identifier-1" },
      data: { value: "RFID-002", isPrimary: true },
    });
    expect(prisma.assetIdentifier.delete).toHaveBeenCalledWith({
      where: { id: "identifier-1" },
    });
  });

  it("does not allow users to manually create or remove the system QR identifier", async () => {
    await expect(
      service.createIdentifier(admin, "asset-1", {
        identifierType: "qr",
        value: "asset:manual",
        isPrimary: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.asset.findFirst.mockResolvedValue({ id: "asset-1", organizationId: "org-1" });
    prisma.assetIdentifier.findFirst.mockResolvedValue({
      id: "identifier-qr",
      assetId: "asset-1",
      identifierType: "qr",
    });
    await expect(
      service.removeIdentifier(admin, "asset-1", "identifier-qr"),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
