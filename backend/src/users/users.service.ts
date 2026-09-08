import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
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

  async create(dto: CreateUserDto): Promise<PublicUser> {
    const existing = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });
    if (existing) {
      throw new ConflictException("账号已存在");
    }

    const passwordHash = await this.passwordService.hashPassword(dto.password);
    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        passwordHash,
        realName: dto.realName,
        role: dto.role,
        status: dto.status ?? UserStatus.ACTIVE,
        departmentId: dto.departmentId,
        phone: dto.phone,
        email: dto.email,
      },
    });

    return toPublicUser(user);
  }

  async list(query: ListUsersDto) {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
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

  async findById(id: string): Promise<PublicUser> {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
    });
    if (!user) {
      throw new NotFoundException("用户不存在");
    }

    return toPublicUser(user);
  }

  async updateStatus(id: string, status: UserStatus): Promise<PublicUser> {
    const exists = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
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
