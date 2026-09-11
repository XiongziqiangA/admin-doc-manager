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
import { CancelAssetReservationDto } from "./dto/cancel-asset-reservation.dto";
import { CreateAssetReservationDto } from "./dto/create-asset-reservation.dto";
import { ListAssetReservationsDto } from "./dto/list-asset-reservations.dto";

const RESERVATION_INCLUDE = {
  asset: { select: { id: true, assetCode: true, name: true, resourceStatus: true } },
  applicant: { select: { id: true, realName: true, username: true } },
  businessMatter: { select: { id: true, matterNo: true, title: true } },
  approval: { select: { id: true, status: true, comment: true, completedAt: true } },
} satisfies Prisma.AssetReservationInclude;

const CONFLICTING_RESERVATION_STATUSES: AssetReservationStatus[] = [
  AssetReservationStatus.PENDING,
  AssetReservationStatus.APPROVED,
  AssetReservationStatus.ACTIVE,
];
const CANCELLABLE_RESERVATION_STATUSES: AssetReservationStatus[] = CONFLICTING_RESERVATION_STATUSES;
const RESERVED_RESERVATION_STATUSES: AssetReservationStatus[] = [
  AssetReservationStatus.APPROVED,
  AssetReservationStatus.ACTIVE,
];

@Injectable()
export class AssetReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly idempotency: IdempotencyService,
  ) {}

  async list(user: PublicUser, query: ListAssetReservationsDto) {
    await this.authorization.assertAllPermissions(user, [PERMISSIONS.ASSET_RESERVE]);
    const organizationId = this.organizationId(user);
    const where: Prisma.AssetReservationWhereInput = {
      organizationId,
      ...(user.role === UserRole.ADMIN ? {} : { applicantId: user.id }),
      ...(query.status ? { status: query.status } : {}),
      ...(query.assetId ? { assetId: query.assetId } : {}),
    };
    const skip = (query.page - 1) * query.pageSize;
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.assetReservation.findMany({
        where,
        include: RESERVATION_INCLUDE,
        orderBy: { createdAt: "desc" },
        skip,
        take: query.pageSize,
      }),
      this.prisma.assetReservation.count({ where }),
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

  async create(user: PublicUser, idempotencyKey: string | undefined, dto: CreateAssetReservationDto) {
    await this.authorization.assertAllPermissions(user, [PERMISSIONS.ASSET_RESERVE]);
    const organizationId = this.organizationId(user);
    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);
    const purpose = dto.purpose.trim();
    if (startAt >= endAt) throw new BadRequestException("预约结束时间必须晚于开始时间");

    const payload = {
      assetId: dto.assetId,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      purpose,
      businessMatterId: dto.businessMatterId ?? null,
    };
    try {
      return await this.idempotency.execute(
        user,
        "asset-reservation.create",
        idempotencyKey,
        payload,
        async (tx) => {
          await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "assets" WHERE "id" = ${dto.assetId} AND "organization_id" = ${organizationId} FOR UPDATE`);
          const asset = await tx.asset.findFirst({
            where: { id: dto.assetId, organizationId, archivedAt: null },
          });
          if (!asset) throw new NotFoundException("资产不存在");
          if (asset.assetStatus !== "active" || ["borrowed", "transferring", "unavailable", "return_pending", "maintenance"].includes(asset.resourceStatus)) {
            throw new ConflictException("资产当前不可预约");
          }
          if (dto.businessMatterId) {
            const matter = await tx.businessMatter.findFirst({ where: { id: dto.businessMatterId, deletedAt: null } });
            if (!matter) throw new BadRequestException("关联的项目或事项不存在");
          }
          await this.assertNoTimeConflict(tx, dto.assetId, startAt, endAt);

          const reservationId = randomUUID();
          const approvalId = randomUUID();
          const autoApproved = user.role === UserRole.ADMIN;
          await tx.approval.create({
            data: {
              id: approvalId,
              organizationId,
              businessType: ApprovalBusinessType.ASSET_RESERVATION,
              businessId: reservationId,
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
              data: { approvalId, actorId: user.id, action: ApprovalActionType.APPROVE, comment: "管理员直接预约" },
            });
          }
          const reservation = await tx.assetReservation.create({
            data: {
              id: reservationId,
              organizationId,
              assetId: asset.id,
              applicantId: user.id,
              businessMatterId: dto.businessMatterId ?? null,
              approvalId,
              startAt,
              endAt,
              purpose,
              status: autoApproved ? AssetReservationStatus.APPROVED : AssetReservationStatus.PENDING,
            },
            include: RESERVATION_INCLUDE,
          });
          if (autoApproved) {
            const updated = await tx.asset.updateMany({
              where: { id: asset.id, organizationId, version: asset.version, resourceStatus: { in: ["available", "reserved"] } },
              data: { resourceStatus: "reserved", version: { increment: 1 } },
            });
            if (!updated.count) throw new ConflictException("资产状态已变化，请刷新后重试");
          }
          await tx.assetEvent.create({
            data: {
              organizationId,
              assetId: asset.id,
              actorId: user.id,
              eventType: "reservation_created",
              summary: autoApproved ? "管理员已创建资产预约" : "员工已提交资产预约申请",
              metadata: { reservationId, startAt: payload.startAt, endAt: payload.endAt },
            },
          });
          await tx.auditLog.create({
            data: {
              organizationId,
              actorId: user.id,
              action: "asset_reservation.created",
              targetType: "asset_reservation",
              targetId: reservationId,
              afterValue: { ...payload, status: reservation.status },
            },
          });
          return reservation;
        },
      );
    } catch (error) {
      if (isReservationOverlapError(error)) throw new ConflictException("该资产在所选时间段已有预约");
      throw error;
    }
  }

  async cancel(user: PublicUser, id: string, dto: CancelAssetReservationDto) {
    await this.authorization.assertAllPermissions(user, [PERMISSIONS.ASSET_RESERVE]);
    const organizationId = this.organizationId(user);
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.assetReservation.findFirst({
        where: { id, organizationId },
        include: RESERVATION_INCLUDE,
      });
      if (!current) throw new NotFoundException("预约记录不存在");
      if (user.role !== UserRole.ADMIN && current.applicantId !== user.id) {
        throw new ForbiddenException("只能取消自己的预约申请");
      }
      if (current.status === AssetReservationStatus.CANCELLED) return current;
      if (!CANCELLABLE_RESERVATION_STATUSES.includes(current.status)) {
        throw new ConflictException("当前预约状态不能取消");
      }

      const cancelled = await tx.assetReservation.update({
        where: { id },
        data: {
          status: AssetReservationStatus.CANCELLED,
          cancelReason: dto.reason?.trim() || null,
          cancelledAt: new Date(),
        },
        include: RESERVATION_INCLUDE,
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
      if (RESERVED_RESERVATION_STATUSES.includes(current.status)) {
        const remaining = await tx.assetReservation.count({
          where: {
            assetId: current.assetId,
            id: { not: id },
            status: { in: [AssetReservationStatus.APPROVED, AssetReservationStatus.ACTIVE] },
          },
        });
        if (!remaining) {
          await tx.asset.updateMany({
            where: { id: current.assetId, organizationId, resourceStatus: "reserved" },
            data: { resourceStatus: "available", version: { increment: 1 } },
          });
        }
      }
      await tx.assetEvent.create({
        data: {
          organizationId,
          assetId: current.assetId,
          actorId: user.id,
          eventType: "reservation_cancelled",
          summary: "资产预约已取消",
          metadata: { reservationId: id, reason: dto.reason?.trim() || null },
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorId: user.id,
          action: "asset_reservation.cancelled",
          targetType: "asset_reservation",
          targetId: id,
          beforeValue: { status: current.status },
          afterValue: { status: cancelled.status, reason: dto.reason?.trim() || null },
        },
      });
      return cancelled;
    });
  }

  private async assertNoTimeConflict(tx: Prisma.TransactionClient, assetId: string, startAt: Date, endAt: Date) {
    const reservation = await tx.assetReservation.findFirst({
      where: {
        assetId,
        status: { in: CONFLICTING_RESERVATION_STATUSES },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
      select: { id: true },
    });
    if (reservation) throw new ConflictException("该资产在所选时间段已有预约");
    const borrow = await tx.assetBorrowRecord.findFirst({
      where: {
        assetId,
        status: { in: [AssetBorrowStatus.REQUESTED, AssetBorrowStatus.APPROVED, AssetBorrowStatus.ACTIVE, AssetBorrowStatus.RETURN_PENDING] },
        borrowStart: { lt: endAt },
        borrowEnd: { gt: startAt },
      },
      select: { id: true },
    });
    if (borrow) throw new ConflictException("该资产在所选时间段已有借用安排");
  }

  private organizationId(user: PublicUser) {
    if (!user.organizationId) throw new ForbiddenException("当前账号尚未绑定企业");
    return user.organizationId;
  }
}

function isReservationOverlapError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError
    && (error.code === "P2004" || String(error.meta?.database_error ?? "").includes("asset_reservations_no_time_overlap"));
}
