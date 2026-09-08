import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";
import { CreateTagDto } from "./dto/create-tag.dto";
import { ListTagsDto } from "./dto/list-tags.dto";
import { UpdateTagDto } from "./dto/update-tag.dto";
import { normalizeTagName } from "./tag-name";

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  list(query: ListTagsDto) {
    return this.prisma.tag.findMany({
      where: {
        deletedAt: null,
        name: query.keyword ? { contains: query.keyword, mode: "insensitive" } : undefined,
      },
      orderBy: [{ updatedAt: "desc" }],
    });
  }

  async create(dto: CreateTagDto, userId: string) {
    const name = normalizeTagName(dto.name);
    const existing = await this.prisma.tag.findUnique({
      where: { normalized: name.toLowerCase() },
    });
    if (existing && !existing.deletedAt) {
      return existing;
    }
    if (existing?.deletedAt) {
      return this.prisma.tag.update({
        where: { id: existing.id },
        data: {
          name,
          deletedAt: null,
          createdById: userId,
        },
      });
    }

    return this.prisma.tag.create({
      data: {
        name,
        normalized: name.toLowerCase(),
        createdById: userId,
      },
    });
  }

  async update(id: string, dto: UpdateTagDto) {
    await this.ensureExists(id);
    const name = normalizeTagName(dto.name);
    const normalized = name.toLowerCase();
    const existing = await this.prisma.tag.findUnique({ where: { normalized } });
    if (existing && existing.id !== id && !existing.deletedAt) {
      throw new ConflictException("标签名称已存在");
    }

    return this.prisma.tag.update({
      where: { id },
      data: { name, normalized },
    });
  }

  async remove(id: string) {
    await this.ensureExists(id);

    return this.prisma.tag.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async merge(sourceId: string, targetId: string) {
    if (sourceId === targetId) {
      throw new BadRequestException("不能合并到同一个标签");
    }
    await this.ensureExists(sourceId);
    await this.ensureExists(targetId);

    return this.prisma.tag.update({
      where: { id: sourceId },
      data: { deletedAt: new Date() },
    });
  }

  private async ensureExists(id: string) {
    const tag = await this.prisma.tag.findFirst({
      where: { id, deletedAt: null },
    });
    if (!tag) {
      throw new NotFoundException("标签不存在");
    }

    return tag;
  }
}
