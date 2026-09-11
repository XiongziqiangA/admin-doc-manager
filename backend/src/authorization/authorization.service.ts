import { ForbiddenException, Injectable } from "@nestjs/common";
import { UserRole } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import { PublicUser } from "../users/user.presenter";
import { LEGACY_EMPLOYEE_PERMISSIONS, PermissionCode } from "./permissions";

@Injectable()
export class AuthorizationService {
  constructor(private readonly prisma: PrismaService) {}

  async hasAllPermissions(user: PublicUser, required: PermissionCode[]): Promise<boolean> {
    if (required.length === 0 || user.role === UserRole.ADMIN) {
      return true;
    }

    const bindings = await this.prisma.userRoleBinding.findMany({
      where: {
        userId: user.id,
        ...(user.organizationId ? { organizationId: user.organizationId } : {}),
      },
      select: {
        role: {
          select: {
            permissions: {
              select: { permission: { select: { code: true } } },
            },
          },
        },
      },
    });

    if (bindings.length === 0) {
      return required.every((code) => LEGACY_EMPLOYEE_PERMISSIONS.has(code));
    }

    const granted = new Set(
      bindings.flatMap((binding) =>
        binding.role.permissions.map((link) => link.permission.code),
      ),
    );
    return required.every((code) => granted.has(code));
  }

  async assertAllPermissions(user: PublicUser, required: PermissionCode[]): Promise<void> {
    if (!(await this.hasAllPermissions(user, required))) {
      throw new ForbiddenException("没有执行该操作的权限");
    }
  }
}
