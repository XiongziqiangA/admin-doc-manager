import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import { CreatePartnerDto } from "./dto/create-partner.dto";
import { ListPartnersDto } from "./dto/list-partners.dto";
import { UpdatePartnerDto } from "./dto/update-partner.dto";

@Injectable()
export class PartnersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePartnerDto) {
    const companyName = dto.companyName.trim();
    await this.ensureCompanyNameAvailable(companyName);

    return this.prisma.partner.create({
      data: {
        companyName,
        type: dto.type,
        contactName: dto.contactName,
        phone: dto.phone,
        email: dto.email,
        address: dto.address,
        remark: dto.remark,
        status: dto.status,
      },
    });
  }

  async list(query: ListPartnersDto) {
    const where: Prisma.PartnerWhereInput = {
      deletedAt: null,
      type: query.type,
      status: query.status,
      OR: query.keyword
        ? [
            { companyName: { contains: query.keyword, mode: "insensitive" } },
            { contactName: { contains: query.keyword, mode: "insensitive" } },
            { phone: { contains: query.keyword, mode: "insensitive" } },
            { email: { contains: query.keyword, mode: "insensitive" } },
            { address: { contains: query.keyword, mode: "insensitive" } },
          ]
        : undefined,
    };
    const skip = (query.page - 1) * query.pageSize;

    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.partner.findMany({
        where,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip,
        take: query.pageSize,
      }),
      this.prisma.partner.count({ where }),
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
    const partner = await this.prisma.partner.findFirst({
      where: { id, deletedAt: null },
    });
    if (!partner) {
      throw new NotFoundException("合作单位不存在");
    }

    return partner;
  }

  async update(id: string, dto: UpdatePartnerDto) {
    await this.findById(id);
    const companyName = dto.companyName?.trim();
    if (companyName) {
      await this.ensureCompanyNameAvailable(companyName, id);
    }

    return this.prisma.partner.update({
      where: { id },
      data: {
        companyName,
        type: dto.type,
        contactName: dto.contactName,
        phone: dto.phone,
        email: dto.email,
        address: dto.address,
        remark: dto.remark,
        status: dto.status,
      },
    });
  }

  async remove(id: string) {
    await this.findById(id);

    return this.prisma.partner.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  private async ensureCompanyNameAvailable(companyName: string, exceptId?: string) {
    const existing = await this.prisma.partner.findUnique({
      where: { companyName },
    });
    if (existing && existing.id !== exceptId && !existing.deletedAt) {
      throw new ConflictException("合作单位名称已存在");
    }
  }
}
