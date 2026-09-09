import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { BusinessMatterStatus, DocumentStatus, Prisma, UserRole, UserStatus } from "@prisma/client";
import { randomUUID } from "node:crypto";

import { PublicUser } from "../users/user.presenter";
import { PrismaService } from "../prisma/prisma.service";
import { AttachBusinessMatterDocumentsDto } from "./dto/attach-business-matter-documents.dto";
import { CreateBusinessMatterDto } from "./dto/create-business-matter.dto";
import { ListBusinessMattersDto } from "./dto/list-business-matters.dto";
import { UpdateBusinessMatterDto } from "./dto/update-business-matter.dto";

const personSelect = { id: true, username: true, realName: true } satisfies Prisma.UserSelect;

@Injectable()
export class BusinessMattersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateBusinessMatterDto, user: PublicUser) {
    const ownerId = dto.ownerId ?? user.id;
    await this.ensureReferences({
      ownerId: dto.ownerId,
      departmentId: dto.departmentId,
      partnerId: dto.partnerId,
    });
    if (dto.parentId) {
      await this.ensureParentChain(null, dto.parentId);
    }

    return this.prisma.businessMatter.create({
      data: {
        matterNo: this.generateMatterNo(),
        title: dto.title.trim(),
        type: dto.type,
        status: dto.status ?? BusinessMatterStatus.PLANNING,
        parentId: dto.parentId ?? null,
        ownerId,
        createdById: user.id,
        departmentId: dto.departmentId ?? null,
        partnerId: dto.partnerId ?? null,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        amount: this.toDecimal(dto.amount),
        remark: dto.remark?.trim() || null,
      },
      include: this.listInclude(),
    });
  }

  async list(query: ListBusinessMattersDto) {
    const where: Prisma.BusinessMatterWhereInput = {
      deletedAt: null,
      type: query.type,
      status: query.status,
      parentId: query.parentId,
      ownerId: query.ownerId,
      departmentId: query.departmentId,
      partnerId: query.partnerId,
      documents: query.documentId ? { some: { documentId: query.documentId } } : undefined,
      OR: query.keyword
        ? [
            { title: { contains: query.keyword, mode: "insensitive" } },
            { matterNo: { contains: query.keyword, mode: "insensitive" } },
            { remark: { contains: query.keyword, mode: "insensitive" } },
          ]
        : undefined,
    };
    const skip = (query.page - 1) * query.pageSize;
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.businessMatter.findMany({
        where,
        include: this.listInclude(),
        orderBy: { [query.sortBy]: query.sortOrder },
        skip,
        take: query.pageSize,
      }),
      this.prisma.businessMatter.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / query.pageSize),
      },
    };
  }

  async findById(id: string) {
    const matter = await this.prisma.businessMatter.findFirst({
      where: { id, deletedAt: null },
      include: this.detailInclude(),
    });
    if (!matter) {
      throw new NotFoundException("事项不存在");
    }
    return matter;
  }

  async update(id: string, dto: UpdateBusinessMatterDto, user: PublicUser) {
    const matter = await this.requireEditable(id, user);
    if (dto.parentId !== undefined && dto.parentId !== null) {
      await this.ensureParentChain(id, dto.parentId);
    }
    await this.ensureReferences({
      ownerId: dto.ownerId === null ? undefined : dto.ownerId,
      departmentId: dto.departmentId === null ? undefined : dto.departmentId,
      partnerId: dto.partnerId === null ? undefined : dto.partnerId,
    });

    const data: Prisma.BusinessMatterUpdateInput = {
      title: dto.title === undefined ? undefined : dto.title.trim(),
      type: dto.type,
      status: dto.status,
      parent: dto.parentId === undefined ? undefined : dto.parentId === null ? { disconnect: true } : { connect: { id: dto.parentId } },
      owner: dto.ownerId === undefined ? undefined : dto.ownerId === null ? { connect: { id: matter.ownerId } } : { connect: { id: dto.ownerId } },
      department: dto.departmentId === undefined ? undefined : dto.departmentId === null ? { disconnect: true } : { connect: { id: dto.departmentId } },
      partner: dto.partnerId === undefined ? undefined : dto.partnerId === null ? { disconnect: true } : { connect: { id: dto.partnerId } },
      startDate: dto.startDate === undefined ? undefined : dto.startDate === null ? null : new Date(dto.startDate),
      endDate: dto.endDate === undefined ? undefined : dto.endDate === null ? null : new Date(dto.endDate),
      amount: dto.amount === undefined ? undefined : this.toDecimal(dto.amount),
      remark: dto.remark === undefined ? undefined : dto.remark?.trim() || null,
    };

    return this.prisma.businessMatter.update({
      where: { id },
      data,
      include: this.listInclude(),
    });
  }

  async remove(id: string, user: PublicUser) {
    await this.requireEditable(id, user);
    return this.prisma.businessMatter.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async attachDocuments(id: string, dto: AttachBusinessMatterDocumentsDto, user: PublicUser) {
    await this.requireEditable(id, user);
    const documentIds = [...new Set(dto.documentIds)];
    const documents = await this.prisma.document.findMany({
      where: { id: { in: documentIds }, deletedAt: null, status: { not: DocumentStatus.DELETED } },
      select: { id: true },
    });
    if (documents.length !== documentIds.length) {
      throw new BadRequestException("存在不存在或已删除的文件");
    }

    const existing = await this.prisma.businessMatterDocument.findMany({
      where: { matterId: id, documentId: { in: documentIds } },
      select: { documentId: true },
    });
    if (existing.length) {
      throw new ConflictException("所选文件中包含已关联文件");
    }

    const result = await this.prisma.businessMatterDocument.createMany({
      data: documentIds.map((documentId) => ({
        matterId: id,
        documentId,
        relationType: dto.relationType?.trim() || "REFERENCE",
        isPrimary: dto.isPrimary ?? false,
      })),
    });
    return { matterId: id, addedCount: result.count };
  }

  async detachDocument(id: string, documentId: string, user: PublicUser) {
    await this.requireEditable(id, user);
    const link = await this.prisma.businessMatterDocument.findFirst({
      where: { matterId: id, documentId },
    });
    if (!link) {
      throw new NotFoundException("文件关联不存在");
    }
    return this.prisma.businessMatterDocument.delete({
      where: { matterId_documentId: { matterId: id, documentId } },
    });
  }

  private async requireEditable(id: string, user: PublicUser) {
    const matter = await this.prisma.businessMatter.findFirst({ where: { id, deletedAt: null } });
    if (!matter) {
      throw new NotFoundException("事项不存在");
    }
    if (user.role !== UserRole.ADMIN && matter.createdById !== user.id && matter.ownerId !== user.id) {
      throw new ForbiddenException("只能修改自己创建或负责的事项");
    }
    return matter;
  }

  private async ensureReferences(input: { ownerId?: string; departmentId?: string; partnerId?: string }) {
    if (input.ownerId) {
      const owner = await this.prisma.user.findFirst({
        where: { id: input.ownerId, deletedAt: null, status: UserStatus.ACTIVE },
        select: { id: true },
      });
      if (!owner) {
        throw new BadRequestException("负责人不存在或已停用");
      }
    }
    if (input.departmentId) {
      const department = await this.prisma.department.findFirst({
        where: { id: input.departmentId, deletedAt: null },
        select: { id: true },
      });
      if (!department) {
        throw new BadRequestException("部门不存在");
      }
    }
    if (input.partnerId) {
      const partner = await this.prisma.partner.findFirst({
        where: { id: input.partnerId, deletedAt: null, status: "ACTIVE" },
        select: { id: true },
      });
      if (!partner) {
        throw new BadRequestException("合作单位不存在或已停用");
      }
    }
  }

  private async ensureParentChain(matterId: string | null, parentId: string) {
    if (matterId === parentId) {
      throw new BadRequestException("上级事项不能选择自身");
    }
    let current = await this.prisma.businessMatter.findFirst({
      where: { id: parentId, deletedAt: null },
      select: { id: true, parentId: true },
    });
    if (!current) {
      throw new BadRequestException("上级事项不存在");
    }
    while (current.parentId) {
      if (current.parentId === matterId) {
        throw new BadRequestException("事项层级不能形成循环");
      }
      current = await this.prisma.businessMatter.findFirst({
        where: { id: current.parentId, deletedAt: null },
        select: { id: true, parentId: true },
      });
      if (!current) {
        throw new BadRequestException("上级事项链无效");
      }
    }
  }

  private generateMatterNo() {
    const now = new Date();
    const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    return `MAT-${date}-${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  }

  private toDecimal(amount?: number | null) {
    return amount === undefined || amount === null ? amount : new Prisma.Decimal(amount);
  }

  private listInclude(): Prisma.BusinessMatterInclude {
    return {
      parent: { select: { id: true, matterNo: true, title: true, type: true, status: true } },
      owner: { select: personSelect },
      createdBy: { select: personSelect },
      department: { select: { id: true, name: true } },
      partner: { select: { id: true, companyName: true } },
      _count: { select: { documents: true, children: true } },
    };
  }

  private detailInclude(): Prisma.BusinessMatterInclude {
    return {
      ...this.listInclude(),
      children: {
        where: { deletedAt: null },
        select: { id: true, matterNo: true, title: true, type: true, status: true, parentId: true, updatedAt: true },
        orderBy: [{ type: "asc" }, { updatedAt: "desc" }],
      },
      documents: {
        include: { document: { include: { currentVersion: true } }, version: true },
        orderBy: { createdAt: "desc" },
      },
    };
  }
}
