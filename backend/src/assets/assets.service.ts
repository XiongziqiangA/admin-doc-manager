import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DocumentStatus, Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";

import { AuthorizationService } from "../authorization/authorization.service";
import { PERMISSIONS } from "../authorization/permissions";
import { PrismaService } from "../prisma/prisma.service";
import { PublicUser } from "../users/user.presenter";
import { parseFieldSchema, validateCustomFields } from "./asset-field-schema";
import { AttachAssetDocumentsDto } from "./dto/attach-asset-documents.dto";
import { ConfirmPendingAssetDto } from "./dto/confirm-pending-asset.dto";
import { CreateAssetIdentifierDto } from "./dto/create-asset-identifier.dto";
import { CreateAssetDto } from "./dto/create-asset.dto";
import { CreateAssetTypeDto } from "./dto/create-asset-type.dto";
import { CreateLocationDto } from "./dto/create-location.dto";
import { CreatePendingAssetDto } from "./dto/create-pending-asset.dto";
import { ListAssetsDto } from "./dto/list-assets.dto";
import { UpdateAssetIdentifierDto } from "./dto/update-asset-identifier.dto";
import { UpdateAssetDto } from "./dto/update-asset.dto";
import { UpdateAssetTypeDto } from "./dto/update-asset-type.dto";
import { UpdateLocationDto } from "./dto/update-location.dto";

const ASSET_INCLUDE = {
  assetType: true,
  department: { select: { id: true, name: true } },
  location: { select: { id: true, name: true } },
  owner: { select: { id: true, realName: true, username: true } },
  usingUser: { select: { id: true, realName: true, username: true } },
  identifiers: { orderBy: [{ isPrimary: "desc" as const }, { createdAt: "asc" as const }] },
} satisfies Prisma.AssetInclude;

const ASSET_DETAIL_INCLUDE = {
  ...ASSET_INCLUDE,
  documents: {
    orderBy: { createdAt: "desc" as const },
    include: {
      document: {
        include: {
          currentVersion: true,
          category: true,
          subcategory: true,
        },
      },
    },
  },
} satisfies Prisma.AssetInclude;

type AssetWriteClient = Pick<
  Prisma.TransactionClient,
  "asset" | "assetType" | "businessMatter" | "department" | "location" | "user"
>;

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  private organizationId(user: PublicUser): string {
    if (!user.organizationId) {
      throw new ForbiddenException("当前账号尚未绑定企业");
    }
    return user.organizationId;
  }

  private async assertPermission(user: PublicUser, permission: string) {
    await this.authorization.assertAllPermissions(user, [permission]);
  }

  async listTypes(user: PublicUser, includeDisabled = false) {
    await this.assertPermission(user, PERMISSIONS.ASSET_READ);
    const organizationId = this.organizationId(user);
    return this.prisma.assetType.findMany({
      where: { organizationId, ...(includeDisabled ? {} : { enabled: true }) },
      orderBy: [{ parentId: "asc" }, { name: "asc" }],
    });
  }

  async createType(user: PublicUser, dto: CreateAssetTypeDto) {
    await this.assertPermission(user, PERMISSIONS.ASSET_UPDATE);
    const organizationId = this.organizationId(user);
    await this.assertParentType(organizationId, dto.parentId);
    try {
      return await this.prisma.assetType.create({
        data: {
          organizationId,
          name: dto.name.trim(),
          code: dto.code.trim().toUpperCase(),
          parentId: dto.parentId,
          fieldSchema: dto.fieldSchema as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("当前企业中资产类型编码已存在");
      }
      throw error;
    }
  }

  async updateType(user: PublicUser, id: string, dto: UpdateAssetTypeDto) {
    await this.assertPermission(user, PERMISSIONS.ASSET_UPDATE);
    const organizationId = this.organizationId(user);
    const current = await this.prisma.assetType.findFirst({ where: { id, organizationId } });
    if (!current) throw new NotFoundException("资产类型不存在");
    if (dto.parentId === id) throw new ConflictException("资产类型不能将自己设为父级");
    await this.assertParentType(organizationId, dto.parentId, id);

    if (dto.fieldSchema) {
      const nextKeys = new Set(dto.fieldSchema.map((field) => field.key));
      const used = await this.prisma.asset.findMany({
        where: { assetTypeId: id, organizationId },
        select: { customFields: true },
      });
      const usedKeys = new Set(
        used.flatMap((asset) =>
          asset.customFields && typeof asset.customFields === "object" && !Array.isArray(asset.customFields)
            ? Object.keys(asset.customFields as Record<string, unknown>)
            : [],
        ),
      );
      const removed = [...usedKeys].filter((key) => !nextKeys.has(key));
      if (removed.length) {
        throw new ConflictException(`已使用的自定义字段不能删除：${removed.join("、")}`);
      }
    }

    try {
      return await this.prisma.assetType.update({
        where: { id },
        data: {
          name: dto.name?.trim(),
          code: dto.code?.trim().toUpperCase(),
          parentId: dto.parentId,
          enabled: dto.enabled,
          fieldSchema: dto.fieldSchema as unknown as Prisma.InputJsonValue | undefined,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("当前企业中资产类型编码已存在");
      }
      throw error;
    }
  }

  async listLocations(user: PublicUser, includeDisabled = false) {
    await this.assertPermission(user, PERMISSIONS.ASSET_READ);
    const organizationId = this.organizationId(user);
    return this.prisma.location.findMany({
      where: { organizationId, ...(includeDisabled ? {} : { enabled: true }) },
      orderBy: [{ parentId: "asc" }, { name: "asc" }],
    });
  }

  async createLocation(user: PublicUser, dto: CreateLocationDto) {
    await this.assertPermission(user, PERMISSIONS.ASSET_UPDATE);
    const organizationId = this.organizationId(user);
    await this.assertLocationParent(organizationId, dto.parentId);
    try {
      return await this.prisma.location.create({
        data: {
          organizationId,
          name: dto.name.trim(),
          code: dto.code.trim().toUpperCase(),
          parentId: dto.parentId,
        },
      });
    } catch (error) {
      this.mapLocationUniqueError(error);
      throw error;
    }
  }

  async updateLocation(user: PublicUser, id: string, dto: UpdateLocationDto) {
    await this.assertPermission(user, PERMISSIONS.ASSET_UPDATE);
    const organizationId = this.organizationId(user);
    const current = await this.prisma.location.findFirst({ where: { id, organizationId } });
    if (!current) throw new NotFoundException("位置不存在");
    if (dto.parentId === id) throw new ConflictException("位置不能将自己设为上级位置");
    if (dto.parentId !== undefined) {
      await this.assertLocationParent(organizationId, dto.parentId, id);
    }
    try {
      return await this.prisma.location.update({
        where: { id },
        data: {
          name: dto.name?.trim(),
          code: dto.code?.trim().toUpperCase(),
          parentId: dto.parentId,
          enabled: dto.enabled,
        },
      });
    } catch (error) {
      this.mapLocationUniqueError(error);
      throw error;
    }
  }

  async removeLocation(user: PublicUser, id: string) {
    await this.assertPermission(user, PERMISSIONS.ASSET_UPDATE);
    const organizationId = this.organizationId(user);
    const current = await this.prisma.location.findFirst({ where: { id, organizationId } });
    if (!current) throw new NotFoundException("位置不存在");
    const [childCount, assetCount] = await this.prisma.$transaction([
      this.prisma.location.count({ where: { parentId: id, organizationId, enabled: true } }),
      this.prisma.asset.count({ where: { locationId: id, organizationId, archivedAt: null } }),
    ]);
    if (childCount > 0) throw new ConflictException("该位置仍有启用中的下级位置，不能停用");
    if (assetCount > 0) throw new ConflictException("该位置仍有关联资产，不能停用");
    return this.prisma.location.update({ where: { id }, data: { enabled: false } });
  }

  async list(user: PublicUser, query: ListAssetsDto) {
    await this.assertPermission(user, PERMISSIONS.ASSET_READ);
    const organizationId = this.organizationId(user);
    const keyword = query.keyword?.trim();
    const where: Prisma.AssetWhereInput = {
      organizationId,
      ...(query.assetTypeId ? { assetTypeId: query.assetTypeId } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.locationId ? { locationId: query.locationId } : {}),
      ...(query.businessMatterId ? { businessMatterId: query.businessMatterId } : {}),
      ...(query.assetStatus ? { assetStatus: query.assetStatus } : {}),
      ...(query.resourceStatus ? { resourceStatus: query.resourceStatus } : {}),
      ...(keyword
        ? {
            OR: [
              { name: { contains: keyword, mode: "insensitive" } },
              { assetCode: { contains: keyword, mode: "insensitive" } },
              { serialNumber: { contains: keyword, mode: "insensitive" } },
              { brand: { contains: keyword, mode: "insensitive" } },
              { model: { contains: keyword, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const skip = (query.page - 1) * query.pageSize;
    const orderBy = { [query.sortBy]: query.sortOrder } as Prisma.AssetOrderByWithRelationInput;
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.asset.findMany({ where, include: ASSET_INCLUDE, orderBy, skip, take: query.pageSize }),
      this.prisma.asset.count({ where }),
    ]);
    return {
      items,
      pagination: { page: query.page, pageSize: query.pageSize, totalItems, totalPages: Math.ceil(totalItems / query.pageSize) },
    };
  }

  async overview(user: PublicUser) {
    await this.assertPermission(user, PERMISSIONS.ASSET_READ);
    const organizationId = this.organizationId(user);
    const [total, active, available, borrowed, pending] = await this.prisma.$transaction([
      this.prisma.asset.count({ where: { organizationId, archivedAt: null } }),
      this.prisma.asset.count({ where: { organizationId, archivedAt: null, assetStatus: "active" } }),
      this.prisma.asset.count({ where: { organizationId, archivedAt: null, resourceStatus: "available" } }),
      this.prisma.asset.count({ where: { organizationId, archivedAt: null, resourceStatus: "borrowed" } }),
      this.prisma.pendingAsset.count({ where: { organizationId, status: "pending" } }),
    ]);
    return { total, active, available, borrowed, pending };
  }

  async findById(user: PublicUser, id: string) {
    await this.assertPermission(user, PERMISSIONS.ASSET_READ);
    const organizationId = this.organizationId(user);
    const asset = await this.prisma.asset.findFirst({ where: { id, organizationId }, include: ASSET_DETAIL_INCLUDE });
    if (!asset) throw new NotFoundException("资产不存在");
    return asset;
  }

  async attachDocuments(user: PublicUser, assetId: string, dto: AttachAssetDocumentsDto) {
    await this.assertPermission(user, PERMISSIONS.ASSET_UPDATE);
    const organizationId = this.organizationId(user);
    await this.assertAssetInOrganization(user, assetId);
    const uniqueDocumentIds = [...new Set(dto.documentIds)];
    const documents = await this.prisma.document.findMany({
      where: {
        id: { in: uniqueDocumentIds },
        deletedAt: null,
        status: { not: DocumentStatus.DELETED },
        creator: { organizationId },
      },
      select: { id: true },
    });
    if (documents.length !== uniqueDocumentIds.length) {
      throw new BadRequestException("存在不存在、已删除或不属于当前企业的文件");
    }

    const existing = await this.prisma.assetDocument.findMany({
      where: { organizationId, assetId, documentId: { in: uniqueDocumentIds } },
      select: { documentId: true },
    });
    if (existing.length) {
      throw new ConflictException("所选文件中包含已关联文件");
    }

    try {
      const result = await this.prisma.assetDocument.createMany({
        data: uniqueDocumentIds.map((documentId) => ({ organizationId, assetId, documentId })),
      });
      return { assetId, addedCount: result.count };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("所选文件中包含已关联文件，请刷新后重试");
      }
      throw error;
    }
  }

  async detachDocument(user: PublicUser, assetId: string, documentId: string) {
    await this.assertPermission(user, PERMISSIONS.ASSET_UPDATE);
    const organizationId = this.organizationId(user);
    await this.assertAssetInOrganization(user, assetId);
    const link = await this.prisma.assetDocument.findFirst({
      where: { organizationId, assetId, documentId },
      select: { assetId: true, documentId: true },
    });
    if (!link) {
      throw new NotFoundException("文件关联不存在");
    }
    return this.prisma.assetDocument.delete({
      where: { assetId_documentId: { assetId, documentId } },
    });
  }

  async createIdentifier(user: PublicUser, assetId: string, dto: CreateAssetIdentifierDto) {
    await this.assertPermission(user, PERMISSIONS.ASSET_UPDATE);
    const identifierType = dto.identifierType.trim().toLowerCase();
    if (identifierType === "qr") {
      throw new BadRequestException("系统二维码由系统维护，不能手工新增");
    }
    await this.assertAssetInOrganization(user, assetId);
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (dto.isPrimary) {
          await tx.assetIdentifier.updateMany({
            where: { assetId, identifierType, isPrimary: true },
            data: { isPrimary: false },
          });
        }
        return tx.assetIdentifier.create({
          data: {
            assetId,
            identifierType,
            value: dto.value.trim(),
            isPrimary: dto.isPrimary,
          },
        });
      });
    } catch (error) {
      this.mapIdentifierUniqueError(error);
      throw error;
    }
  }

  async updateIdentifier(
    user: PublicUser,
    assetId: string,
    identifierId: string,
    dto: UpdateAssetIdentifierDto,
  ) {
    await this.assertPermission(user, PERMISSIONS.ASSET_UPDATE);
    await this.assertAssetInOrganization(user, assetId);
    const current = await this.prisma.assetIdentifier.findFirst({
      where: { id: identifierId, assetId },
    });
    if (!current) throw new NotFoundException("资产识别码不存在");
    if (current.identifierType === "qr") {
      throw new BadRequestException("系统二维码不能修改");
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (dto.isPrimary) {
          await tx.assetIdentifier.updateMany({
            where: {
              assetId,
              identifierType: current.identifierType,
              isPrimary: true,
              id: { not: identifierId },
            },
            data: { isPrimary: false },
          });
        }
        return tx.assetIdentifier.update({
          where: { id: identifierId },
          data: {
            value: dto.value?.trim(),
            isPrimary: dto.isPrimary,
          },
        });
      });
    } catch (error) {
      this.mapIdentifierUniqueError(error);
      throw error;
    }
  }

  async removeIdentifier(user: PublicUser, assetId: string, identifierId: string) {
    await this.assertPermission(user, PERMISSIONS.ASSET_UPDATE);
    await this.assertAssetInOrganization(user, assetId);
    const current = await this.prisma.assetIdentifier.findFirst({
      where: { id: identifierId, assetId },
    });
    if (!current) throw new NotFoundException("资产识别码不存在");
    if (current.identifierType === "qr") {
      throw new BadRequestException("系统二维码不能删除");
    }
    await this.prisma.assetIdentifier.delete({ where: { id: identifierId } });
  }

  async create(user: PublicUser, dto: CreateAssetDto) {
    await this.assertPermission(user, PERMISSIONS.ASSET_CREATE);
    const organizationId = this.organizationId(user);
    try {
      return await this.createAssetRecord(this.prisma, user, organizationId, dto);
    } catch (error) {
      this.mapUniqueError(error);
      throw error;
    }
  }

  async update(user: PublicUser, id: string, dto: UpdateAssetDto) {
    await this.assertPermission(user, PERMISSIONS.ASSET_UPDATE);
    const organizationId = this.organizationId(user);
    const current = await this.prisma.asset.findFirst({ where: { id, organizationId } });
    if (!current) throw new NotFoundException("资产不存在");
    if (current.version !== dto.version) throw new ConflictException("资产已被其他用户更新，请刷新后重试");
    const type = await this.getEnabledType(
      this.prisma,
      organizationId,
      dto.assetTypeId ?? current.assetTypeId,
    );
    const customFields = dto.customFields ?? (current.customFields as Record<string, unknown>);
    validateCustomFields(parseFieldSchema(type.fieldSchema), customFields);
    await this.assertReferences(this.prisma, organizationId, dto);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.asset.updateMany({
          where: { id, organizationId, version: dto.version },
          data: {
            assetTypeId: type.id,
            assetCode: dto.assetCode?.trim(),
            name: dto.name?.trim(),
            brand: dto.brand,
            model: dto.model,
            serialNumber:
              dto.serialNumber === undefined ? undefined : dto.serialNumber?.trim() || null,
            supplier: dto.supplier,
            purchaseDate:
              dto.purchaseDate === undefined
                ? undefined
                : dto.purchaseDate
                  ? new Date(dto.purchaseDate)
                  : null,
            purchaseAmount: dto.purchaseAmount,
            businessMatterId: dto.businessMatterId,
            departmentId: dto.departmentId,
            locationId: dto.locationId,
            ownerUserId: dto.ownerUserId,
            usingUserId: dto.usingUserId,
            customFields: customFields as Prisma.InputJsonValue,
            description: dto.description,
            assetStatus: dto.assetStatus,
            resourceStatus: dto.resourceStatus,
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1) {
          throw new ConflictException("资产已被其他用户更新，请刷新后重试");
        }
        const result = await tx.asset.findUnique({ where: { id }, include: ASSET_INCLUDE });
        if (!result) throw new NotFoundException("资产不存在");
        return result;
      });
    } catch (error) {
      this.mapUniqueError(error);
      throw error;
    }
  }

  async createPending(user: PublicUser, dto: CreatePendingAssetDto) {
    await this.assertPermission(user, PERMISSIONS.ASSET_SUBMIT);
    const organizationId = this.organizationId(user);
    const payload = dto.rawPayload ?? {};
    const candidates = await this.prisma.asset.findMany({
      where: {
        organizationId,
        OR: [
          ...(typeof payload.serialNumber === "string" && payload.serialNumber.trim() ? [{ serialNumber: payload.serialNumber.trim() }] : []),
          ...(typeof payload.assetCode === "string" && payload.assetCode.trim() ? [{ assetCode: payload.assetCode.trim() }] : []),
        ],
      },
      select: { id: true, assetCode: true, name: true, serialNumber: true },
      take: 10,
    });
    return this.prisma.pendingAsset.create({
      data: {
        organizationId,
        submittedById: user.id,
        source: dto.aiFields ? "ai_assisted" : "employee_submitted",
        rawPayload: payload as Prisma.InputJsonValue,
        aiFields: dto.aiFields as Prisma.InputJsonValue | undefined,
        confidence: dto.confidence,
        duplicateCandidates: candidates as Prisma.InputJsonValue,
      },
    });
  }

  async listPending(user: PublicUser, status = "pending") {
    await this.assertPermission(user, PERMISSIONS.ASSET_CREATE);
    const organizationId = this.organizationId(user);
    return this.prisma.pendingAsset.findMany({
      where: { organizationId, status },
      include: { submittedBy: { select: { id: true, realName: true } }, reviewedBy: { select: { id: true, realName: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async confirmPending(user: PublicUser, id: string, dto: ConfirmPendingAssetDto) {
    await this.assertPermission(user, PERMISSIONS.ASSET_CREATE);
    const organizationId = this.organizationId(user);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const pending = await tx.pendingAsset.findFirst({
          where: { id, organizationId, status: "pending" },
        });
        if (!pending) throw new NotFoundException("待确认资产不存在或已处理");
        const asset = await this.createAssetRecord(tx, user, organizationId, dto);
        const updated = await tx.pendingAsset.updateMany({
          where: { id, organizationId, status: "pending" },
          data: {
            status: "confirmed",
            reviewedById: user.id,
            reviewNote: dto.reviewNote,
            reviewedAt: new Date(),
          },
        });
        if (updated.count !== 1) {
          throw new ConflictException("待确认资产已被其他用户处理，请刷新后重试");
        }
        return asset;
      });
    } catch (error) {
      this.mapUniqueError(error);
      throw error;
    }
  }

  async assertNotDeletable(user: PublicUser, id: string) {
    await this.findById(user, id);
    throw new ForbiddenException("正式资产不允许物理删除，请使用资产退出或归档流程");
  }

  private async assertParentType(
    organizationId: string,
    parentId?: string | null,
    currentId?: string,
  ) {
    if (!parentId) return;
    const parent = await this.prisma.assetType.findFirst({ where: { id: parentId, organizationId } });
    if (!parent) throw new NotFoundException("父级资产类型不存在");
    let cursor = parent.parentId;
    while (cursor) {
      if (cursor === currentId) throw new ConflictException("资产类型层级不能形成循环");
      const ancestor = await this.prisma.assetType.findFirst({ where: { id: cursor, organizationId }, select: { parentId: true } });
      cursor = ancestor?.parentId ?? null;
    }
  }

  private async assertLocationParent(
    organizationId: string,
    parentId?: string | null,
    currentId?: string,
  ) {
    if (!parentId) return;
    const parent = await this.prisma.location.findFirst({
      where: { id: parentId, organizationId },
    });
    if (!parent) throw new NotFoundException("上级位置不存在");
    let cursor = parent.parentId;
    while (cursor) {
      if (cursor === currentId) throw new ConflictException("位置层级不能形成循环");
      const ancestor = await this.prisma.location.findFirst({
        where: { id: cursor, organizationId },
        select: { parentId: true },
      });
      cursor = ancestor?.parentId ?? null;
    }
  }

  private async getEnabledType(
    db: AssetWriteClient,
    organizationId: string,
    id: string,
  ) {
    const type = await db.assetType.findFirst({ where: { id, organizationId, enabled: true } });
    if (!type) throw new NotFoundException("资产类型不存在或已停用");
    return type;
  }

  private async assertReferences(
    db: AssetWriteClient,
    organizationId: string,
    dto: Partial<CreateAssetDto>,
  ) {
    if (dto.departmentId) {
      const department = await db.department.findFirst({
        where: { id: dto.departmentId, deletedAt: null },
      });
      if (!department) throw new NotFoundException("所属部门不存在");
    }
    if (dto.locationId) {
      const location = await db.location.findFirst({
        where: { id: dto.locationId, organizationId, enabled: true },
      });
      if (!location) throw new NotFoundException("所属位置不存在或已停用");
    }
    for (const userId of [dto.ownerUserId, dto.usingUserId].filter(
      (value): value is string => Boolean(value),
    )) {
      const target = await db.user.findFirst({
        where: { id: userId, organizationId, deletedAt: null },
      });
      if (!target) throw new NotFoundException("资产责任人或使用人不存在");
    }
    if (dto.businessMatterId) {
      const matter = await db.businessMatter.findFirst({
        where: { id: dto.businessMatterId, deletedAt: null, type: "PROJECT" },
      });
      if (!matter) throw new NotFoundException("关联项目不存在");
    }
  }

  private async createAssetRecord(
    db: AssetWriteClient,
    user: PublicUser,
    organizationId: string,
    dto: CreateAssetDto,
  ) {
    const type = await this.getEnabledType(db, organizationId, dto.assetTypeId);
    await this.assertReferences(db, organizationId, dto);
    validateCustomFields(parseFieldSchema(type.fieldSchema), dto.customFields);
    const assetCode =
      dto.assetCode?.trim() ||
      `ASSET-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
    return db.asset.create({
      data: this.assetData(organizationId, user.id, dto, assetCode, type.id),
      include: ASSET_INCLUDE,
    });
  }

  private async assertAssetInOrganization(user: PublicUser, assetId: string) {
    const organizationId = this.organizationId(user);
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, organizationId },
      select: { id: true },
    });
    if (!asset) throw new NotFoundException("资产不存在");
    return asset;
  }

  private assetData(organizationId: string, userId: string, dto: CreateAssetDto, assetCode: string, assetTypeId: string): Prisma.AssetCreateInput {
    const qrToken = `asset:${randomUUID()}`;
    return {
      organization: { connect: { id: organizationId } },
      assetType: { connect: { id: assetTypeId } },
      createdBy: { connect: { id: userId } },
      businessMatter: dto.businessMatterId ? { connect: { id: dto.businessMatterId } } : undefined,
      department: dto.departmentId ? { connect: { id: dto.departmentId } } : undefined,
      location: dto.locationId ? { connect: { id: dto.locationId } } : undefined,
      owner: dto.ownerUserId ? { connect: { id: dto.ownerUserId } } : undefined,
      usingUser: dto.usingUserId ? { connect: { id: dto.usingUserId } } : undefined,
      assetCode,
      name: dto.name.trim(),
      brand: dto.brand,
      model: dto.model,
      serialNumber: dto.serialNumber?.trim() || null,
      supplier: dto.supplier,
      purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : undefined,
      purchaseAmount: dto.purchaseAmount,
      customFields: dto.customFields as Prisma.InputJsonValue,
      description: dto.description,
      qrToken,
      identifiers: {
        create: { identifierType: "qr", value: qrToken, isPrimary: true },
      },
    };
  }

  private mapUniqueError(error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictException("资产编号、序列号或二维码已存在");
    }
  }

  private mapLocationUniqueError(error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictException("当前企业中位置编码已存在");
    }
  }

  private mapIdentifierUniqueError(error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictException("识别码类型和值已存在");
    }
  }
}
