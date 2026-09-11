import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  ApprovalActionType,
  ApprovalBusinessType,
  ApprovalStatus,
  AssetBorrowStatus,
  AssetHandoverStatus,
  AssetHandoverType,
  AssetReservationStatus,
  Prisma,
  UserRole,
} from "@prisma/client";
import { randomUUID } from "node:crypto";

import { AuthorizationService } from "../authorization/authorization.service";
import { PERMISSIONS } from "../authorization/permissions";
import { IdempotencyService } from "../common/idempotency.service";
import { PrismaService } from "../prisma/prisma.service";
import { PublicUser } from "../users/user.presenter";
import { AssetHandoverDto } from "./dto/asset-handover.dto";
import { CancelAssetBorrowDto } from "./dto/cancel-asset-borrow.dto";
import { CreateAssetBorrowDto } from "./dto/create-asset-borrow.dto";
import { ListAssetBorrowsDto } from "./dto/list-asset-borrows.dto";
import { RequestAssetReturnDto } from "./dto/request-asset-return.dto";

const BORROW_INCLUDE = {
  asset: { select: { id: true, assetCode: true, name: true, version: true, assetStatus: true, resourceStatus: true } },
  applicant: { select: { id: true, realName: true, username: true } },
  businessMatter: { select: { id: true, matterNo: true, title: true } },
  reservation: { select: { id: true, startAt: true, endAt: true, status: true } },
  approval: { select: { id: true, status: true, comment: true, completedAt: true } },
  handovers: { orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.AssetBorrowRecordInclude;

const CONFLICTING_BORROW_STATUSES: AssetBorrowStatus[] = [
  AssetBorrowStatus.REQUESTED,
  AssetBorrowStatus.APPROVED,
  AssetBorrowStatus.ACTIVE,
  AssetBorrowStatus.RETURN_PENDING,
];
const CONFLICTING_RESERVATION_STATUSES: AssetReservationStatus[] = [
  AssetReservationStatus.PENDING,
  AssetReservationStatus.APPROVED,
  AssetReservationStatus.ACTIVE,
];
const CANCELLABLE_BORROW_STATUSES: AssetBorrowStatus[] = [AssetBorrowStatus.REQUESTED, AssetBorrowStatus.APPROVED];
const RETURN_STARTED_STATUSES: AssetBorrowStatus[] = [AssetBorrowStatus.RETURN_PENDING, AssetBorrowStatus.RETURNED];
const RETURN_CONFIRMABLE_STATUSES: AssetBorrowStatus[] = [AssetBorrowStatus.ACTIVE, AssetBorrowStatus.RETURN_PENDING];

@Injectable()
export class AssetBorrowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly idempotency: IdempotencyService,
  ) {}

  async list(user: PublicUser, query: ListAssetBorrowsDto) {
    await this.authorization.assertAllPermissions(user, [PERMISSIONS.ASSET_BORROW]);
    const organizationId = this.organizationId(user);
    const where: Prisma.AssetBorrowRecordWhereInput = {
      organizationId,
      ...(user.role === UserRole.ADMIN ? {} : { applicantId: user.id }),
      ...(query.status ? { status: query.status } : {}),
      ...(query.assetId ? { assetId: query.assetId } : {}),
    };
    const skip = (query.page - 1) * query.pageSize;
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.assetBorrowRecord.findMany({
        where,
        include: BORROW_INCLUDE,
        orderBy: { createdAt: "desc" },
        skip,
        take: query.pageSize,
      }),
      this.prisma.assetBorrowRecord.count({ where }),
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

  async create(user: PublicUser, idempotencyKey: string | undefined, dto: CreateAssetBorrowDto) {
    await this.authorization.assertAllPermissions(user, [PERMISSIONS.ASSET_BORROW]);
    const organizationId = this.organizationId(user);
    const borrowStart = new Date(dto.borrowStart);
    const borrowEnd = new Date(dto.borrowEnd);
    const purpose = dto.purpose.trim();
    if (borrowStart >= borrowEnd) throw new BadRequestException("计划归还时间必须晚于借用时间");
    const payload = {
      assetId: dto.assetId,
      reservationId: dto.reservationId ?? null,
      borrowStart: borrowStart.toISOString(),
      borrowEnd: borrowEnd.toISOString(),
      purpose,
      businessMatterId: dto.businessMatterId ?? null,
      note: dto.note?.trim() || null,
    };
    return this.idempotency.execute(user, "asset-borrow.create", idempotencyKey, payload, async (tx) => {
      await this.lockAsset(tx, dto.assetId, organizationId);
      const asset = await tx.asset.findFirst({ where: { id: dto.assetId, organizationId, archivedAt: null } });
      if (!asset) throw new NotFoundException("资产不存在");
      if (asset.assetStatus !== "active" || ["borrowed", "transferring", "unavailable", "return_pending"].includes(asset.resourceStatus)) {
        throw new ConflictException("资产当前不可借用");
      }
      const reservation = dto.reservationId
        ? await tx.assetReservation.findFirst({
            where: {
              id: dto.reservationId,
              organizationId,
              status: { in: [AssetReservationStatus.APPROVED, AssetReservationStatus.ACTIVE] },
            },
          })
        : null;
      if (dto.reservationId && !reservation) throw new BadRequestException("来源预约不存在或尚未通过");
      if (reservation) {
        if (reservation.assetId !== asset.id) throw new BadRequestException("来源预约与借用资产不一致");
        if (user.role !== UserRole.ADMIN && reservation.applicantId !== user.id) throw new ForbiddenException("不能使用他人的预约申请借用");
        if (borrowStart < reservation.startAt || borrowEnd > reservation.endAt) {
          throw new BadRequestException("借用时间必须处于预约时间范围内");
        }
      }
      if (dto.businessMatterId) {
        const matter = await tx.businessMatter.findFirst({ where: { id: dto.businessMatterId, deletedAt: null } });
        if (!matter) throw new BadRequestException("关联的项目或事项不存在");
      }
      await this.assertNoTimeConflict(tx, asset.id, borrowStart, borrowEnd, reservation?.id);

      const borrowId = randomUUID();
      const approvalId = randomUUID();
      const autoApproved = user.role === UserRole.ADMIN;
      await tx.approval.create({
        data: {
          id: approvalId,
          organizationId,
          businessType: ApprovalBusinessType.ASSET_BORROW,
          businessId: borrowId,
          applicantId: user.id,
          status: autoApproved ? ApprovalStatus.APPROVED : ApprovalStatus.PENDING,
          completedAt: autoApproved ? new Date() : null,
        },
      });
      await tx.approvalAction.create({
        data: { approvalId, actorId: user.id, action: ApprovalActionType.SUBMIT, comment: purpose },
      });
      if (autoApproved) {
        await tx.approvalAction.create({
          data: { approvalId, actorId: user.id, action: ApprovalActionType.APPROVE, comment: "管理员直接登记借用" },
        });
      }
      const borrow = await tx.assetBorrowRecord.create({
        data: {
          id: borrowId,
          organizationId,
          assetId: asset.id,
          applicantId: user.id,
          reservationId: reservation?.id ?? null,
          businessMatterId: dto.businessMatterId ?? null,
          approvalId,
          borrowStart,
          borrowEnd,
          purpose,
          note: dto.note?.trim() || null,
          status: autoApproved ? AssetBorrowStatus.APPROVED : AssetBorrowStatus.REQUESTED,
        },
        include: BORROW_INCLUDE,
      });
      if (autoApproved) await this.reserveAsset(tx, asset);
      await this.writeActivity(tx, {
        organizationId,
        assetId: asset.id,
        actorId: user.id,
        eventType: "borrow_requested",
        summary: autoApproved ? "管理员已登记资产借用" : "员工已提交资产借用申请",
        targetId: borrowId,
        action: "asset_borrow.created",
        metadata: { ...payload, status: borrow.status },
      });
      return borrow;
    });
  }

  async cancel(user: PublicUser, id: string, dto: CancelAssetBorrowDto) {
    await this.authorization.assertAllPermissions(user, [PERMISSIONS.ASSET_BORROW]);
    const organizationId = this.organizationId(user);
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.assetBorrowRecord.findFirst({ where: { id, organizationId }, include: BORROW_INCLUDE });
      if (!current) throw new NotFoundException("借用记录不存在");
      if (user.role !== UserRole.ADMIN && current.applicantId !== user.id) throw new ForbiddenException("只能取消自己的借用申请");
      if (current.status === AssetBorrowStatus.CANCELLED) return current;
      if (!CANCELLABLE_BORROW_STATUSES.includes(current.status)) {
        throw new ConflictException("当前借用状态不能取消");
      }
      const cancelled = await tx.assetBorrowRecord.update({
        where: { id },
        data: { status: AssetBorrowStatus.CANCELLED, cancelReason: dto.reason?.trim() || null },
        include: BORROW_INCLUDE,
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
      if (current.status === AssetBorrowStatus.APPROVED) await this.releaseAssetWhenUnused(tx, current.assetId, organizationId, current.reservationId);
      await this.writeActivity(tx, {
        organizationId,
        assetId: current.assetId,
        actorId: user.id,
        eventType: "borrow_cancelled",
        summary: "资产借用已取消",
        targetId: id,
        action: "asset_borrow.cancelled",
        metadata: { reason: dto.reason?.trim() || null },
      });
      return cancelled;
    });
  }

  async checkout(user: PublicUser, id: string, dto: AssetHandoverDto) {
    await this.authorization.assertAllPermissions(user, [PERMISSIONS.ASSET_APPROVE]);
    const organizationId = this.organizationId(user);
    return this.prisma.$transaction(async (tx) => {
      const current = await this.lockAndLoadBorrow(tx, id, organizationId);
      if (current.status === AssetBorrowStatus.ACTIVE) return current;
      if (current.status !== AssetBorrowStatus.APPROVED) throw new ConflictException("只有已通过的借用申请可以交接借出");
      const updatedAsset = await tx.asset.updateMany({
        where: {
          id: current.assetId,
          organizationId,
          version: current.asset.version,
          assetStatus: "active",
          resourceStatus: { in: ["available", "reserved"] },
        },
        data: { resourceStatus: "borrowed", usingUserId: current.applicantId, version: { increment: 1 } },
      });
      if (!updatedAsset.count) throw new ConflictException("资产状态已变化，请刷新后重试");
      const active = await tx.assetBorrowRecord.update({
        where: { id },
        data: { status: AssetBorrowStatus.ACTIVE },
        include: BORROW_INCLUDE,
      });
      if (current.reservationId) {
        await tx.assetReservation.updateMany({
          where: { id: current.reservationId, status: AssetReservationStatus.APPROVED },
          data: { status: AssetReservationStatus.ACTIVE },
        });
      }
      await tx.assetHandoverRecord.create({
        data: {
          assetId: current.assetId,
          borrowId: id,
          fromUserId: user.id,
          toUserId: current.applicantId,
          handoverType: AssetHandoverType.CHECKOUT,
          itemsSnapshot: dto.items,
          note: dto.note?.trim() || null,
          status: AssetHandoverStatus.CONFIRMED,
          createdById: user.id,
          confirmedAt: new Date(),
        },
      });
      await this.writeActivity(tx, {
        organizationId,
        assetId: current.assetId,
        actorId: user.id,
        eventType: "borrow_checked_out",
        summary: `资产已交接给${current.applicant.realName}`,
        targetId: id,
        action: "asset_borrow.checked_out",
        metadata: { items: dto.items, note: dto.note?.trim() || null },
      });
      return active;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async requestReturn(user: PublicUser, id: string, dto: RequestAssetReturnDto) {
    await this.authorization.assertAllPermissions(user, [PERMISSIONS.ASSET_RETURN]);
    const organizationId = this.organizationId(user);
    return this.prisma.$transaction(async (tx) => {
      const current = await this.lockAndLoadBorrow(tx, id, organizationId);
      if (user.role !== UserRole.ADMIN && current.applicantId !== user.id) throw new ForbiddenException("只能归还本人借用的资产");
      if (RETURN_STARTED_STATUSES.includes(current.status)) return current;
      if (current.status !== AssetBorrowStatus.ACTIVE) throw new ConflictException("该借用记录当前不能发起归还");
      const updatedAsset = await tx.asset.updateMany({
        where: { id: current.assetId, organizationId, version: current.asset.version, resourceStatus: "borrowed" },
        data: { resourceStatus: "return_pending", version: { increment: 1 } },
      });
      if (!updatedAsset.count) throw new ConflictException("资产状态已变化，请刷新后重试");
      const pending = await tx.assetBorrowRecord.update({
        where: { id },
        data: { status: AssetBorrowStatus.RETURN_PENDING, note: dto.note?.trim() || current.note },
        include: BORROW_INCLUDE,
      });
      await this.writeActivity(tx, {
        organizationId,
        assetId: current.assetId,
        actorId: user.id,
        eventType: "return_requested",
        summary: "员工已发起资产归还",
        targetId: id,
        action: "asset_borrow.return_requested",
        metadata: { note: dto.note?.trim() || null },
      });
      return pending;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async confirmReturn(user: PublicUser, id: string, dto: AssetHandoverDto) {
    await this.authorization.assertAllPermissions(user, [PERMISSIONS.ASSET_APPROVE]);
    const organizationId = this.organizationId(user);
    return this.prisma.$transaction(async (tx) => {
      const current = await this.lockAndLoadBorrow(tx, id, organizationId);
      if (current.status === AssetBorrowStatus.RETURNED) return current;
      if (!RETURN_CONFIRMABLE_STATUSES.includes(current.status)) {
        throw new ConflictException("该借用记录当前不能确认归还");
      }
      if (current.reservationId) {
        await tx.assetReservation.updateMany({
          where: { id: current.reservationId, status: { in: [AssetReservationStatus.APPROVED, AssetReservationStatus.ACTIVE] } },
          data: { status: AssetReservationStatus.COMPLETED },
        });
      }
      const remainingReservations = await tx.assetReservation.count({
        where: {
          assetId: current.assetId,
          ...(current.reservationId ? { id: { not: current.reservationId } } : {}),
          status: { in: [AssetReservationStatus.APPROVED, AssetReservationStatus.ACTIVE] },
        },
      });
      const nextResourceStatus = remainingReservations ? "reserved" : "available";
      const updatedAsset = await tx.asset.updateMany({
        where: {
          id: current.assetId,
          organizationId,
          version: current.asset.version,
          resourceStatus: { in: ["borrowed", "return_pending"] },
        },
        data: { resourceStatus: nextResourceStatus, usingUserId: null, version: { increment: 1 } },
      });
      if (!updatedAsset.count) throw new ConflictException("资产状态已变化，请刷新后重试");
      const returned = await tx.assetBorrowRecord.update({
        where: { id },
        data: { status: AssetBorrowStatus.RETURNED, actualReturnAt: new Date() },
        include: BORROW_INCLUDE,
      });
      await tx.assetHandoverRecord.create({
        data: {
          assetId: current.assetId,
          borrowId: id,
          fromUserId: current.applicantId,
          toUserId: user.id,
          handoverType: AssetHandoverType.RETURN,
          itemsSnapshot: dto.items,
          note: dto.note?.trim() || null,
          status: AssetHandoverStatus.CONFIRMED,
          createdById: user.id,
          confirmedAt: new Date(),
        },
      });
      await this.writeActivity(tx, {
        organizationId,
        assetId: current.assetId,
        actorId: user.id,
        eventType: "borrow_returned",
        summary: "资产归还已确认",
        targetId: id,
        action: "asset_borrow.returned",
        metadata: { items: dto.items, note: dto.note?.trim() || null, resourceStatus: nextResourceStatus },
      });
      return returned;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private async lockAndLoadBorrow(tx: Prisma.TransactionClient, id: string, organizationId: string) {
    await tx.$queryRaw(Prisma.sql`SELECT b."id" FROM "asset_borrow_records" b JOIN "assets" a ON a."id" = b."asset_id" WHERE b."id" = ${id} AND b."organization_id" = ${organizationId} FOR UPDATE OF b, a`);
    const current = await tx.assetBorrowRecord.findFirst({ where: { id, organizationId }, include: BORROW_INCLUDE });
    if (!current) throw new NotFoundException("借用记录不存在");
    return current;
  }

  private lockAsset(tx: Prisma.TransactionClient, assetId: string, organizationId: string) {
    return tx.$queryRaw(Prisma.sql`SELECT "id" FROM "assets" WHERE "id" = ${assetId} AND "organization_id" = ${organizationId} FOR UPDATE`);
  }

  private async assertNoTimeConflict(
    tx: Prisma.TransactionClient,
    assetId: string,
    borrowStart: Date,
    borrowEnd: Date,
    sourceReservationId?: string,
  ) {
    const reservation = await tx.assetReservation.findFirst({
      where: {
        assetId,
        ...(sourceReservationId ? { id: { not: sourceReservationId } } : {}),
        status: { in: CONFLICTING_RESERVATION_STATUSES },
        startAt: { lt: borrowEnd },
        endAt: { gt: borrowStart },
      },
      select: { id: true },
    });
    if (reservation) throw new ConflictException("该资产在所选时间段已有预约");
    const borrow = await tx.assetBorrowRecord.findFirst({
      where: {
        assetId,
        status: { in: CONFLICTING_BORROW_STATUSES },
        borrowStart: { lt: borrowEnd },
        borrowEnd: { gt: borrowStart },
      },
      select: { id: true },
    });
    if (borrow) throw new ConflictException("该资产在所选时间段已有借用安排");
  }

  private async reserveAsset(tx: Prisma.TransactionClient, asset: { id: string; organizationId: string; version: number }) {
    const updated = await tx.asset.updateMany({
      where: { id: asset.id, organizationId: asset.organizationId, version: asset.version, resourceStatus: { in: ["available", "reserved"] } },
      data: { resourceStatus: "reserved", version: { increment: 1 } },
    });
    if (!updated.count) throw new ConflictException("资产状态已变化，请刷新后重试");
  }

  private async releaseAssetWhenUnused(tx: Prisma.TransactionClient, assetId: string, organizationId: string, reservationId: string | null) {
    const reservations = await tx.assetReservation.count({
      where: {
        assetId,
        ...(reservationId ? { id: { not: reservationId } } : {}),
        status: { in: [AssetReservationStatus.APPROVED, AssetReservationStatus.ACTIVE] },
      },
    });
    if (!reservations) {
      await tx.asset.updateMany({
        where: { id: assetId, organizationId, resourceStatus: "reserved" },
        data: { resourceStatus: "available", version: { increment: 1 } },
      });
    }
  }

  private async writeActivity(
    tx: Prisma.TransactionClient,
    input: {
      organizationId: string;
      assetId: string;
      actorId: string;
      eventType: string;
      summary: string;
      targetId: string;
      action: string;
      metadata: Prisma.InputJsonValue;
    },
  ) {
    await tx.assetEvent.create({
      data: {
        organizationId: input.organizationId,
        assetId: input.assetId,
        actorId: input.actorId,
        eventType: input.eventType,
        summary: input.summary,
        metadata: input.metadata,
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId: input.organizationId,
        actorId: input.actorId,
        action: input.action,
        targetType: "asset_borrow_record",
        targetId: input.targetId,
        afterValue: input.metadata,
      },
    });
  }

  private organizationId(user: PublicUser) {
    if (!user.organizationId) throw new ForbiddenException("当前账号尚未绑定企业");
    return user.organizationId;
  }
}
