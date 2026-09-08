import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import { CreateDepartmentDto } from "./dto/create-department.dto";
import { ListDepartmentsDto } from "./dto/list-departments.dto";
import { UpdateDepartmentDto } from "./dto/update-department.dto";

@Injectable()
export class DepartmentsService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateDepartmentDto) {
    return this.prisma.department.create({
      data: {
        name: dto.name,
        parentId: dto.parentId,
        managerNote: dto.managerNote,
      },
    });
  }

  list(query: ListDepartmentsDto) {
    const where: Prisma.DepartmentWhereInput = {
      deletedAt: null,
      name: query.keyword ? { contains: query.keyword, mode: "insensitive" } : undefined,
    };

    return this.prisma.department.findMany({
      where,
      orderBy: [{ parentId: "asc" }, { createdAt: "asc" }],
    });
  }

  async update(id: string, dto: UpdateDepartmentDto) {
    await this.ensureExists(id);
    if (dto.parentId === id) {
      throw new BadRequestException("上级部门不能选择自身");
    }

    return this.prisma.department.update({
      where: { id },
      data: {
        name: dto.name,
        parentId: dto.parentId,
        managerNote: dto.managerNote,
      },
    });
  }

  async remove(id: string) {
    await this.ensureExists(id);

    return this.prisma.department.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  private async ensureExists(id: string) {
    const department = await this.prisma.department.findFirst({
      where: { id, deletedAt: null },
    });
    if (!department) {
      throw new NotFoundException("部门不存在");
    }

    return department;
  }
}
