import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";
import { CreateCategoryDto } from "./dto/create-category.dto";
import { UpdateCategoryDto } from "./dto/update-category.dto";

@Injectable()
export class CategoriesService {
  private readonly maxLevel = 4;

  constructor(private readonly prisma: PrismaService) {}

  listTree() {
    return this.prisma.category.findMany({
      where: { deletedAt: null, parentId: null },
      include: this.childrenInclude(this.maxLevel - 1),
      orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
    });
  }

  async create(dto: CreateCategoryDto) {
    if (!dto.parentId) {
      const code = await this.requireAvailablePrimaryCode(dto.code);
      return this.prisma.category.create({
        data: {
          name: dto.name,
          code,
          parentId: null,
          level: 1,
          isSystem: false,
          sort: dto.sort,
        },
      });
    }

    const parent = await this.prisma.category.findFirst({
      where: { id: dto.parentId, deletedAt: null },
    });
    if (!parent) {
      throw new NotFoundException("\u4e0a\u7ea7\u5206\u7c7b\u4e0d\u5b58\u5728");
    }
    if (parent.level >= this.maxLevel) {
      throw new BadRequestException("\u5206\u7c7b\u6700\u591a\u652f\u6301\u56db\u7ea7");
    }

    return this.prisma.category.create({
      data: {
        name: dto.name,
        parentId: dto.parentId,
        level: parent.level + 1,
        isSystem: false,
        sort: dto.sort,
      },
    });
  }

  async update(id: string, dto: UpdateCategoryDto) {
    const category = await this.ensureExists(id);
    const code =
      category.level === 1 && dto.code !== undefined ? await this.requireAvailablePrimaryCode(dto.code, id) : undefined;
    const parentId = category.level > 1 && dto.parentId !== undefined ? await this.requireParentForLevel(dto.parentId, category.level) : undefined;

    return this.prisma.category.update({
      where: { id },
      data: {
        name: dto.name,
        code,
        parentId,
        sort: dto.sort,
      },
    });
  }

  async remove(id: string) {
    const category = await this.ensureExists(id);
    const childCount = await this.prisma.category.count({
      where: { parentId: id, deletedAt: null },
    });
    if (childCount > 0) {
      throw new BadRequestException("\u8bf7\u5148\u5220\u9664\u8be5\u5206\u7c7b\u4e0b\u7684\u5b50\u5206\u7c7b");
    }

    const documentCount = await this.prisma.document.count({
      where:
        category.level === 1
          ? { categoryId: id, deletedAt: null }
          : { subcategoryId: id, deletedAt: null },
    });
    if (documentCount > 0) {
      throw new BadRequestException("\u8be5\u5206\u7c7b\u4e0b\u8fd8\u6709\u6587\u4ef6\uff0c\u4e0d\u80fd\u5220\u9664");
    }

    return this.prisma.category.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  private async ensureExists(id: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, deletedAt: null },
    });
    if (!category) {
      throw new NotFoundException("\u5206\u7c7b\u4e0d\u5b58\u5728");
    }

    return category;
  }

  private childrenInclude(depth: number): object {
    if (depth <= 0) {
      return {};
    }
    const childQuery: Record<string, unknown> = {
      where: { deletedAt: null },
      orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
    };
    if (depth > 1) {
      childQuery.include = this.childrenInclude(depth - 1);
    }
    return {
      children: childQuery,
    };
  }

  private async requireParentForLevel(parentId: string, level: number) {
    const parent = await this.prisma.category.findFirst({
      where: { id: parentId, level: level - 1, deletedAt: null },
    });
    if (!parent) {
      throw new BadRequestException("\u4e0a\u7ea7\u5206\u7c7b\u4e0d\u5b58\u5728\u6216\u5c42\u7ea7\u4e0d\u5339\u914d");
    }

    return parentId;
  }

  private async requireAvailablePrimaryCode(code: string | undefined, currentId?: string) {
    const normalized = code?.trim().toUpperCase();
    if (!normalized) {
      throw new BadRequestException("\u4e00\u7ea7\u5206\u7c7b\u5fc5\u987b\u586b\u5199\u6587\u4ef6\u7f16\u53f7\u524d\u7f00");
    }

    const existing = await this.prisma.category.findUnique({ where: { code: normalized } });
    if (existing && existing.id !== currentId) {
      throw new BadRequestException("\u6587\u4ef6\u7f16\u53f7\u524d\u7f00\u5df2\u5b58\u5728");
    }

    return normalized;
  }
}
