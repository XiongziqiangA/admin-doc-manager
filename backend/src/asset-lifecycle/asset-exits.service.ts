import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  ApprovalActionType,
  ApprovalBusinessType,
  ApprovalStatus,
  AssetExitStatus,
  Prisma,
  UserRole,
} from "@prisma/client";
import { randomUUID } from "node:crypto";

import { AuthorizationService } from "../authorization/authorization.service";
import { PERMISSIONS } from "../authorization/permissions";
import { PrismaService } from "../prisma/prisma.service";
import { PublicUser } from "../users/user.presenter";
import { assetStatusForExit } from "./asset-exit-status";
import { CancelAssetExitDto } from "./dto/cancel-asset-exit.dto";
import { CreateAssetExitDto } from "./dto/create-asset-exit.dto";
import { ListAssetExitsDto } from "./dto/list-asset-exits.dto";

const EXIT_INCLUDE = {
  asset: {
    select: {
      id: true,
      assetCode: true,
      name: true,
      assetStatus: true,
      resourceStatus: true,
      version: true,
      archivedAt: true,
    },
  },
  applicant: { select: { id: true, realName: true, username: true } },
  approval: { select: { id: true, status: true, comment: true, completedAt: true } },
} satisfies Prisma.AssetExitRequestInclude;

@Injectable()
export class AssetExitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  async list(user: PublicUser, query: ListAssetExitsDto) {
    await this.authorization.assertAllPermissions(user, [PERMISSIONS.ASSET_READ]);
    const organizationId = this.organizationId(user);
    const where: Prisma.AssetExitRequestWhereInput = {
      organizationId,
      ...(user.role === UserRole.ADMIN ? {} : { applicantId: user.id }),
      ...(query.status ? { status: query.status } : {}),
      ...(query.exitType ? { exitType: query.exitType } : {}),
      ...(query.assetId ? { assetId: query.assetId } : {}),
    };
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.assetExitRequest.findMany({
        where,
        include: EXIT_INCLUDE,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.assetExitRequest.count({ where }),
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

  async create(user: PublicUser, dto: CreateAssetExitDto) {
    await this.authorization.assertAllPermissions(user, [PERMISSIONS.ASSET_READ]);
    const organizationId = this.organizationId(user);
    return this.prisma.$transaction(async (tx) => {
      await this.lockAsset(tx, dto.assetId, organizationId);
      const asset = await tx.asset.findFirst({ where: { id: dto.assetId, organizationId, archivedAt: null } });
      if (!asset) throw new NotFoundException("资产不存在或已退出台账");
      if (asset.assetStatus !== "active" || !["available", "reserved"].includes(asset.resourceStatus)) {
        throw new ConflictException("资产当前处于借用、维修、调拨或其他不可退出状态");
      }
      const existing = await tx.assetExitRequest.findFirst({
        where: { assetId: asset.id, status: AssetExitStatus.PENDING },
        select: { id: true },
      });
      if (existing) throw new ConflictException("该资产已有待处理的退出申请");

      const requestId = randomUUID();
      const approvalId = randomUUID();
      const autoApproved = user.role === UserRole.ADMIN;
      const completedAt = autoApproved ? new Date() : null;
      await tx.approval.create({
        data: {
          id: approvalId,
          organizationId,
          businessType: ApprovalBusinessType.ASSET_EXIT,
          businessId: requestId,
          applicantId: user.id,
          status: autoApproved ? ApprovalStatus.APPROVED : ApprovalStatus.PENDING,
          completedAt,
        },
      });
      await tx.approvalAction.create({
        data: { approvalId, actorId: user.id, action: ApprovalActionType.SUBMIT, comment: dto.reason.trim() },
      });
      if (autoApproved) {
        await tx.approvalAction.create({
          data: { approvalId, actorId: user.id, action: ApprovalActionType.APPROVE, comment: "管理员直接办理资产退出" },
        });
      }
      const request = await tx.assetExitRequest.create({
        data: {
          id: requestId,
          organizationId,
          assetId: asset.id,
          applicantId: user.id,
          approvalId,
          exitType: dto.exitType,
          reason: dto.reason.trim(),
          status: autoApproved ? AssetExitStatus.APPROVED : AssetExitStatus.PENDING,
          resourceStatusBefore: asset.resourceStatus,
          completedAt,
        },
        include: EXIT_INCLUDE,
      });
      const assetUpdate = autoApproved
        ? {
            assetStatus: assetStatusForExit(dto.exitType),
            resourceStatus: "retired",
            archivedAt: completedAt,
            usingUserId: null,
            version: { increment: 1 as const },
          }
        : { resourceStatus: "exit_pending", version: { increment: 1 as const } };
      const updated = await tx.asset.updateMany({
        where: { id: asset.id, organizationId, version: asset.version, resourceStatus: asset.resourceStatus },
        data: assetUpdate,
      });
      if (!updated.count) throw new ConflictException("资产状态已变化，请刷新后重试");
      await this.writeActivity(
        tx,
        organizationId,
        asset.id,
        user.id,
        requestId,
        autoApproved ? "asset_exit.approved" : "asset_exit.requested",
        autoApproved ? "asset_exited" : "asset_exit_requested",
        autoApproved ? "资产已退出并转入历史档案" : "已提交资产退出申请",
        { exitType: dto.exitType, reason: dto.reason.trim(), approvalId },
      );
      return request;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async cancel(user: PublicUser, id: string, dto: CancelAssetExitDto) {
    await this.authorization.assertAllPermissions(user, [PERMISSIONS.ASSET_READ]);
    const organizationId = this.organizationId(user);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT e."id" FROM "asset_exit_requests" e JOIN "assets" a ON a."id" = e."asset_id" WHERE e."id" = ${id} AND e."organization_id" = ${organizationId} FOR UPDATE OF e, a`,
      );
      const current = await tx.assetExitRequest.findFirst({ where: { id, organizationId }, include: EXIT_INCLUDE });
      if (!current) throw new NotFoundException("资产退出申请不存在");
      if (user.role !== UserRole.ADMIN && current.applicantId !== user.id) {
        throw new ForbiddenException("只能取消自己的资产退出申请");
      }
      if (current.status === AssetExitStatus.CANCELLED) return current;
      if (current.status !== AssetExitStatus.PENDING) throw new ConflictException("已处理的资产退出申请不能取消");
      const restored = await tx.asset.updateMany({
        where: {
          id: current.assetId,
          organizationId,
          version: current.asset.version,
          resourceStatus: "exit_pending",
        },
        data: { resourceStatus: current.resourceStatusBefore || "available", version: { increment: 1 } },
      });
      if (!restored.count) throw new ConflictException("资产状态已变化，请刷新后重试");
      const cancelled = await tx.assetExitRequest.update({
        where: { id },
        data: { status: AssetExitStatus.CANCELLED, completedAt: new Date() },
        include: EXIT_INCLUDE,
      });
      if (current.approvalId) {
        await tx.approval.updateMany({
          where: { id: current.approvalId, status: ApprovalStatus.PENDING },
          data: { status: ApprovalStatus.CANCELLED, completedAt: new Date(), comment: dto.reason?.trim() || null },
        });
        await tx.approvalAction.create({
          data: { approvalId: current.approvalId, actorId: user.id, action: ApprovalActionType.CANCEL, comment: dto.reason?.trim() || null },
        });
      }
      await this.writeActivity(tx, organizationId, current.assetId, user.id, id, "asset_exit.cancelled", "asset_exit_cancelled", "资产退出申请已取消", {
        reason: dto.reason?.trim() || null,
        restoredResourceStatus: current.resourceStatusBefore || "available",
      });
      return cancelled;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
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
    await tx.auditLog.create({ data: { organizationId, actorId, action, targetType: "asset_exit", targetId, afterValue: metadata } });
  }

  private organizationId(user: PublicUser) {
    if (!user.organizationId) throw new ForbiddenException("当前账号尚未绑定企业");
    return user.organizationId;
  }
}
