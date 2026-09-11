import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AssetAnomalyStatus,
  AssetAnomalyType,
  AssetInventoryResult,
  AssetInventoryScopeType,
  AssetInventoryStatus,
  Prisma,
  UserRole,
  UserStatus,
} from "@prisma/client";

import { AuthorizationService } from "../authorization/authorization.service";
import { PERMISSIONS } from "../authorization/permissions";
import { PrismaService } from "../prisma/prisma.service";
import { PublicUser } from "../users/user.presenter";
import { CancelAssetInventoryTaskDto } from "./dto/cancel-asset-inventory-task.dto";
import { CreateAssetInventoryTaskDto } from "./dto/create-asset-inventory-task.dto";
import { ListAssetInventoryTasksDto } from "./dto/list-asset-inventory-tasks.dto";
import { RecordAssetInventoryDto } from "./dto/record-asset-inventory.dto";

const TASK_INCLUDE = {
  owner: { select: { id: true, realName: true, username: true } },
  createdBy: { select: { id: true, realName: true, username: true } },
  _count: { select: { records: true } },
} satisfies Prisma.AssetInventoryTaskInclude;

const RECORD_INCLUDE = {
  asset: {
    select: {
      id: true,
      assetCode: true,
      name: true,
      assetStatus: true,
      resourceStatus: true,
      location: { select: { id: true, name: true } },
      owner: { select: { id: true, realName: true, username: true } },
    },
  },
  checker: { select: { id: true, realName: true, username: true } },
  checkedLocation: { select: { id: true, name: true } },
} satisfies Prisma.AssetInventoryRecordInclude;

type InventoryTaskScope = Pick<
  Prisma.AssetInventoryTaskGetPayload<Record<string, never>>,
  "organizationId" | "scopeType" | "scopeValue"
>;

@Injectable()
export class AssetInventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  async list(user: PublicUser, query: ListAssetInventoryTasksDto) {
    await this.authorization.assertAllPermissions(user, [PERMISSIONS.ASSET_READ]);
    const organizationId = this.organizationId(user);
    const keyword = query.keyword?.trim();
    const where: Prisma.AssetInventoryTaskWhereInput = {
      organizationId,
      ...(user.role === UserRole.ADMIN ? (query.ownerId ? { ownerId: query.ownerId } : {}) : { ownerId: user.id }),
      ...(query.status ? { status: query.status } : {}),
      ...(keyword ? { name: { contains: keyword, mode: "insensitive" } } : {}),
    };
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.assetInventoryTask.findMany({
        where,
        include: TASK_INCLUDE,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.assetInventoryTask.count({ where }),
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

  async findById(user: PublicUser, id: string) {
    await this.authorization.assertAllPermissions(user, [PERMISSIONS.ASSET_READ]);
    const organizationId = this.organizationId(user);
    const task = await this.prisma.assetInventoryTask.findFirst({
      where: { id, organizationId },
      include: {
        ...TASK_INCLUDE,
        records: { include: RECORD_INCLUDE, orderBy: { checkedAt: "desc" } },
      },
    });
    if (!task) throw new NotFoundException("盘点任务不存在");
    this.assertTaskAccess(user, task.ownerId);
    const [expectedCount, anomalies] = await this.prisma.$transaction([
      this.prisma.asset.count({ where: this.assetScopeWhere(task) }),
      this.prisma.assetAnomaly.findMany({
        where: {
          organizationId,
          OR: [
            { sourceType: "inventory_task", sourceId: id },
            { sourceType: "inventory_record", sourceId: { in: task.records.map((record) => record.id) } },
          ],
        },
        include: {
          asset: { select: { id: true, assetCode: true, name: true } },
          assignedTo: { select: { id: true, realName: true, username: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    return { ...task, expectedCount, anomalies };
  }

  async create(user: PublicUser, dto: CreateAssetInventoryTaskDto) {
    await this.authorization.assertAllPermissions(user, [PERMISSIONS.ASSET_INVENTORY]);
    const organizationId = this.organizationId(user);
    const plannedStart = new Date(dto.plannedStart);
    const plannedEnd = new Date(dto.plannedEnd);
    if (plannedStart >= plannedEnd) throw new BadRequestException("计划结束时间必须晚于开始时间");
    const scopeValue = await this.validateAndBuildScope(organizationId, dto);
    const owner = await this.prisma.user.findFirst({
      where: { id: dto.ownerId, organizationId, status: UserStatus.ACTIVE, deletedAt: null },
      select: { id: true },
    });
    if (!owner) throw new BadRequestException("盘点负责人不存在、已停用或不属于当前企业");

    return this.prisma.$transaction(async (tx) => {
      const task = await tx.assetInventoryTask.create({
        data: {
          organizationId,
          name: dto.name.trim(),
          scopeType: dto.scopeType,
          scopeValue,
          plannedStart,
          plannedEnd,
          ownerId: dto.ownerId,
          createdById: user.id,
        },
        include: TASK_INCLUDE,
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorId: user.id,
          action: "asset_inventory.created",
          targetType: "asset_inventory_task",
          targetId: task.id,
          afterValue: {
            name: task.name,
            scopeType: task.scopeType,
            scopeValue: scopeValue ?? null,
            ownerId: task.ownerId,
            plannedStart: plannedStart.toISOString(),
            plannedEnd: plannedEnd.toISOString(),
          },
        },
      });
      return task;
    });
  }

  async record(user: PublicUser, taskId: string, dto: RecordAssetInventoryDto) {
    await this.authorization.assertAllPermissions(user, [PERMISSIONS.ASSET_READ]);
    const organizationId = this.organizationId(user);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "asset_inventory_tasks" WHERE "id" = ${taskId} AND "organization_id" = ${organizationId} FOR UPDATE`,
      );
      const task = await tx.assetInventoryTask.findFirst({ where: { id: taskId, organizationId } });
      if (!task) throw new NotFoundException("盘点任务不存在");
      this.assertTaskAccess(user, task.ownerId);
      if (task.status !== AssetInventoryStatus.OPEN) throw new ConflictException("当前盘点任务不能继续登记");

      const asset = await tx.asset.findFirst({
        where: { id: dto.assetId, organizationId, archivedAt: null },
        select: {
          id: true,
          assetCode: true,
          name: true,
          locationId: true,
          ownerUserId: true,
          assetStatus: true,
          departmentId: true,
          businessMatterId: true,
          assetTypeId: true,
        },
      });
      if (!asset) throw new NotFoundException("资产不存在或已退出台账");
      await this.assertObservedReferences(tx, organizationId, dto);

      const exceptionTypes = this.inventoryExceptions(task, asset, dto);
      const result = this.primaryResult(exceptionTypes);
      const record = await tx.assetInventoryRecord.upsert({
        where: { taskId_assetId: { taskId, assetId: asset.id } },
        create: {
          taskId,
          assetId: asset.id,
          checkerId: user.id,
          checkedLocationId: dto.checkedLocationId ?? null,
          checkedAssetStatus: dto.checkedAssetStatus?.trim() || null,
          checkedOwnerId: dto.checkedOwnerId ?? null,
          result,
          exceptionTypes,
          note: dto.note?.trim() || null,
        },
        update: {
          checkerId: user.id,
          checkedAt: new Date(),
          checkedLocationId: dto.checkedLocationId ?? null,
          checkedAssetStatus: dto.checkedAssetStatus?.trim() || null,
          checkedOwnerId: dto.checkedOwnerId ?? null,
          result,
          exceptionTypes,
          note: dto.note?.trim() || null,
        },
        include: RECORD_INCLUDE,
      });

      const existing = await tx.assetAnomaly.findMany({
        where: { sourceType: "inventory_record", sourceId: record.id, status: AssetAnomalyStatus.OPEN },
        select: { type: true },
      });
      if (exceptionTypes.length) {
        await tx.assetAnomaly.updateMany({
          where: {
            sourceType: "inventory_record",
            sourceId: record.id,
            status: AssetAnomalyStatus.OPEN,
            type: { notIn: exceptionTypes as AssetAnomalyType[] },
          },
          data: { status: AssetAnomalyStatus.RESOLVED, closedAt: new Date(), resolution: "复盘结果已恢复正常" },
        });
      } else {
        await tx.assetAnomaly.updateMany({
          where: { sourceType: "inventory_record", sourceId: record.id, status: AssetAnomalyStatus.OPEN },
          data: { status: AssetAnomalyStatus.RESOLVED, closedAt: new Date(), resolution: "复盘结果已恢复正常" },
        });
      }
      const openTypes = new Set(existing.map((item) => item.type));
      const newTypes = exceptionTypes.filter((type) => !openTypes.has(type as AssetAnomalyType));
      if (newTypes.length) {
        await tx.assetAnomaly.createMany({
          data: newTypes.map((type) => ({
            organizationId,
            assetId: asset.id,
            type: type as AssetAnomalyType,
            status: AssetAnomalyStatus.OPEN,
            sourceType: "inventory_record",
            sourceId: record.id,
            description: this.anomalyDescription(type, asset.name, asset.assetCode),
            assignedToId: task.ownerId,
          })),
        });
      }
      await tx.assetEvent.create({
        data: {
          organizationId,
          assetId: asset.id,
          actorId: user.id,
          eventType: "inventory_checked",
          summary: exceptionTypes.length ? `盘点发现 ${exceptionTypes.length} 项差异` : "盘点结果正常",
          metadata: { taskId, recordId: record.id, result, exceptionTypes },
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorId: user.id,
          action: "asset_inventory.recorded",
          targetType: "asset_inventory_record",
          targetId: record.id,
          afterValue: { taskId, assetId: asset.id, result, exceptionTypes },
        },
      });
      return record;
    });
  }

  async complete(user: PublicUser, id: string) {
    await this.authorization.assertAllPermissions(user, [PERMISSIONS.ASSET_INVENTORY]);
    const organizationId = this.organizationId(user);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "asset_inventory_tasks" WHERE "id" = ${id} AND "organization_id" = ${organizationId} FOR UPDATE`,
      );
      const task = await tx.assetInventoryTask.findFirst({ where: { id, organizationId } });
      if (!task) throw new NotFoundException("盘点任务不存在");
      if (task.status === AssetInventoryStatus.COMPLETED) return task;
      if (task.status !== AssetInventoryStatus.OPEN) throw new ConflictException("当前盘点任务不能完成");

      const [assets, records, existingMissing] = await Promise.all([
        tx.asset.findMany({
          where: this.assetScopeWhere(task),
          select: { id: true, assetCode: true, name: true },
        }),
        tx.assetInventoryRecord.findMany({ where: { taskId: id }, select: { assetId: true } }),
        tx.assetAnomaly.findMany({
          where: { sourceType: "inventory_task", sourceId: id, type: AssetAnomalyType.MISSING },
          select: { assetId: true },
        }),
      ]);
      const checkedIds = new Set(records.map((record) => record.assetId));
      const existingIds = new Set(existingMissing.map((anomaly) => anomaly.assetId));
      const missing = assets.filter((asset) => !checkedIds.has(asset.id) && !existingIds.has(asset.id));
      if (missing.length) {
        await tx.assetAnomaly.createMany({
          data: missing.map((asset) => ({
            organizationId,
            assetId: asset.id,
            type: AssetAnomalyType.MISSING,
            status: AssetAnomalyStatus.OPEN,
            sourceType: "inventory_task",
            sourceId: id,
            description: `${asset.name}（${asset.assetCode}）未在本次盘点中确认`,
            assignedToId: task.ownerId,
          })),
        });
        await tx.assetEvent.createMany({
          data: missing.map((asset) => ({
            organizationId,
            assetId: asset.id,
            actorId: user.id,
            eventType: "inventory_missing",
            summary: "资产在盘点任务中未确认",
            metadata: { taskId: id },
          })),
        });
      }
      const completed = await tx.assetInventoryTask.update({
        where: { id },
        data: { status: AssetInventoryStatus.COMPLETED, completedAt: new Date() },
        include: TASK_INCLUDE,
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorId: user.id,
          action: "asset_inventory.completed",
          targetType: "asset_inventory_task",
          targetId: id,
          afterValue: { expectedCount: assets.length, checkedCount: records.length, missingCount: missing.length },
        },
      });
      return completed;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async cancel(user: PublicUser, id: string, dto: CancelAssetInventoryTaskDto) {
    await this.authorization.assertAllPermissions(user, [PERMISSIONS.ASSET_INVENTORY]);
    const organizationId = this.organizationId(user);
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.assetInventoryTask.findFirst({ where: { id, organizationId } });
      if (!current) throw new NotFoundException("盘点任务不存在");
      if (current.status === AssetInventoryStatus.CANCELLED) return current;
      if (current.status !== AssetInventoryStatus.OPEN) throw new ConflictException("已完成的盘点任务不能取消");
      const cancelled = await tx.assetInventoryTask.update({
        where: { id },
        data: { status: AssetInventoryStatus.CANCELLED },
        include: TASK_INCLUDE,
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorId: user.id,
          action: "asset_inventory.cancelled",
          targetType: "asset_inventory_task",
          targetId: id,
          afterValue: { reason: dto.reason?.trim() || null },
        },
      });
      return cancelled;
    });
  }

  private async validateAndBuildScope(organizationId: string, dto: CreateAssetInventoryTaskDto) {
    if (dto.scopeType === AssetInventoryScopeType.ORGANIZATION) return undefined;
    if (dto.scopeType === AssetInventoryScopeType.ASSET_LIST) {
      const assetIds = [...new Set(dto.assetIds ?? [])];
      if (!assetIds.length) throw new BadRequestException("指定资产盘点必须选择至少一项资产");
      const count = await this.prisma.asset.count({ where: { id: { in: assetIds }, organizationId, archivedAt: null } });
      if (count !== assetIds.length) throw new BadRequestException("资产清单中存在无效或已退出的资产");
      return { assetIds } satisfies Prisma.InputJsonObject;
    }
    const scopeId = dto.scopeId?.trim();
    if (!scopeId) throw new BadRequestException("所选盘点范围缺少范围对象");
    let exists: unknown;
    if (dto.scopeType === AssetInventoryScopeType.DEPARTMENT) {
      exists = await this.prisma.department.findFirst({ where: { id: scopeId, deletedAt: null }, select: { id: true } });
    } else if (dto.scopeType === AssetInventoryScopeType.LOCATION) {
      exists = await this.prisma.location.findFirst({ where: { id: scopeId, organizationId, enabled: true }, select: { id: true } });
    } else if (dto.scopeType === AssetInventoryScopeType.PROJECT) {
      exists = await this.prisma.businessMatter.findFirst({ where: { id: scopeId, deletedAt: null }, select: { id: true } });
    } else if (dto.scopeType === AssetInventoryScopeType.ASSET_TYPE) {
      exists = await this.prisma.assetType.findFirst({ where: { id: scopeId, organizationId, enabled: true }, select: { id: true } });
    }
    if (!exists) throw new BadRequestException("所选盘点范围不存在或已停用");
    return { id: scopeId } satisfies Prisma.InputJsonObject;
  }

  private assetScopeWhere(task: InventoryTaskScope): Prisma.AssetWhereInput {
    const scope = this.scopeObject(task.scopeValue);
    const where: Prisma.AssetWhereInput = { organizationId: task.organizationId, archivedAt: null };
    if (task.scopeType === AssetInventoryScopeType.DEPARTMENT) where.departmentId = scope.id as string;
    if (task.scopeType === AssetInventoryScopeType.LOCATION) where.locationId = scope.id as string;
    if (task.scopeType === AssetInventoryScopeType.PROJECT) where.businessMatterId = scope.id as string;
    if (task.scopeType === AssetInventoryScopeType.ASSET_TYPE) where.assetTypeId = scope.id as string;
    if (task.scopeType === AssetInventoryScopeType.ASSET_LIST) where.id = { in: (scope.assetIds as string[]) ?? [] };
    return where;
  }

  private inventoryExceptions(
    task: InventoryTaskScope,
    asset: {
      id: string;
      departmentId: string | null;
      locationId: string | null;
      businessMatterId: string | null;
      assetTypeId: string;
      assetStatus: string;
      ownerUserId: string | null;
    },
    dto: RecordAssetInventoryDto,
  ) {
    const scope = this.scopeObject(task.scopeValue);
    const inScope =
      task.scopeType === AssetInventoryScopeType.ORGANIZATION ||
      (task.scopeType === AssetInventoryScopeType.DEPARTMENT && asset.departmentId === scope.id) ||
      (task.scopeType === AssetInventoryScopeType.LOCATION && asset.locationId === scope.id) ||
      (task.scopeType === AssetInventoryScopeType.PROJECT && asset.businessMatterId === scope.id) ||
      (task.scopeType === AssetInventoryScopeType.ASSET_TYPE && asset.assetTypeId === scope.id) ||
      (task.scopeType === AssetInventoryScopeType.ASSET_LIST && ((scope.assetIds as string[]) ?? []).includes(asset.id));
    if (!inScope) return [AssetInventoryResult.SURPLUS];

    const exceptions: AssetInventoryResult[] = [];
    if (dto.checkedLocationId !== undefined && dto.checkedLocationId !== asset.locationId) {
      exceptions.push(AssetInventoryResult.LOCATION_MISMATCH);
    }
    if (dto.checkedAssetStatus && dto.checkedAssetStatus.trim() !== asset.assetStatus) {
      exceptions.push(AssetInventoryResult.STATUS_MISMATCH);
    }
    if (dto.checkedOwnerId !== undefined && dto.checkedOwnerId !== asset.ownerUserId) {
      exceptions.push(AssetInventoryResult.OWNER_MISMATCH);
    }
    return exceptions;
  }

  private primaryResult(exceptions: AssetInventoryResult[]) {
    return exceptions[0] ?? AssetInventoryResult.NORMAL;
  }

  private async assertObservedReferences(
    tx: Prisma.TransactionClient,
    organizationId: string,
    dto: RecordAssetInventoryDto,
  ) {
    if (dto.checkedLocationId) {
      const location = await tx.location.findFirst({
        where: { id: dto.checkedLocationId, organizationId, enabled: true },
        select: { id: true },
      });
      if (!location) throw new BadRequestException("实盘位置不存在或已停用");
    }
    if (dto.checkedOwnerId) {
      const owner = await tx.user.findFirst({
        where: { id: dto.checkedOwnerId, organizationId, status: UserStatus.ACTIVE, deletedAt: null },
        select: { id: true },
      });
      if (!owner) throw new BadRequestException("实盘责任人不存在、已停用或不属于当前企业");
    }
  }

  private anomalyDescription(type: AssetInventoryResult, name: string, assetCode: string) {
    const label: Record<AssetInventoryResult, string> = {
      NORMAL: "盘点正常",
      SURPLUS: "不在本次盘点范围内",
      MISSING: "未盘点到",
      LOCATION_MISMATCH: "实盘位置与台账不一致",
      STATUS_MISMATCH: "实盘状态与台账不一致",
      OWNER_MISMATCH: "实盘责任人与台账不一致",
    };
    return `${name}（${assetCode}）：${label[type]}`;
  }

  private scopeObject(value: Prisma.JsonValue | null) {
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Prisma.JsonObject
      : {};
  }

  private assertTaskAccess(user: PublicUser, ownerId: string) {
    if (user.role !== UserRole.ADMIN && ownerId !== user.id) {
      throw new ForbiddenException("只能查看和登记分配给自己的盘点任务");
    }
  }

  private organizationId(user: PublicUser) {
    if (!user.organizationId) throw new ForbiddenException("当前账号尚未绑定企业");
    return user.organizationId;
  }
}
