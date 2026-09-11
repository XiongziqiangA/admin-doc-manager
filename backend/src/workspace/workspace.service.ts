import { ForbiddenException, Injectable } from "@nestjs/common";
import {
  ApprovalStatus,
  BusinessContractStatus,
  BusinessFinanceKind,
  BusinessFinanceStatus,
  BusinessMatterStatus,
  BusinessTaskStatus,
  DocumentStatus,
  Prisma,
  UserRole,
} from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import { PublicUser } from "../users/user.presenter";
import { GlobalSearchDto } from "./dto/global-search.dto";

const personSelect = { id: true, realName: true, username: true } satisfies Prisma.UserSelect;

@Injectable()
export class WorkspaceService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(user: PublicUser) {
    const organizationId = this.organizationId(user);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextSevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const matterScope: Prisma.BusinessMatterWhereInput = {
      deletedAt: null,
      createdBy: { organizationId },
    };
    const documentScope: Prisma.DocumentWhereInput = {
      deletedAt: null,
      status: { not: DocumentStatus.DELETED },
      creator: { organizationId },
    };
    const assetScope: Prisma.AssetWhereInput = { organizationId, archivedAt: null };
    const taskScope: Prisma.BusinessMatterTaskWhereInput = {
      deletedAt: null,
      status: { in: [BusinessTaskStatus.TODO, BusinessTaskStatus.IN_PROGRESS] },
      matter: matterScope,
      assigneeId: user.role === UserRole.ADMIN ? undefined : user.id,
    };
    const followUpScope: Prisma.BusinessMatterFollowUpWhereInput = {
      deletedAt: null,
      nextAssigneeId: user.role === UserRole.ADMIN ? undefined : user.id,
      nextDueAt: { not: null },
      matter: matterScope,
    };
    const financeScope: Prisma.BusinessMatterFinanceRecordWhereInput = {
      deletedAt: null,
      status: { not: BusinessFinanceStatus.CANCELLED },
      matter: matterScope,
    };
    const approvalScope: Prisma.ApprovalWhereInput = {
      organizationId,
      status: ApprovalStatus.PENDING,
      ...(user.role === UserRole.ADMIN ? {} : { applicantId: user.id }),
    };

    const [
      documentTotal,
      documentMonthAdded,
      assetTotal,
      assetActive,
      assetAvailable,
      assetBorrowed,
      assetMaintenance,
      assetExitPending,
      matterTotal,
      matterInProgress,
      taskPending,
      taskOverdue,
      taskDueSoon,
      followUpPending,
      followUpOverdue,
      followUpDueSoon,
      contractDueSoon,
      approvalPending,
      loan,
      reimbursement,
      recentDocuments,
      recentMatters,
      recentAssets,
    ] = await Promise.all([
      this.prisma.document.count({ where: documentScope }),
      this.prisma.document.count({ where: { ...documentScope, createdAt: { gte: monthStart } } }),
      this.prisma.asset.count({ where: assetScope }),
      this.prisma.asset.count({ where: { ...assetScope, assetStatus: "active" } }),
      this.prisma.asset.count({ where: { ...assetScope, resourceStatus: "available" } }),
      this.prisma.asset.count({ where: { ...assetScope, resourceStatus: "borrowed" } }),
      this.prisma.asset.count({ where: { ...assetScope, resourceStatus: "maintenance" } }),
      this.prisma.asset.count({ where: { ...assetScope, resourceStatus: "exit_pending" } }),
      this.prisma.businessMatter.count({ where: matterScope }),
      this.prisma.businessMatter.count({ where: { ...matterScope, status: BusinessMatterStatus.IN_PROGRESS } }),
      this.prisma.businessMatterTask.count({ where: taskScope }),
      this.prisma.businessMatterTask.count({ where: { ...taskScope, dueDate: { lt: now } } }),
      this.prisma.businessMatterTask.count({ where: { ...taskScope, dueDate: { gte: now, lte: nextSevenDays } } }),
      this.prisma.businessMatterFollowUp.count({ where: followUpScope }),
      this.prisma.businessMatterFollowUp.count({ where: { ...followUpScope, nextDueAt: { lt: now } } }),
      this.prisma.businessMatterFollowUp.count({ where: { ...followUpScope, nextDueAt: { gte: now, lte: nextSevenDays } } }),
      this.prisma.businessMatterContract.count({ where: { expiresAt: { not: null, lte: nextSevenDays }, status: { in: [BusinessContractStatus.DRAFT, BusinessContractStatus.ACTIVE] }, matter: matterScope } }),
      this.prisma.approval.count({ where: approvalScope }),
      this.prisma.businessMatterFinanceRecord.aggregate({ where: { ...financeScope, kind: BusinessFinanceKind.LOAN }, _sum: { amount: true }, _count: { _all: true } }),
      this.prisma.businessMatterFinanceRecord.aggregate({ where: { ...financeScope, kind: BusinessFinanceKind.REIMBURSEMENT }, _sum: { amount: true }, _count: { _all: true } }),
      this.prisma.document.findMany({
        where: documentScope,
        orderBy: { updatedAt: "desc" },
        take: 6,
        select: {
          id: true,
          title: true,
          documentNo: true,
          updatedAt: true,
          category: { select: { name: true } },
          subcategory: { select: { name: true } },
          currentVersion: { select: { fileExt: true, fileSize: true, versionLabel: true } },
        },
      }),
      this.prisma.businessMatter.findMany({
        where: matterScope,
        orderBy: { updatedAt: "desc" },
        take: 6,
        select: { id: true, title: true, matterNo: true, type: true, status: true, updatedAt: true, owner: { select: personSelect } },
      }),
      this.prisma.asset.findMany({
        where: assetScope,
        orderBy: { updatedAt: "desc" },
        take: 6,
        select: { id: true, name: true, assetCode: true, assetStatus: true, resourceStatus: true, updatedAt: true, location: { select: { name: true } } },
      }),
    ]);

    return {
      generatedAt: now,
      documents: { total: documentTotal, monthAdded: documentMonthAdded },
      assets: { total: assetTotal, active: assetActive, available: assetAvailable, borrowed: assetBorrowed, maintenance: assetMaintenance, exitPending: assetExitPending },
      matters: { total: matterTotal, inProgress: matterInProgress },
      tasks: { pending: taskPending, overdue: taskOverdue, dueSoon: taskDueSoon },
      followUps: { pending: followUpPending, overdue: followUpOverdue, dueSoon: followUpDueSoon },
      contracts: { dueSoon: contractDueSoon },
      approvals: { pending: approvalPending },
      finance: {
        loanCount: loan._count._all,
        loanAmount: loan._sum.amount?.toString() ?? "0",
        reimbursementCount: reimbursement._count._all,
        reimbursementAmount: reimbursement._sum.amount?.toString() ?? "0",
      },
      recentDocuments,
      recentMatters,
      recentAssets,
    };
  }

  async search(user: PublicUser, dto: GlobalSearchDto) {
    const organizationId = this.organizationId(user);
    const query = dto.q.trim();
    const terms = this.splitTerms(query);
    const documentScope: Prisma.DocumentWhereInput = {
      deletedAt: null,
      status: { not: DocumentStatus.DELETED },
      creator: { organizationId },
      OR: terms.flatMap((term) => [
        { title: { contains: term, mode: "insensitive" as const } },
        { documentNo: { contains: term, mode: "insensitive" as const } },
        { currentVersion: { originalFileName: { contains: term, mode: "insensitive" as const } } },
        { category: { name: { contains: term, mode: "insensitive" as const } } },
        { subcategory: { name: { contains: term, mode: "insensitive" as const } } },
        { documentTags: { some: { tag: { name: { contains: term, mode: "insensitive" as const } } } } },
      ]),
    };
    const matterScope: Prisma.BusinessMatterWhereInput = {
      deletedAt: null,
      createdBy: { organizationId },
      OR: terms.flatMap((term) => [
        { title: { contains: term, mode: "insensitive" as const } },
        { matterNo: { contains: term, mode: "insensitive" as const } },
        { remark: { contains: term, mode: "insensitive" as const } },
        { ownerName: { contains: term, mode: "insensitive" as const } },
        { departmentName: { contains: term, mode: "insensitive" as const } },
        { partnerName: { contains: term, mode: "insensitive" as const } },
      ]),
    };
    const assetScope: Prisma.AssetWhereInput = {
      organizationId,
      archivedAt: null,
      OR: terms.flatMap((term) => [
        { name: { contains: term, mode: "insensitive" as const } },
        { assetCode: { contains: term, mode: "insensitive" as const } },
        { serialNumber: { contains: term, mode: "insensitive" as const } },
        { brand: { contains: term, mode: "insensitive" as const } },
        { model: { contains: term, mode: "insensitive" as const } },
      ]),
    };

    const [documents, matters, assets] = await Promise.all([
      this.prisma.document.findMany({
        where: documentScope,
        orderBy: { updatedAt: "desc" },
        take: dto.limit,
        select: { id: true, title: true, documentNo: true, updatedAt: true, category: { select: { name: true } }, subcategory: { select: { name: true } }, currentVersion: { select: { fileExt: true } } },
      }),
      this.prisma.businessMatter.findMany({ where: matterScope, orderBy: { updatedAt: "desc" }, take: dto.limit, select: { id: true, title: true, matterNo: true, type: true, status: true, updatedAt: true } }),
      this.prisma.asset.findMany({ where: assetScope, orderBy: { updatedAt: "desc" }, take: dto.limit, select: { id: true, name: true, assetCode: true, assetStatus: true, resourceStatus: true, updatedAt: true } }),
    ]);

    return {
      query,
      results: {
        documents: documents.map((item) => ({ ...item, categoryPath: [item.category?.name, item.subcategory?.name].filter(Boolean) })),
        matters,
        assets,
      },
      total: documents.length + matters.length + assets.length,
    };
  }

  private organizationId(user: PublicUser) {
    if (!user.organizationId) {
      throw new ForbiddenException("当前账号尚未绑定企业");
    }
    return user.organizationId;
  }

  private splitTerms(query: string) {
    return [...new Set(query.split(/[\s,，;；、]+/).map((term) => term.trim()).filter(Boolean))].slice(0, 12);
  }
}
