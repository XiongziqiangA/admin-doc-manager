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
    businessMatterActivity: {
      create: vi.fn(),
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
    prisma.businessMatterActivity.create.mockResolvedValue({ id: "activity-1" });
    prisma.businessMatter.update.mockResolvedValue({ id: "matter-1", title: "更新后的事项" });
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

  it("stores custom business labels while retaining the internal owner", async () => {
    prisma.businessMatter.create.mockResolvedValue({
      id: "matter-1",
      title: "临时合作事项",
      type: BusinessMatterType.PROJECT,
      status: BusinessMatterStatus.PLANNING,
    });

    await service.create(
      {
        title: "临时合作事项",
        type: BusinessMatterType.PROJECT,
        ownerName: "外部负责人",
        departmentName: "临时项目组",
        partnerName: "待录入合作单位",
      },
      user,
    );

    expect(prisma.businessMatter.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerId: user.id,
          ownerName: "外部负责人",
          departmentName: "临时项目组",
          partnerName: "待录入合作单位",
          departmentId: null,
          partnerId: null,
        }),
      }),
    );
  });

  it("disconnects master data when an existing matter switches to custom labels", async () => {
    prisma.businessMatter.findFirst.mockResolvedValue({
      id: "matter-1",
      createdById: user.id,
      ownerId: user.id,
      startDate: null,
      endDate: null,
    });

    await service.update(
      "matter-1",
      {
        ownerName: "自定义负责人",
        departmentId: null,
        departmentName: "临时部门",
        partnerId: null,
        partnerName: "临时合作单位",
      },
      user,
    );

    expect(prisma.businessMatter.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerName: "自定义负责人",
          department: { disconnect: true },
          departmentName: "临时部门",
          partner: { disconnect: true },
          partnerName: "临时合作单位",
        }),
      }),
    );
  });

  it("rejects submitting a master reference and custom label together", async () => {
    await expect(
      service.create(
        {
          title: "冲突引用事项",
          type: BusinessMatterType.PROJECT,
          departmentId: "department-1",
          departmentName: "临时部门",
        },
        user,
      ),
    ).rejects.toThrow("部门不能同时选择已有记录和填写自定义名称");
    expect(prisma.businessMatter.create).not.toHaveBeenCalled();
  });

  it("rejects blank titles and reversed date ranges", async () => {
    await expect(
      service.create(
        {
          title: "有效事项",
          type: BusinessMatterType.PROJECT,
          startDate: "2026-09-10T00:00:00.000Z",
          endDate: "2026-09-09T00:00:00.000Z",
        },
        user,
      ),
    ).rejects.toThrow("开始日期不能晚于结束日期");

    await expect(
      service.create({ title: "   ", type: BusinessMatterType.PROJECT }, user),
    ).rejects.toThrow("事项名称不能为空");
  });

  it("rejects a null owner during update instead of sending an invalid relation", async () => {
    prisma.businessMatter.findFirst.mockResolvedValue({ id: "matter-1", createdById: user.id, ownerId: user.id });

    await expect(
      service.update("matter-1", { ownerId: null }, user),
    ).rejects.toThrow("负责人不能为空");
    expect(prisma.businessMatter.update).not.toHaveBeenCalled();
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
            { ownerName: { contains: "推广", mode: "insensitive" } },
            { departmentName: { contains: "推广", mode: "insensitive" } },
            { partnerName: { contains: "推广", mode: "insensitive" } },
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
