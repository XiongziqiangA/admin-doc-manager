import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  ApprovalStatus,
  BusinessContractStatus,
  BusinessMatterStatus,
  BusinessTaskStatus,
  UserRole,
  Prisma,
} from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import { PublicUser } from "../users/user.presenter";
import { ListNotificationsDto } from "./dto/list-notifications.dto";

type NotificationSeed = {
  type: string;
  title: string;
  message: string;
  entityType: string;
  entityId: string;
  dedupeKey: string;
  metadata?: Prisma.InputJsonValue;
  expiresAt?: Date;
};

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: PublicUser, query: ListNotificationsDto) {
    const organizationId = this.organizationId(user);
    await this.materializeReminders(user, organizationId);
    const activeScope: Prisma.NotificationWhereInput = {
      organizationId,
      recipientId: user.id,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    };
    const where: Prisma.NotificationWhereInput = {
      ...activeScope,
      ...(query.unreadOnly ? { readAt: null } : {}),
    };
    const skip = (query.page - 1) * query.pageSize;
    const [items, totalItems, unreadCount] = await this.prisma.$transaction([
      this.prisma.notification.findMany({ where, orderBy: [{ readAt: "asc" }, { createdAt: "desc" }], skip, take: query.pageSize }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { ...activeScope, readAt: null } }),
    ]);
    return {
      items,
      unreadCount,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / query.pageSize),
      },
    };
  }

  async markRead(user: PublicUser, id: string) {
    const organizationId = this.organizationId(user);
    const updated = await this.prisma.notification.updateMany({
      where: { id, organizationId, recipientId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    if (!updated.count) {
      const existing = await this.prisma.notification.findFirst({ where: { id, organizationId, recipientId: user.id } });
      if (!existing) throw new NotFoundException("通知不存在");
      return existing;
    }
    return this.prisma.notification.findUniqueOrThrow({ where: { id } });
  }

  async markAllRead(user: PublicUser) {
    const organizationId = this.organizationId(user);
    const result = await this.prisma.notification.updateMany({
      where: { organizationId, recipientId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return { updatedCount: result.count };
  }

  private async materializeReminders(user: PublicUser, organizationId: string) {
    const now = new Date();
    const nextSevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const matterScope: Prisma.BusinessMatterWhereInput = {
      deletedAt: null,
      createdBy: { organizationId },
      status: { not: BusinessMatterStatus.CANCELLED },
    };
    const [approvals, tasks, followUps, contracts, borrows] = await Promise.all([
      this.prisma.approval.findMany({
        where: { organizationId, status: ApprovalStatus.PENDING, ...(user.role === UserRole.ADMIN ? {} : { applicantId: user.id }) },
        select: { id: true, businessType: true, businessId: true },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      this.prisma.businessMatterTask.findMany({
        where: {
          deletedAt: null,
          status: { in: [BusinessTaskStatus.TODO, BusinessTaskStatus.IN_PROGRESS] },
          assigneeId: user.id,
          dueDate: { not: null, lte: nextSevenDays },
          matter: matterScope,
        },
        select: { id: true, title: true, dueDate: true, matterId: true },
        orderBy: { dueDate: "asc" },
        take: 50,
      }),
      this.prisma.businessMatterFollowUp.findMany({
        where: { deletedAt: null, nextAssigneeId: user.id, nextDueAt: { not: null, lte: nextSevenDays }, matter: matterScope },
        select: { id: true, nextAction: true, nextDueAt: true, matterId: true },
        orderBy: { nextDueAt: "asc" },
        take: 50,
      }),
      user.role === UserRole.ADMIN
        ? this.prisma.businessMatterContract.findMany({
            where: { expiresAt: { not: null, lte: nextSevenDays }, status: { in: [BusinessContractStatus.DRAFT, BusinessContractStatus.ACTIVE] }, matter: matterScope },
            select: { id: true, contractNo: true, partyName: true, expiresAt: true, matterId: true },
            orderBy: { expiresAt: "asc" },
            take: 50,
          })
        : Promise.resolve([] as Array<{ id: string; contractNo: string | null; partyName: string; expiresAt: Date | null; matterId: string }>),
      this.prisma.assetBorrowRecord.findMany({
        where: { organizationId, applicantId: user.id, status: { in: ["ACTIVE", "RETURN_PENDING"] }, borrowEnd: { lte: nextSevenDays } },
        select: { id: true, borrowEnd: true, asset: { select: { name: true, assetCode: true } } },
        orderBy: { borrowEnd: "asc" },
        take: 50,
      }),
    ]);

    const seeds: NotificationSeed[] = [
      ...approvals.map((item) => ({
        type: "APPROVAL_PENDING",
        title: user.role === UserRole.ADMIN ? "有新的审批待处理" : "你的申请待处理",
        message: user.role === UserRole.ADMIN ? `有一条${approvalLabel(item.businessType)}需要审批。` : `你的${approvalLabel(item.businessType)}正在等待处理。`,
        entityType: "approval",
        entityId: item.id,
        dedupeKey: `approval:${organizationId}:${user.id}:${item.id}`,
        metadata: { businessType: item.businessType, businessId: item.businessId },
      })),
      ...tasks.map((item) => {
        const overdue = item.dueDate !== null && item.dueDate < now;
        return {
          type: overdue ? "TASK_OVERDUE" : "TASK_DUE_SOON",
          title: overdue ? "任务已逾期" : "任务即将到期",
          message: `任务“${item.title}”${overdue ? "已经逾期" : "将在 7 天内到期"}。`,
          entityType: "business_matter",
          entityId: item.matterId,
          dedupeKey: `task:${organizationId}:${user.id}:${item.id}:${overdue ? "overdue" : "due-soon"}`,
          metadata: { taskId: item.id, dueDate: item.dueDate?.toISOString() ?? null },
          expiresAt: overdue ? undefined : item.dueDate ?? undefined,
        };
      }),
      ...followUps.map((item) => {
        const overdue = item.nextDueAt !== null && item.nextDueAt < now;
        return {
          type: overdue ? "FOLLOW_UP_OVERDUE" : "FOLLOW_UP_DUE_SOON",
          title: overdue ? "跟进已逾期" : "跟进即将到期",
          message: `有一项${item.nextAction ? `“${item.nextAction}”` : "待办跟进"}${overdue ? "已经逾期" : "将在 7 天内到期"}。`,
          entityType: "business_matter",
          entityId: item.matterId,
          dedupeKey: `follow-up:${organizationId}:${user.id}:${item.id}:${overdue ? "overdue" : "due-soon"}`,
          metadata: { followUpId: item.id, dueAt: item.nextDueAt?.toISOString() ?? null },
          expiresAt: overdue ? undefined : item.nextDueAt ?? undefined,
        };
      }),
      ...contracts.map((item) => ({
        type: "CONTRACT_EXPIRING",
        title: "合同即将到期",
        message: `合同${item.contractNo ? `“${item.contractNo}”` : `“${item.partyName}”`}将在 7 天内到期。`,
        entityType: "business_matter",
        entityId: item.matterId,
        dedupeKey: `contract:${organizationId}:${user.id}:${item.id}`,
        metadata: { contractId: item.id, expiresAt: item.expiresAt?.toISOString() ?? null },
        expiresAt: item.expiresAt ?? undefined,
      })),
      ...borrows.map((item) => ({
        type: "ASSET_RETURN_DUE",
        title: "资产归还提醒",
        message: `资产“${item.asset.name}（${item.asset.assetCode}）”将在 7 天内到期归还。`,
        entityType: "asset_borrow",
        entityId: item.id,
        dedupeKey: `borrow-return:${organizationId}:${user.id}:${item.id}`,
        metadata: { borrowEnd: item.borrowEnd.toISOString(), assetCode: item.asset.assetCode },
        expiresAt: item.borrowEnd,
      })),
    ];

    await Promise.all(seeds.map((seed) => this.prisma.notification.upsert({
      where: { dedupeKey: seed.dedupeKey },
      create: { organizationId, recipientId: user.id, ...seed },
      update: { title: seed.title, message: seed.message, metadata: seed.metadata, expiresAt: seed.expiresAt },
    })));
  }

  private organizationId(user: PublicUser) {
    if (!user.organizationId) throw new ForbiddenException("当前账号尚未绑定企业");
    return user.organizationId;
  }
}

function approvalLabel(type: string) {
  const labels: Record<string, string> = {
    ASSET_INTAKE: "历史资产入库申请",
    ASSET_RESERVATION: "资产预约申请",
    ASSET_BORROW: "资产借用申请",
    ASSET_TRANSFER: "资产调拨申请",
    ASSET_EXIT: "资产退出申请",
  };
  return labels[type] ?? "业务申请";
}
