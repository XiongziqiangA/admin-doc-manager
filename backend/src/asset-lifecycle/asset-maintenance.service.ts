import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AssetMaintenanceStatus, Prisma } from "@prisma/client";

import { AuthorizationService } from "../authorization/authorization.service";
import { PERMISSIONS } from "../authorization/permissions";
import { PrismaService } from "../prisma/prisma.service";
import { PublicUser } from "../users/user.presenter";
import { CancelAssetMaintenanceDto } from "./dto/cancel-asset-maintenance.dto";
import { CompleteAssetMaintenanceDto } from "./dto/complete-asset-maintenance.dto";
import { CreateAssetMaintenanceDto } from "./dto/create-asset-maintenance.dto";
import { ListAssetMaintenanceDto } from "./dto/list-asset-maintenance.dto";

const MAINTENANCE_INCLUDE = {
  asset: {
    select: {
      id: true,
      assetCode: true,
      name: true,
      assetStatus: true,
      resourceStatus: true,
      version: true,
    },
  },
  createdBy: { select: { id: true, realName: true, username: true } },
} satisfies Prisma.AssetMaintenanceRecordInclude;

const OPEN_MAINTENANCE_STATUSES = [
  AssetMaintenanceStatus.SCHEDULED,
  AssetMaintenanceStatus.IN_PROGRESS,
];

@Injectable()
export class AssetMaintenanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  async list(user: PublicUser, query: ListAssetMaintenanceDto) {
    await this.authorization.assertAllPermissions(user, [PERMISSIONS.ASSET_READ]);
    const organizationId = this.organizationId(user);
    const where: Prisma.AssetMaintenanceRecordWhereInput = {
      organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.maintenanceType ? { maintenanceType: query.maintenanceType } : {}),
      ...(query.assetId ? { assetId: query.assetId } : {}),
    };
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.assetMaintenanceRecord.findMany({
        where,
        include: MAINTENANCE_INCLUDE,
        orderBy: [{ status: "asc" }, { plannedAt: "asc" }, { createdAt: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.assetMaintenanceRecord.count({ where }),
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

  async create(user: PublicUser, dto: CreateAssetMaintenanceDto) {
    await this.authorization.assertAllPermissions(user, [PERMISSIONS.ASSET_MAINTENANCE]);
    const organizationId = this.organizationId(user);
    return this.prisma.$transaction(async (tx) => {
      await this.lockAsset(tx, dto.assetId, organizationId);
      const asset = await tx.asset.findFirst({ where: { id: dto.assetId, organizationId, archivedAt: null } });
      if (!asset) throw new NotFoundException("资产不存在或已退出台账");
      if (asset.assetStatus !== "active") throw new ConflictException("只有在用资产可以登记维修保养");
      const active = await tx.assetMaintenanceRecord.findFirst({
        where: { assetId: asset.id, status: { in: OPEN_MAINTENANCE_STATUSES } },
        select: { id: true },
      });
      if (active) throw new ConflictException("该资产已有未结束的维修保养记录");

      const record = await tx.assetMaintenanceRecord.create({
        data: {
          organizationId,
          assetId: asset.id,
          maintenanceType: dto.maintenanceType,
          title: dto.title.trim(),
          description: dto.description?.trim() || null,
          vendor: dto.vendor?.trim() || null,
          plannedAt: dto.plannedAt ? new Date(dto.plannedAt) : null,
          cost: dto.cost,
          status: AssetMaintenanceStatus.SCHEDULED,
          createdById: user.id,
        },
        include: MAINTENANCE_INCLUDE,
      });
      await this.writeActivity(tx, organizationId, asset.id, user.id, record.id, "asset_maintenance.created", "maintenance_scheduled", "已登记维修保养计划", {
        maintenanceType: dto.maintenanceType,
        title: record.title,
        plannedAt: dto.plannedAt ?? null,
        cost: dto.cost ?? null,
      });
      return record;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async start(user: PublicUser, id: string) {
    await this.authorization.assertAllPermissions(user, [PERMISSIONS.ASSET_MAINTENANCE]);
    const organizationId = this.organizationId(user);
    return this.prisma.$transaction(async (tx) => {
      const current = await this.lockAndLoad(tx, id, organizationId);
      if (current.status === AssetMaintenanceStatus.IN_PROGRESS) return current;
      if (current.status !== AssetMaintenanceStatus.SCHEDULED) throw new ConflictException("当前维修保养记录不能开始");
      if (current.asset.assetStatus !== "active" || !["available", "reserved"].includes(current.asset.resourceStatus)) {
        throw new ConflictException("资产当前处于借用、调拨或其他不可维修状态");
      }
      const updatedAsset = await tx.asset.updateMany({
        where: {
          id: current.assetId,
          organizationId,
          version: current.asset.version,
          resourceStatus: current.asset.resourceStatus,
        },
        data: { resourceStatus: "maintenance", version: { increment: 1 } },
      });
      if (!updatedAsset.count) throw new ConflictException("资产状态已变化，请刷新后重试");
      const started = await tx.assetMaintenanceRecord.update({
        where: { id },
        data: {
          status: AssetMaintenanceStatus.IN_PROGRESS,
          startedAt: new Date(),
          resourceStatusBefore: current.asset.resourceStatus,
        },
        include: MAINTENANCE_INCLUDE,
      });
      await this.writeActivity(tx, organizationId, current.assetId, user.id, id, "asset_maintenance.started", "maintenance_started", "资产已开始维修保养", {
        resourceStatusBefore: current.asset.resourceStatus,
      });
      return started;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async complete(user: PublicUser, id: string, dto: CompleteAssetMaintenanceDto) {
    await this.authorization.assertAllPermissions(user, [PERMISSIONS.ASSET_MAINTENANCE]);
    const organizationId = this.organizationId(user);
    return this.prisma.$transaction(async (tx) => {
      const current = await this.lockAndLoad(tx, id, organizationId);
      if (current.status === AssetMaintenanceStatus.COMPLETED) return current;
      if (current.status !== AssetMaintenanceStatus.IN_PROGRESS) throw new ConflictException("只有进行中的维修保养可以完成");
      const restoreStatus = current.resourceStatusBefore || "available";
      await this.restoreAsset(tx, current, organizationId, restoreStatus);
      const completed = await tx.assetMaintenanceRecord.update({
        where: { id },
        data: {
          status: AssetMaintenanceStatus.COMPLETED,
          completedAt: new Date(),
          cost: dto.cost,
          description: dto.description?.trim() || undefined,
        },
        include: MAINTENANCE_INCLUDE,
      });
      await this.writeActivity(tx, organizationId, current.assetId, user.id, id, "asset_maintenance.completed", "maintenance_completed", "资产维修保养已完成", {
        resourceStatus: restoreStatus,
        cost: dto.cost ?? null,
      });
      return completed;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async cancel(user: PublicUser, id: string, dto: CancelAssetMaintenanceDto) {
    await this.authorization.assertAllPermissions(user, [PERMISSIONS.ASSET_MAINTENANCE]);
    const organizationId = this.organizationId(user);
    return this.prisma.$transaction(async (tx) => {
      const current = await this.lockAndLoad(tx, id, organizationId);
      if (current.status === AssetMaintenanceStatus.CANCELLED) return current;
      if (current.status === AssetMaintenanceStatus.COMPLETED) throw new ConflictException("已完成的维修保养不能取消");
      if (current.status === AssetMaintenanceStatus.IN_PROGRESS) {
        await this.restoreAsset(tx, current, organizationId, current.resourceStatusBefore || "available");
      }
      const cancelled = await tx.assetMaintenanceRecord.update({
        where: { id },
        data: { status: AssetMaintenanceStatus.CANCELLED },
        include: MAINTENANCE_INCLUDE,
      });
      await this.writeActivity(tx, organizationId, current.assetId, user.id, id, "asset_maintenance.cancelled", "maintenance_cancelled", "资产维修保养已取消", {
        reason: dto.reason?.trim() || null,
      });
      return cancelled;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private async restoreAsset(
    tx: Prisma.TransactionClient,
    current: Prisma.AssetMaintenanceRecordGetPayload<{ include: typeof MAINTENANCE_INCLUDE }>,
    organizationId: string,
    resourceStatus: string,
  ) {
    const updated = await tx.asset.updateMany({
      where: {
        id: current.assetId,
        organizationId,
        version: current.asset.version,
        resourceStatus: "maintenance",
      },
      data: { resourceStatus, version: { increment: 1 } },
    });
    if (!updated.count) throw new ConflictException("资产状态已变化，请刷新后重试");
  }

  private async lockAndLoad(tx: Prisma.TransactionClient, id: string, organizationId: string) {
    await tx.$queryRaw(
      Prisma.sql`SELECT m."id" FROM "asset_maintenance_records" m JOIN "assets" a ON a."id" = m."asset_id" WHERE m."id" = ${id} AND m."organization_id" = ${organizationId} FOR UPDATE OF m, a`,
    );
    const current = await tx.assetMaintenanceRecord.findFirst({
      where: { id, organizationId },
      include: MAINTENANCE_INCLUDE,
    });
    if (!current) throw new NotFoundException("维修保养记录不存在");
    return current;
  }

  private lockAsset(tx: Prisma.TransactionClient, assetId: string, organizationId: string) {
    return tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "assets" WHERE "id" = ${assetId} AND "organization_id" = ${organizationId} FOR UPDATE`,
    );
  }

  private async writeActivity(
    tx: Prisma.TransactionClient,
    organizationId: string,
    assetId: string,
    actorId: string,
    targetId: string,
    action: string,
    eventType: string,
    summary: string,
    metadata: Prisma.InputJsonValue,
  ) {
    await tx.assetEvent.create({ data: { organizationId, assetId, actorId, eventType, summary, metadata } });
    await tx.auditLog.create({
      data: { organizationId, actorId, action, targetType: "asset_maintenance", targetId, afterValue: metadata },
    });
  }

  private organizationId(user: PublicUser) {
    if (!user.organizationId) throw new ForbiddenException("当前账号尚未绑定企业");
    return user.organizationId;
  }
}
