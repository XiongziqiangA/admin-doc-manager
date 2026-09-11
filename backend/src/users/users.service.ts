import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, UserStatus } from "@prisma/client";

import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { ListUsersDto } from "./dto/list-users.dto";
import { PublicUser, toPublicUser } from "./user.presenter";

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
  ) {}

  async create(dto: CreateUserDto, operator: PublicUser): Promise<PublicUser> {
    if (!operator.organizationId) {
      throw new ForbiddenException("当前账号尚未绑定企业");
    }
    const existing = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });
    if (existing) {
      throw new ConflictException("账号已存在");
    }

    const passwordHash = await this.passwordService.hashPassword(dto.password);
    const user = await this.prisma.$transaction(async (tx) => {
      const role = await tx.role.findUnique({ where: { code: dto.role } });
      if (!role) {
        throw new ConflictException("企业角色尚未初始化，请先执行企业基础数据初始化");
      }
      const created = await tx.user.create({
        data: {
          username: dto.username,
          passwordHash,
          realName: dto.realName,
          role: dto.role,
          status: dto.status ?? UserStatus.ACTIVE,
          organizationId: operator.organizationId,
          departmentId: dto.departmentId,
          phone: dto.phone,
          email: dto.email,
        },
      });
      await tx.organizationMember.create({
        data: {
          organizationId: operator.organizationId!,
          userId: created.id,
          isPrimary: true,
        },
      });
      await tx.userRoleBinding.create({
        data: {
          organizationId: operator.organizationId!,
          userId: created.id,
          roleId: role.id,
        },
      });
      return created;
    });

    return toPublicUser(user);
  }

  async list(query: ListUsersDto, operator?: PublicUser) {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(operator?.organizationId ? { organizationId: operator.organizationId } : {}),
      role: query.role,
      status: query.status,
      OR: query.keyword
        ? [
            { username: { contains: query.keyword, mode: "insensitive" } },
            { realName: { contains: query.keyword, mode: "insensitive" } },
            { phone: { contains: query.keyword, mode: "insensitive" } },
            { email: { contains: query.keyword, mode: "insensitive" } },
          ]
        : undefined,
    };
    const skip = (query.page - 1) * query.pageSize;

    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip,
        take: query.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: items.map(toPublicUser),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / query.pageSize),
      },
    };
  }

  async findByUsername(username: string) {
    return this.prisma.user.findFirst({
      where: { username, deletedAt: null },
    });
  }

  async findById(id: string, organizationId?: string | null): Promise<PublicUser> {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null, ...(organizationId ? { organizationId } : {}) },
    });
    if (!user) {
      throw new NotFoundException("用户不存在");
    }

    return toPublicUser(user);
  }

  async updateStatus(id: string, status: UserStatus, organizationId?: string | null): Promise<PublicUser> {
    const exists = await this.prisma.user.findFirst({
      where: { id, deletedAt: null, ...(organizationId ? { organizationId } : {}) },
    });
    if (!exists) {
      throw new NotFoundException("用户不存在");
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: { status },
    });
    return toPublicUser(user);
  }
}
