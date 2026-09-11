import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  ApprovalActionType,
  ApprovalBusinessType,
  ApprovalStatus,
  AssetBorrowStatus,
  AssetReservationStatus,
  Prisma,
  UserRole,
} from "@prisma/client";

import { AuthorizationService } from "../authorization/authorization.service";
import { PERMISSIONS } from "../authorization/permissions";
import { PrismaService } from "../prisma/prisma.service";
import { PublicUser } from "../users/user.presenter";
import { ListApprovalsDto } from "./dto/list-approvals.dto";
import { ReviewApprovalDto } from "./dto/review-approval.dto";

const APPROVAL_INCLUDE = {
  applicant: { select: { id: true, realName: true, username: true } },
  assignedTo: { select: { id: true, realName: true, username: true } },
  actions: {
    include: { actor: { select: { id: true, realName: true, username: true } } },
    orderBy: { createdAt: "asc" as const },
  },
  reservation: {
    include: {
      asset: { select: { id: true, assetCode: true, name: true, version: true, assetStatus: true, resourceStatus: true } },
      businessMatter: { select: { id: true, matterNo: true, title: true } },
    },
  },
  borrow: {
    include: { asset: { select: { id: true, assetCode: true, name: true, resourceStatus: true } } },
  },
  transfer: {
    include: { asset: { select: { id: true, assetCode: true, name: true, resourceStatus: true } } },
  },
} satisfies Prisma.ApprovalInclude;

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  async list(user: PublicUser, query: ListApprovalsDto) {
    await this.assertReadPermission(user);
    const organizationId = this.organizationId(user);
    const where: Prisma.ApprovalWhereInput = {
      organizationId,
      ...(user.role === UserRole.ADMIN ? {} : { applicantId: user.id }),
      ...(query.status ? { status: query.status } : {}),
      ...(query.businessType ? { businessType: query.businessType } : {}),
    };
    const skip = (query.page - 1) * query.pageSize;
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.approval.findMany({
        where,
        include: APPROVAL_INCLUDE,
        orderBy: { createdAt: "desc" },
        skip,
        take: query.pageSize,
      }),
      this.prisma.approval.count({ where }),
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
    await this.assertReadPermission(user);
    const record = await this.prisma.approval.findFirst({
      where: {
        id,
        organizationId: this.organizationId(user),
        ...(user.role === UserRole.ADMIN ? {} : { applicantId: user.id }),
      },
      include: APPROVAL_INCLUDE,
    });
    if (!record) throw new NotFoundException("审批记录不存在");
    return record;
  }

  approve(user: PublicUser, id: string, dto: ReviewApprovalDto) {
    return this.review(user, id, ApprovalActionType.APPROVE, dto);
  }

  reject(user: PublicUser, id: string, dto: ReviewApprovalDto) {
    return this.review(user, id, ApprovalActionType.REJECT, dto);
  }

  private async review(user: PublicUser, id: string, action: ApprovalActionType, dto: ReviewApprovalDto) {
    await this.authorization.assertAllPermissions(user, [PERMISSIONS.APPROVAL_REVIEW]);
    const organizationId = this.organizationId(user);
    const targetStatus = action === ApprovalActionType.APPROVE ? ApprovalStatus.APPROVED : ApprovalStatus.REJECTED;
    const comment = dto.comment?.trim() || null;
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "approvals" WHERE "id" = ${id} AND "organization_id" = ${organizationId} FOR UPDATE`);
      const approval = await tx.approval.findFirst({ where: { id, organizationId }, include: APPROVAL_INCLUDE });
      if (!approval) throw new NotFoundException("审批记录不存在");
      if (approval.status === targetStatus) return approval;
      if (approval.status !== ApprovalStatus.PENDING) throw new ConflictException("审批已经处理，不能重复变更结果");

      const assetEvent = await this.applyBusinessDecision(tx, approval, action);
      const completedAt = new Date();
      const updated = await tx.approval.update({
        where: { id },
        data: { status: targetStatus, comment, completedAt },
        include: APPROVAL_INCLUDE,
      });
      await tx.approvalAction.create({ data: { approvalId: id, actorId: user.id, action, comment } });
      await tx.assetEvent.create({
        data: {
          organizationId,
          assetId: assetEvent.assetId,
          actorId: user.id,
          eventType: assetEvent.eventType,
          summary: assetEvent.summary,
          metadata: { approvalId: id, businessId: approval.businessId, comment },
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorId: user.id,
          action: action === ApprovalActionType.APPROVE ? "approval.approved" : "approval.rejected",
          targetType: "approval",
          targetId: id,
          beforeValue: { status: approval.status, businessType: approval.businessType, businessId: approval.businessId },
          afterValue: { status: targetStatus, comment },
        },
      });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private async applyBusinessDecision(
    tx: Prisma.TransactionClient,
    approval: Prisma.ApprovalGetPayload<{ include: typeof APPROVAL_INCLUDE }>,
    action: ApprovalActionType,
  ) {
    if (approval.businessType !== ApprovalBusinessType.ASSET_RESERVATION || !approval.reservation) {
      throw new ConflictException("该审批业务尚未接入处理流程");
    }
    const reservation = approval.reservation;
    if (reservation.status !== AssetReservationStatus.PENDING) {
      throw new ConflictException("预约申请状态已变化，请刷新后重试");
    }
    if (action === ApprovalActionType.REJECT) {
      await tx.assetReservation.update({
        where: { id: reservation.id },
        data: { status: AssetReservationStatus.REJECTED },
      });
      return { assetId: reservation.assetId, eventType: "reservation_rejected", summary: "资产预约申请已驳回" };
    }

    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "assets" WHERE "id" = ${reservation.assetId} AND "organization_id" = ${approval.organizationId} FOR UPDATE`);
    const asset = await tx.asset.findFirst({
      where: { id: reservation.assetId, organizationId: approval.organizationId, archivedAt: null },
    });
    if (!asset) throw new NotFoundException("预约关联的资产不存在");
    if (asset.assetStatus !== "active" || ["borrowed", "transferring", "unavailable", "return_pending"].includes(asset.resourceStatus)) {
      throw new ConflictException("资产当前不可预约");
    }
    const [reservationConflict, borrowConflict] = await Promise.all([
      tx.assetReservation.findFirst({
        where: {
          assetId: reservation.assetId,
          id: { not: reservation.id },
          status: { in: [AssetReservationStatus.PENDING, AssetReservationStatus.APPROVED, AssetReservationStatus.ACTIVE] },
          startAt: { lt: reservation.endAt },
          endAt: { gt: reservation.startAt },
        },
        select: { id: true },
      }),
      tx.assetBorrowRecord.findFirst({
        where: {
          assetId: reservation.assetId,
          status: { in: [AssetBorrowStatus.REQUESTED, AssetBorrowStatus.APPROVED, AssetBorrowStatus.ACTIVE, AssetBorrowStatus.RETURN_PENDING] },
          borrowStart: { lt: reservation.endAt },
          borrowEnd: { gt: reservation.startAt },
        },
        select: { id: true },
      }),
    ]);
    if (reservationConflict || borrowConflict) throw new ConflictException("资产在所选时间段已有安排");
    const assetUpdated = await tx.asset.updateMany({
      where: { id: asset.id, organizationId: approval.organizationId, version: asset.version, resourceStatus: { in: ["available", "reserved"] } },
      data: { resourceStatus: "reserved", version: { increment: 1 } },
    });
    if (!assetUpdated.count) throw new ConflictException("资产状态已变化，请刷新后重试");
    await tx.assetReservation.update({
      where: { id: reservation.id },
      data: { status: AssetReservationStatus.APPROVED },
    });
    return { assetId: reservation.assetId, eventType: "reservation_approved", summary: "资产预约申请已通过" };
  }

  private assertReadPermission(user: PublicUser) {
    return this.authorization.assertAllPermissions(user, [
      user.role === UserRole.ADMIN ? PERMISSIONS.APPROVAL_REVIEW : PERMISSIONS.APPROVAL_READ_OWN,
    ]);
  }

  private organizationId(user: PublicUser) {
    if (!user.organizationId) throw new ForbiddenException("当前账号尚未绑定企业");
    return user.organizationId;
  }
}
