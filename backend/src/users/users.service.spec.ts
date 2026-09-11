import { UserRole, UserStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../prisma/prisma.service";
import { PublicUser } from "./user.presenter";
import { UsersService } from "./users.service";

describe("UsersService enterprise membership", () => {
  const prisma = {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    role: { findUnique: vi.fn() },
    organizationMember: { create: vi.fn() },
    userRoleBinding: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  const passwordService = { hashPassword: vi.fn() };
  const operator: PublicUser = {
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
  let service: UsersService;

  beforeEach(() => {
    vi.resetAllMocks();
    prisma.$transaction.mockImplementation((callback: (tx: typeof prisma) => unknown) => callback(prisma));
    passwordService.hashPassword.mockResolvedValue("hashed-password");
    service = new UsersService(
      prisma as unknown as PrismaService,
      passwordService as unknown as PasswordService,
    );
  });

  it("creates the user, organization membership and role binding in one transaction", async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.role.findUnique.mockResolvedValue({ id: "role-employee", code: "EMPLOYEE" });
    prisma.user.create.mockResolvedValue({
      id: "employee-1",
      username: "employee",
      passwordHash: "hashed-password",
      realName: "测试员工",
      role: UserRole.EMPLOYEE,
      status: UserStatus.ACTIVE,
      organizationId: "org-1",
      departmentId: null,
      phone: null,
      email: null,
      deletedAt: null,
      createdAt: new Date("2026-09-11T00:00:00.000Z"),
      updatedAt: new Date("2026-09-11T00:00:00.000Z"),
    });

    await service.create(
      {
        username: "employee",
        password: "123456",
        realName: "测试员工",
        role: UserRole.EMPLOYEE,
      },
      operator,
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ organizationId: "org-1", role: UserRole.EMPLOYEE }),
    });
    expect(prisma.organizationMember.create).toHaveBeenCalledWith({
      data: { organizationId: "org-1", userId: "employee-1", isPrimary: true },
    });
    expect(prisma.userRoleBinding.create).toHaveBeenCalledWith({
      data: { organizationId: "org-1", userId: "employee-1", roleId: "role-employee" },
    });
  });

  it("scopes the user list to the operator organization", async () => {
    prisma.user.findMany.mockResolvedValue([]);
    prisma.user.count.mockResolvedValue(0);
    prisma.$transaction.mockImplementation((operations: unknown[]) => Promise.all(operations));

    await service.list(
      { page: 1, pageSize: 20, sortBy: "createdAt", sortOrder: "desc" },
      operator,
    );

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: "org-1", deletedAt: null }),
      }),
    );
  });
});
