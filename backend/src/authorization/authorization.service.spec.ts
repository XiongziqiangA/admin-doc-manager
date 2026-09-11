import { ForbiddenException } from "@nestjs/common";
import { UserRole, UserStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { AuthorizationService } from "./authorization.service";

const employee = {
  id: "user-1",
  username: "employee",
  realName: "Employee",
  role: UserRole.EMPLOYEE,
  status: UserStatus.ACTIVE,
  organizationId: "org-1",
  departmentId: null,
  phone: null,
  email: null,
  createdAt: new Date("2026-09-11T00:00:00Z"),
  updatedAt: new Date("2026-09-11T00:00:00Z"),
};

describe("AuthorizationService", () => {
  it("grants every permission to a legacy administrator", async () => {
    const prisma = { userRoleBinding: { findMany: vi.fn() } };
    const service = new AuthorizationService(prisma as never);

    await expect(
      service.hasAllPermissions({ ...employee, role: UserRole.ADMIN }, ["system.manage"]),
    ).resolves.toBe(true);
    expect(prisma.userRoleBinding.findMany).not.toHaveBeenCalled();
  });

  it("uses persisted role permissions when role bindings exist", async () => {
    const prisma = {
      userRoleBinding: {
        findMany: vi.fn().mockResolvedValue([
          { role: { permissions: [{ permission: { code: "asset.read" } }] } },
        ]),
      },
    };
    const service = new AuthorizationService(prisma as never);

    await expect(service.hasAllPermissions(employee, ["asset.read"])).resolves.toBe(true);
    await expect(service.hasAllPermissions(employee, ["asset.update"])).resolves.toBe(false);
  });

  it("keeps the approved employee compatibility permissions before bindings are seeded", async () => {
    const prisma = { userRoleBinding: { findMany: vi.fn().mockResolvedValue([]) } };
    const service = new AuthorizationService(prisma as never);

    await expect(service.hasAllPermissions(employee, ["document.upload"])).resolves.toBe(true);
    await expect(service.hasAllPermissions(employee, ["system.manage"])).resolves.toBe(false);
  });

  it("throws a readable forbidden error when a permission is missing", async () => {
    const prisma = { userRoleBinding: { findMany: vi.fn().mockResolvedValue([]) } };
    const service = new AuthorizationService(prisma as never);

    await expect(service.assertAllPermissions(employee, ["asset.update"])).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
