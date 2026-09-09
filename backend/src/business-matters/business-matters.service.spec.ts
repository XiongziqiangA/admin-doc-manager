import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import { BusinessMatterStatus, BusinessMatterType, DocumentStatus, UserRole, UserStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PrismaService } from "../prisma/prisma.service";
import { BusinessMattersService } from "./business-matters.service";

describe("BusinessMattersService", () => {
  const prisma = {
    businessMatter: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    businessMatterDocument: {
      findMany: vi.fn(),
      createMany: vi.fn(),
      delete: vi.fn(),
    },
    document: {
      findMany: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
    },
    department: {
      findFirst: vi.fn(),
    },
    partner: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
  };

  const user = {
    id: "user-1",
    username: "employee",
    realName: "员工",
    role: UserRole.EMPLOYEE,
    status: UserStatus.ACTIVE,
    departmentId: null,
    phone: null,
    email: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let service: BusinessMattersService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new BusinessMattersService(prisma as unknown as PrismaService);
  });

  it("creates a matter with a generated number and defaults the owner to the creator", async () => {
    prisma.businessMatter.create.mockResolvedValue({
      id: "matter-1",
      title: "市场推广项目",
      type: BusinessMatterType.PROJECT,
      status: BusinessMatterStatus.PLANNING,
    });

    await service.create(
      { title: " 市场推广项目 ", type: BusinessMatterType.PROJECT },
      user,
    );

    expect(prisma.businessMatter.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          matterNo: expect.stringMatching(/^MAT-\d{8}-[A-Z0-9]{8}$/),
          title: "市场推广项目",
          type: BusinessMatterType.PROJECT,
          status: BusinessMatterStatus.PLANNING,
          ownerId: user.id,
          createdById: user.id,
          parentId: null,
        }),
      }),
    );
  });

  it("lists matters with keyword and document filters and pagination", async () => {
    prisma.businessMatter.findMany.mockResolvedValue([]);
    prisma.businessMatter.count.mockResolvedValue(0);

    const result = await service.list({
      page: 2,
      pageSize: 10,
      keyword: "推广",
      type: BusinessMatterType.PROJECT,
      documentId: "document-1",
      sortBy: "updatedAt",
      sortOrder: "desc",
    });

    expect(prisma.businessMatter.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          type: BusinessMatterType.PROJECT,
          documents: { some: { documentId: "document-1" } },
          OR: [
            { title: { contains: "推广", mode: "insensitive" } },
            { matterNo: { contains: "推广", mode: "insensitive" } },
            { remark: { contains: "推广", mode: "insensitive" } },
          ],
        }),
        skip: 10,
        take: 10,
      }),
    );
    expect(result.pagination).toEqual({ page: 2, pageSize: 10, totalItems: 0, totalPages: 0 });
  });

  it("rejects a parent chain that points back to the matter being updated", async () => {
    prisma.businessMatter.findFirst
      .mockResolvedValueOnce({ id: "matter-1", creatorId: user.id, ownerId: user.id })
      .mockResolvedValueOnce({ id: "matter-2", parentId: "matter-1" });

    await expect(
      service.update("matter-1", { parentId: "matter-2" }, user),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.businessMatter.update).not.toHaveBeenCalled();
  });

  it("adds existing active documents to a matter and prevents duplicate links", async () => {
    prisma.businessMatter.findFirst.mockResolvedValue({ id: "matter-1", creatorId: user.id, ownerId: user.id });
    prisma.document.findMany.mockResolvedValue([{ id: "document-1" }, { id: "document-2" }]);
    prisma.businessMatterDocument.findMany.mockResolvedValue([]);
    prisma.businessMatterDocument.createMany.mockResolvedValue({ count: 2 });

    await service.attachDocuments("matter-1", { documentIds: ["document-1", "document-2"] }, user);

    expect(prisma.businessMatterDocument.createMany).toHaveBeenCalledWith({
      data: [
        { matterId: "matter-1", documentId: "document-1", relationType: "REFERENCE", isPrimary: false },
        { matterId: "matter-1", documentId: "document-2", relationType: "REFERENCE", isPrimary: false },
      ],
    });

    prisma.document.findMany.mockResolvedValue([{ id: "document-1" }]);
    prisma.businessMatterDocument.findMany.mockResolvedValue([{ documentId: "document-1" }]);
    await expect(
      service.attachDocuments("matter-1", { documentIds: ["document-1"] }, user),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("soft-deletes a matter without touching its linked documents", async () => {
    prisma.businessMatter.findFirst.mockResolvedValue({ id: "matter-1", creatorId: user.id, ownerId: user.id });
    prisma.businessMatter.update.mockResolvedValue({ id: "matter-1", deletedAt: new Date() });

    await service.remove("matter-1", user);

    expect(prisma.businessMatter.update).toHaveBeenCalledWith({
      where: { id: "matter-1" },
      data: { deletedAt: expect.any(Date) },
    });
    expect(prisma.businessMatterDocument.delete).not.toHaveBeenCalled();
  });

  it("does not let an unrelated employee modify another employee's matter", async () => {
    prisma.businessMatter.findFirst.mockResolvedValue({ id: "matter-1", creatorId: "user-2", ownerId: "user-3" });

    await expect(service.update("matter-1", { title: "修改" }, user)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
