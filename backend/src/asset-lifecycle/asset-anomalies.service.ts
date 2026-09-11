import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AssetAnomalySeverity, AssetAnomalyStatus, Prisma, UserRole, UserStatus } from "@prisma/client";

import { AuthorizationService } from "../authorization/authorization.service";
import { PERMISSIONS } from "../authorization/permissions";
import { PrismaService } from "../prisma/prisma.service";
import { PublicUser } from "../users/user.presenter";
import { AssignAssetAnomalyDto } from "./dto/assign-asset-anomaly.dto";
import { CreateAssetAnomalyDto } from "./dto/create-asset-anomaly.dto";
import { ListAssetAnomaliesDto } from "./dto/list-asset-anomalies.dto";
import { ResolveAssetAnomalyDto } from "./dto/resolve-asset-anomaly.dto";

const ANOMALY_INCLUDE = {
  asset: { select: { id: true, assetCode: true, name: true, assetStatus: true, resourceStatus: true } },
  assignedTo: { select: { id: true, realName: true, username: true } },
} satisfies Prisma.AssetAnomalyInclude;

@Injectable()
export class AssetAnomaliesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  async list(user: PublicUser, query: ListAssetAnomaliesDto) {
    await this.authorization.assertAllPermissions(user, [PERMISSIONS.ASSET_READ]);
    const organizationId = this.organizationId(user);
    const where: Prisma.AssetAnomalyWhereInput = {
      organizationId,
      ...(user.role === UserRole.ADMIN
        ? (query.assignedToId ? { assignedToId: query.assignedToId } : {})
        : { assignedToId: user.id }),
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.severity ? { severity: query.severity } : {}),
      ...(query.assetId ? { assetId: query.assetId } : {}),
    };
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.assetAnomaly.findMany({
        where,
        include: ANOMALY_INCLUDE,
        orderBy: [{ status: "asc" }, { severity: "desc" }, { createdAt: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.assetAnomaly.count({ where }),
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

  async create(user: PublicUser, dto: CreateAssetAnomalyDto) {
    await this.authorization.assertAllPermissions(user, [PERMISSIONS.ASSET_READ]);
    const organizationId = this.organizationId(user);
    const asset = await this.prisma.asset.findFirst({
      where: { id: dto.assetId, organizationId, archivedAt: null },
      select: { id: true, assetCode: true, name: true },
    });
    if (!asset) throw new NotFoundException("资产不存在或已退出台账");
    const assignedToId = user.role === UserRole.ADMIN ? dto.assignedToId ?? null : user.id;
    if (assignedToId) await this.assertActiveUser(organizationId, assignedToId);

    return this.prisma.$transaction(async (tx) => {
      const anomaly = await tx.assetAnomaly.create({
        data: {
          organizationId,
          assetId: asset.id,
          type: dto.type,
          severity: dto.severity ?? AssetAnomalySeverity.MEDIUM,
          status: AssetAnomalyStatus.OPEN,
          sourceType: "manual_report",
          description: dto.description.trim(),
          assignedToId,
        },
        include: ANOMALY_INCLUDE,
      });
      await this.writeActivity(tx, organizationId, asset.id, user.id, anomaly.id, "asset_anomaly.reported", "anomaly_reported", "已登记资产异常", {
        type: anomaly.type,
        severity: anomaly.severity,
        assignedToId,
        description: anomaly.description,
      });
      return anomaly;
    });
  }

  async assign(user: PublicUser, id: string, dto: AssignAssetAnomalyDto) {
    await this.authorization.assertAllPermissions(user, [PERMISSIONS.ASSET_MAINTENANCE]);
    const organizationId = this.organizationId(user);
    const current = await this.prisma.assetAnomaly.findFirst({ where: { id, organizationId } });
    if (!current) throw new NotFoundException("资产异常不存在");
    if (dto.assignedToId) await this.assertActiveUser(organizationId, dto.assignedToId);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.assetAnomaly.update({
        where: { id },
        data: { assignedToId: dto.assignedToId ?? null },
        include: ANOMALY_INCLUDE,
      });
      await this.writeActivity(tx, organizationId, current.assetId, user.id, id, "asset_anomaly.assigned", "anomaly_assigned", dto.assignedToId ? "资产异常已改派" : "资产异常已取消指派", {
        beforeAssignedToId: current.assignedToId,
        assignedToId: dto.assignedToId ?? null,
      });
      return updated;
    });
  }

  async resolve(user: PublicUser, id: string, dto: ResolveAssetAnomalyDto) {
    await this.authorization.assertAllPermissions(user, [PERMISSIONS.ASSET_READ]);
    const organizationId = this.organizationId(user);
    const current = await this.prisma.assetAnomaly.findFirst({ where: { id, organizationId } });
    if (!current) throw new NotFoundException("资产异常不存在");
    if (user.role !== UserRole.ADMIN && current.assignedToId !== user.id) {
      throw new ForbiddenException("只能处理分配给自己的资产异常");
    }
    if (current.status === AssetAnomalyStatus.RESOLVED) return current;

    return this.prisma.$transaction(async (tx) => {
      const resolution = dto.resolution.trim();
      const resolved = await tx.assetAnomaly.update({
        where: { id },
        data: { status: AssetAnomalyStatus.RESOLVED, resolution, closedAt: new Date() },
        include: ANOMALY_INCLUDE,
      });
      await this.writeActivity(tx, organizationId, current.assetId, user.id, id, "asset_anomaly.resolved", "anomaly_resolved", "资产异常已处理", {
        type: current.type,
        resolution,
      });
      return resolved;
    });
  }

  private async assertActiveUser(organizationId: string, userId: string) {
    const assignee = await this.prisma.user.findFirst({
      where: { id: userId, organizationId, status: UserStatus.ACTIVE, deletedAt: null },
      select: { id: true },
    });
    if (!assignee) throw new BadRequestException("异常负责人不存在、已停用或不属于当前企业");
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
      data: { organizationId, actorId, action, targetType: "asset_anomaly", targetId, afterValue: metadata },
    });
  }

  private organizationId(user: PublicUser) {
    if (!user.organizationId) throw new ForbiddenException("当前账号尚未绑定企业");
    return user.organizationId;
  }
}
