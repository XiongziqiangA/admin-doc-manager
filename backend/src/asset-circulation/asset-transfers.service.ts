import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  ApprovalActionType,
  ApprovalBusinessType,
  ApprovalStatus,
  AssetHandoverStatus,
  AssetHandoverType,
  AssetReservationStatus,
  AssetTransferStatus,
  Prisma,
  UserStatus,
} from "@prisma/client";
import { randomUUID } from "node:crypto";

import { AuthorizationService } from "../authorization/authorization.service";
import { PERMISSIONS } from "../authorization/permissions";
import { IdempotencyService } from "../common/idempotency.service";
import { PrismaService } from "../prisma/prisma.service";
import { PublicUser } from "../users/user.presenter";
import { AssetHandoverDto } from "./dto/asset-handover.dto";
import { CreateAssetTransferDto } from "./dto/create-asset-transfer.dto";
import { ListAssetTransfersDto } from "./dto/list-asset-transfers.dto";

const TRANSFER_INCLUDE = {
  asset: { select: { id: true, assetCode: true, name: true, version: true, assetStatus: true, resourceStatus: true } },
  fromDepartment: { select: { id: true, name: true } },
  toDepartment: { select: { id: true, name: true } },
  fromLocation: { select: { id: true, name: true } },
  toLocation: { select: { id: true, name: true } },
  fromOwner: { select: { id: true, realName: true, username: true } },
  toOwner: { select: { id: true, realName: true, username: true } },
  createdBy: { select: { id: true, realName: true, username: true } },
  approval: { select: { id: true, status: true, comment: true, completedAt: true } },
  handovers: { orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.AssetTransferInclude;

const COMPLETABLE_TRANSFER_STATUSES: AssetTransferStatus[] = [AssetTransferStatus.APPROVED, AssetTransferStatus.IN_TRANSIT];
const CANCELLABLE_TRANSFER_STATUSES: AssetTransferStatus[] = [AssetTransferStatus.PENDING, AssetTransferStatus.APPROVED];

@Injectable()
export class AssetTransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly idempotency: IdempotencyService,
  ) {}

  async list(user: PublicUser, query: ListAssetTransfersDto) {
    await this.authorization.assertAllPermissions(user, [PERMISSIONS.ASSET_TRANSFER]);
    const organizationId = this.organizationId(user);
    const where: Prisma.AssetTransferWhereInput = {
      organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.assetId ? { assetId: query.assetId } : {}),
    };
    const skip = (query.page - 1) * query.pageSize;
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.assetTransfer.findMany({
        where,
        include: TRANSFER_INCLUDE,
        orderBy: { createdAt: "desc" },
        skip,
        take: query.pageSize,
      }),
      this.prisma.assetTransfer.count({ where }),
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

  async create(user: PublicUser, idempotencyKey: string | undefined, dto: CreateAssetTransferDto) {
    await this.authorization.assertAllPermissions(user, [PERMISSIONS.ASSET_TRANSFER]);
    const organizationId = this.organizationId(user);
    const payload = {
      assetId: dto.assetId,
      toDepartmentId: dto.toDepartmentId,
      toLocationId: dto.toLocationId,
      toOwnerId: dto.toOwnerId,
      reason: dto.reason.trim(),
    };
    return this.idempotency.execute(user, "asset-transfer.create", idempotencyKey, payload, async (tx) => {
      await this.lockAsset(tx, dto.assetId, organizationId);
      const asset = await tx.asset.findFirst({ where: { id: dto.assetId, organizationId, archivedAt: null } });
      if (!asset) throw new NotFoundException("资产不存在");
      if (asset.assetStatus !== "active" || ["borrowed", "return_pending", "transferring", "unavailable", "maintenance"].includes(asset.resourceStatus)) {
        throw new ConflictException("资产当前不可调拨");
      }
      const toDepartmentId = dto.toDepartmentId === undefined ? asset.departmentId : dto.toDepartmentId;
      const toLocationId = dto.toLocationId === undefined ? asset.locationId : dto.toLocationId;
      const toOwnerId = dto.toOwnerId === undefined ? asset.ownerUserId : dto.toOwnerId;
      if (toDepartmentId === asset.departmentId && toLocationId === asset.locationId && toOwnerId === asset.ownerUserId) {
        throw new BadRequestException("调拨后部门、位置或责任人至少需要变更一项");
      }
      await this.assertDestinations(tx, organizationId, toDepartmentId, toLocationId, toOwnerId);

      const transferId = randomUUID();
      const approvalId = randomUUID();
      await tx.approval.create({
        data: {
          id: approvalId,
          organizationId,
          businessType: ApprovalBusinessType.ASSET_TRANSFER,
          businessId: transferId,
          applicantId: user.id,
          status: ApprovalStatus.APPROVED,
          completedAt: new Date(),
        },
      });
      await tx.approvalAction.create({
        data: { approvalId, actorId: user.id, action: ApprovalActionType.SUBMIT, comment: payload.reason },
      });
      await tx.approvalAction.create({
        data: { approvalId, actorId: user.id, action: ApprovalActionType.APPROVE, comment: "管理员发起调拨" },
      });
      const transfer = await tx.assetTransfer.create({
        data: {
          id: transferId,
          organizationId,
          assetId: asset.id,
          approvalId,
          fromDepartmentId: asset.departmentId,
          toDepartmentId,
          fromLocationId: asset.locationId,
          toLocationId,
          fromOwnerId: asset.ownerUserId,
          toOwnerId,
          reason: payload.reason,
          status: AssetTransferStatus.APPROVED,
          createdById: user.id,
        },
        include: TRANSFER_INCLUDE,
      });
      const updated = await tx.asset.updateMany({
        where: { id: asset.id, organizationId, version: asset.version, resourceStatus: { in: ["available", "reserved"] } },
        data: { resourceStatus: "transferring", version: { increment: 1 } },
      });
      if (!updated.count) throw new ConflictException("资产状态已变化，请刷新后重试");
      await this.writeActivity(tx, organizationId, asset.id, user.id, "transfer_created", "资产调拨已登记，等待交接", transferId, "asset_transfer.created", {
        fromDepartmentId: asset.departmentId,
        fromLocationId: asset.locationId,
        fromOwnerId: asset.ownerUserId,
        toDepartmentId,
        toLocationId,
        toOwnerId,
        reason: payload.reason,
      });
      return transfer;
    });
  }

  async complete(user: PublicUser, id: string, dto: AssetHandoverDto) {
    await this.authorization.assertAllPermissions(user, [PERMISSIONS.ASSET_TRANSFER]);
    const organizationId = this.organizationId(user);
    return this.prisma.$transaction(async (tx) => {
      const transfer = await this.lockAndLoad(tx, id, organizationId);
      if (transfer.status === AssetTransferStatus.COMPLETED) return transfer;
      if (!COMPLETABLE_TRANSFER_STATUSES.includes(transfer.status)) {
        throw new ConflictException("当前调拨状态不能完成交接");
      }
      const reservations = await tx.assetReservation.count({
        where: { assetId: transfer.assetId, status: { in: [AssetReservationStatus.APPROVED, AssetReservationStatus.ACTIVE] } },
      });
      const nextResourceStatus = reservations ? "reserved" : "available";
      const assetUpdated = await tx.asset.updateMany({
        where: { id: transfer.assetId, organizationId, version: transfer.asset.version, resourceStatus: "transferring" },
        data: {
          departmentId: transfer.toDepartmentId,
          locationId: transfer.toLocationId,
          ownerUserId: transfer.toOwnerId,
          resourceStatus: nextResourceStatus,
          version: { increment: 1 },
        },
      });
      if (!assetUpdated.count) throw new ConflictException("资产状态已变化，请刷新后重试");
      const completed = await tx.assetTransfer.update({
        where: { id },
        data: { status: AssetTransferStatus.COMPLETED, completedAt: new Date() },
        include: TRANSFER_INCLUDE,
      });
      await tx.assetHandoverRecord.create({
        data: {
          assetId: transfer.assetId,
          transferId: id,
          fromUserId: transfer.fromOwnerId,
          toUserId: transfer.toOwnerId,
          handoverType: AssetHandoverType.TRANSFER,
          itemsSnapshot: dto.items,
          note: dto.note?.trim() || null,
          status: AssetHandoverStatus.CONFIRMED,
          createdById: user.id,
          confirmedAt: new Date(),
        },
      });
      await this.writeActivity(tx, organizationId, transfer.assetId, user.id, "transfer_completed", "资产调拨交接已完成", id, "asset_transfer.completed", {
        toDepartmentId: transfer.toDepartmentId,
        toLocationId: transfer.toLocationId,
        toOwnerId: transfer.toOwnerId,
        items: dto.items,
        note: dto.note?.trim() || null,
      });
      return completed;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async cancel(user: PublicUser, id: string) {
    await this.authorization.assertAllPermissions(user, [PERMISSIONS.ASSET_TRANSFER]);
    const organizationId = this.organizationId(user);
    return this.prisma.$transaction(async (tx) => {
      const transfer = await this.lockAndLoad(tx, id, organizationId);
      if (transfer.status === AssetTransferStatus.CANCELLED) return transfer;
      if (!CANCELLABLE_TRANSFER_STATUSES.includes(transfer.status)) {
        throw new ConflictException("当前调拨状态不能取消");
      }
      const reservations = await tx.assetReservation.count({
        where: { assetId: transfer.assetId, status: { in: [AssetReservationStatus.APPROVED, AssetReservationStatus.ACTIVE] } },
      });
      await tx.asset.updateMany({
        where: { id: transfer.assetId, organizationId, resourceStatus: "transferring" },
        data: { resourceStatus: reservations ? "reserved" : "available", version: { increment: 1 } },
      });
      const cancelled = await tx.assetTransfer.update({
        where: { id },
        data: { status: AssetTransferStatus.CANCELLED },
        include: TRANSFER_INCLUDE,
      });
      if (transfer.approvalId) {
        await tx.approval.updateMany({
          where: { id: transfer.approvalId, status: ApprovalStatus.PENDING },
          data: { status: ApprovalStatus.CANCELLED, completedAt: new Date() },
        });
        await tx.approvalAction.create({
          data: { approvalId: transfer.approvalId, actorId: user.id, action: ApprovalActionType.CANCEL, comment: "取消调拨" },
        });
      }
      await this.writeActivity(tx, organizationId, transfer.assetId, user.id, "transfer_cancelled", "资产调拨已取消", id, "asset_transfer.cancelled", {});
      return cancelled;
    });
  }

  private async assertDestinations(
    tx: Prisma.TransactionClient,
    organizationId: string,
    departmentId: string | null,
    locationId: string | null,
    ownerId: string | null,
  ) {
    if (departmentId) {
      const department = await tx.department.findFirst({ where: { id: departmentId, deletedAt: null } });
      if (!department) throw new BadRequestException("目标部门不存在");
    }
    if (locationId) {
      const location = await tx.location.findFirst({ where: { id: locationId, organizationId, enabled: true } });
      if (!location) throw new BadRequestException("目标位置不存在或已停用");
    }
    if (ownerId) {
      const owner = await tx.user.findFirst({ where: { id: ownerId, organizationId, status: UserStatus.ACTIVE, deletedAt: null } });
      if (!owner) throw new BadRequestException("目标责任人不存在、已停用或不属于当前企业");
    }
  }

  private lockAsset(tx: Prisma.TransactionClient, assetId: string, organizationId: string) {
    return tx.$queryRaw(Prisma.sql`SELECT "id" FROM "assets" WHERE "id" = ${assetId} AND "organization_id" = ${organizationId} FOR UPDATE`);
  }

  private async lockAndLoad(tx: Prisma.TransactionClient, id: string, organizationId: string) {
    await tx.$queryRaw(Prisma.sql`SELECT t."id" FROM "asset_transfers" t JOIN "assets" a ON a."id" = t."asset_id" WHERE t."id" = ${id} AND t."organization_id" = ${organizationId} FOR UPDATE OF t, a`);
    const transfer = await tx.assetTransfer.findFirst({ where: { id, organizationId }, include: TRANSFER_INCLUDE });
    if (!transfer) throw new NotFoundException("调拨记录不存在");
    return transfer;
  }

  private async writeActivity(
    tx: Prisma.TransactionClient,
    organizationId: string,
    assetId: string,
    actorId: string,
    eventType: string,
    summary: string,
    targetId: string,
    action: string,
    metadata: Prisma.InputJsonValue,
  ) {
    await tx.assetEvent.create({ data: { organizationId, assetId, actorId, eventType, summary, metadata } });
    await tx.auditLog.create({
      data: { organizationId, actorId, action, targetType: "asset_transfer", targetId, afterValue: metadata },
    });
  }

  private organizationId(user: PublicUser) {
    if (!user.organizationId) throw new ForbiddenException("当前账号尚未绑定企业");
    return user.organizationId;
  }
}
