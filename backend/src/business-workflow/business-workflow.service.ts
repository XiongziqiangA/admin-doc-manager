import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  BusinessActivityAction,
  BusinessContractStatus,
  BusinessFinanceKind,
  BusinessFinanceStatus,
  BusinessMatterStatus,
  BusinessMatterType,
  BusinessTaskStatus,
  BusinessTaskPriority,
  DocumentStatus,
  Prisma,
  UserStatus,
} from "@prisma/client";
import { randomUUID } from "node:crypto";

import { PublicUser } from "../users/user.presenter";
import { BusinessMattersService } from "../business-matters/business-matters.service";
import { PrismaService } from "../prisma/prisma.service";
import { AttachFinanceDocumentsDto } from "./dto/attach-finance-documents.dto";
import { CreateBusinessFinanceRecordDto } from "./dto/create-business-finance-record.dto";
import { CreateBusinessTaskDto } from "./dto/create-business-task.dto";
import { ListBusinessFinanceRecordsDto } from "./dto/list-business-finance-records.dto";
import { ListBusinessTasksDto } from "./dto/list-business-tasks.dto";
import { UpdateBusinessFinanceRecordDto } from "./dto/update-business-finance-record.dto";
import { UpdateBusinessTaskDto } from "./dto/update-business-task.dto";
import { UpsertBusinessContractDto } from "./dto/upsert-business-contract.dto";

const personSelect = { id: true, username: true, realName: true } satisfies Prisma.UserSelect;

@Injectable()
export class BusinessWorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businessMatters: BusinessMattersService,
  ) {}

  async listTasks(matterId: string, query: ListBusinessTasksDto) {
    await this.businessMatters.requireReadable(matterId);
    const where: Prisma.BusinessMatterTaskWhereInput = {
      matterId,
      deletedAt: null,
      status: query.status,
      assigneeId: query.assigneeId,
    };
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.businessMatterTask.findMany({
        where,
        include: this.taskInclude(),
        orderBy: [{ status: "asc" }, { dueDate: "asc" }, { updatedAt: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.businessMatterTask.count({ where }),
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

  async createTask(matterId: string, dto: CreateBusinessTaskDto, user: PublicUser) {
    const matter = await this.businessMatters.requireEditableForRelatedData(matterId, user);
    const assigneeId = dto.assigneeId ?? matter.ownerId;
    await this.ensureActiveUser(assigneeId);
    const title = this.normalizeText(dto.title, "任务标题不能为空");
    const status = dto.status ?? BusinessTaskStatus.TODO;
    const task = await this.prisma.businessMatterTask.create({
      data: {
        matterId,
        title,
        description: this.optionalText(dto.description),
        status,
        priority: dto.priority ?? BusinessTaskPriority.NORMAL,
        dueDate: this.toDate(dto.dueDate),
        completedAt: status === BusinessTaskStatus.COMPLETED ? new Date() : null,
        assigneeId,
        createdById: user.id,
      },
      include: this.taskInclude(),
    });
    await this.logActivity(matterId, user, BusinessActivityAction.TASK_CREATED, `创建跟进任务“${title}”`);
    return task;
  }

  async updateTask(matterId: string, taskId: string, dto: UpdateBusinessTaskDto, user: PublicUser) {
    await this.businessMatters.requireEditableForRelatedData(matterId, user);
    const task = await this.requireTask(matterId, taskId);
    if (dto.assigneeId !== undefined && dto.assigneeId !== null) {
      await this.ensureActiveUser(dto.assigneeId);
    }
    const nextStatus = dto.status ?? task.status;
    const data: Prisma.BusinessMatterTaskUpdateInput = {
      title: dto.title === undefined ? undefined : this.normalizeText(dto.title, "任务标题不能为空"),
      description: dto.description === undefined ? undefined : this.optionalText(dto.description),
      priority: dto.priority,
      status: dto.status,
      dueDate: dto.dueDate === undefined ? undefined : this.toDate(dto.dueDate),
      assignee: dto.assigneeId === undefined
        ? undefined
        : dto.assigneeId === null
          ? { disconnect: true }
          : { connect: { id: dto.assigneeId } },
      completedAt: dto.status === undefined
        ? undefined
        : nextStatus === BusinessTaskStatus.COMPLETED
          ? task.completedAt ?? new Date()
          : null,
    };
    const updated = await this.prisma.businessMatterTask.update({
      where: { id: task.id },
      data,
      include: this.taskInclude(),
    });
    const action = nextStatus === BusinessTaskStatus.COMPLETED && task.status !== BusinessTaskStatus.COMPLETED
      ? BusinessActivityAction.TASK_COMPLETED
      : BusinessActivityAction.TASK_UPDATED;
    await this.logActivity(matterId, user, action, `更新跟进任务“${updated.title}”`);
    return updated;
  }

  async removeTask(matterId: string, taskId: string, user: PublicUser) {
    await this.businessMatters.requireEditableForRelatedData(matterId, user);
    const task = await this.requireTask(matterId, taskId);
    const result = await this.prisma.businessMatterTask.update({
      where: { id: task.id },
      data: { deletedAt: new Date() },
    });
    await this.logActivity(matterId, user, BusinessActivityAction.TASK_DELETED, `删除跟进任务“${task.title}”`);
    return result;
  }

  async getContract(matterId: string) {
    await this.businessMatters.requireReadable(matterId);
    return this.prisma.businessMatterContract.findUnique({
      where: { matterId },
      include: { createdBy: { select: personSelect } },
    });
  }

  async upsertContract(matterId: string, dto: UpsertBusinessContractDto, user: PublicUser) {
    const matter = await this.businessMatters.requireEditableForRelatedData(matterId, user);
    if (matter.type !== BusinessMatterType.CONTRACT) {
      throw new BadRequestException("只有合同类型事项可以维护合同信息");
    }
    const existing = await this.prisma.businessMatterContract.findUnique({
      where: { matterId },
      select: { signedAt: true, effectiveAt: true, expiresAt: true },
    });
    const signedAt = dto.signedAt === undefined ? existing?.signedAt : dto.signedAt;
    const effectiveAt = dto.effectiveAt === undefined ? existing?.effectiveAt : dto.effectiveAt;
    const expiresAt = dto.expiresAt === undefined ? existing?.expiresAt : dto.expiresAt;
    this.validateDateRange(effectiveAt, expiresAt, "合同生效日期不能晚于到期日期");
    this.validateDateRange(signedAt, expiresAt, "签署日期不能晚于到期日期");
    const partyName = this.normalizeText(dto.partyName, "合同相对方不能为空");
    const contract = await this.prisma.businessMatterContract.upsert({
      where: { matterId },
      create: {
        matterId,
        contractNo: this.optionalText(dto.contractNo),
        partyName,
        signedAt: this.toDate(dto.signedAt),
        effectiveAt: this.toDate(dto.effectiveAt),
        expiresAt: this.toDate(dto.expiresAt),
        renewalNoticeDays: dto.renewalNoticeDays ?? 30,
        amount: this.toDecimal(dto.amount),
        status: dto.status ?? BusinessContractStatus.DRAFT,
        remark: this.optionalText(dto.remark),
        createdById: user.id,
      },
      update: {
        contractNo: dto.contractNo === undefined ? undefined : this.optionalText(dto.contractNo),
        partyName,
        signedAt: dto.signedAt === undefined ? undefined : this.toDate(dto.signedAt),
        effectiveAt: dto.effectiveAt === undefined ? undefined : this.toDate(dto.effectiveAt),
        expiresAt: dto.expiresAt === undefined ? undefined : this.toDate(dto.expiresAt),
        renewalNoticeDays: dto.renewalNoticeDays,
        amount: dto.amount === undefined ? undefined : this.toDecimal(dto.amount),
        status: dto.status,
        remark: dto.remark === undefined ? undefined : this.optionalText(dto.remark),
      },
      include: { createdBy: { select: personSelect } },
    });
    await this.logActivity(matterId, user, BusinessActivityAction.CONTRACT_UPDATED, "更新合同信息");
    return contract;
  }

  async removeContract(matterId: string, user: PublicUser) {
    await this.businessMatters.requireEditableForRelatedData(matterId, user);
    const contract = await this.prisma.businessMatterContract.findUnique({ where: { matterId } });
    if (!contract) {
      throw new NotFoundException("合同信息不存在");
    }
    const result = await this.prisma.businessMatterContract.delete({ where: { matterId } });
    await this.logActivity(matterId, user, BusinessActivityAction.CONTRACT_DELETED, "删除合同信息");
    return result;
  }

  async listFinanceRecords(matterId: string, query: ListBusinessFinanceRecordsDto) {
    await this.businessMatters.requireReadable(matterId);
    const keyword = query.keyword?.trim();
    const where: Prisma.BusinessMatterFinanceRecordWhereInput = {
      matterId,
      deletedAt: null,
      kind: query.kind,
      status: query.status,
      OR: keyword
        ? [
            { title: { contains: keyword, mode: "insensitive" } },
            { recordNo: { contains: keyword, mode: "insensitive" } },
            { counterparty: { contains: keyword, mode: "insensitive" } },
          ]
        : undefined,
    };
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.businessMatterFinanceRecord.findMany({
        where,
        include: this.financeInclude(),
        orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.businessMatterFinanceRecord.count({ where }),
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

  async createFinanceRecord(matterId: string, dto: CreateBusinessFinanceRecordDto, user: PublicUser) {
    await this.businessMatters.requireEditableForRelatedData(matterId, user);
    const title = this.normalizeText(dto.title, "财务记录标题不能为空");
    const record = await this.prisma.businessMatterFinanceRecord.create({
      data: {
        matterId,
        recordNo: this.normalizeRecordNo(dto.recordNo) ?? this.generateRecordNo(dto.kind),
        kind: dto.kind,
        status: dto.status ?? BusinessFinanceStatus.DRAFT,
        title,
        amount: this.requireAmount(dto.amount),
        currency: this.normalizeCurrency(dto.currency),
        occurredAt: this.toDate(dto.occurredAt),
        counterparty: this.optionalText(dto.counterparty),
        dueDate: this.toDate(dto.dueDate),
        settledAt: this.toDate(dto.settledAt),
        remark: this.optionalText(dto.remark),
        createdById: user.id,
      },
      include: this.financeInclude(),
    });
    await this.logActivity(matterId, user, BusinessActivityAction.FINANCE_CREATED, `创建${this.financeKindLabel(dto.kind)}“${title}”`);
    return record;
  }

  async updateFinanceRecord(matterId: string, recordId: string, dto: UpdateBusinessFinanceRecordDto, user: PublicUser) {
    await this.businessMatters.requireEditableForRelatedData(matterId, user);
    const record = await this.requireFinanceRecord(matterId, recordId);
    const data: Prisma.BusinessMatterFinanceRecordUpdateInput = {
      kind: dto.kind,
      title: dto.title === undefined ? undefined : this.normalizeText(dto.title, "财务记录标题不能为空"),
      amount: dto.amount === undefined ? undefined : this.requireAmount(dto.amount),
      currency: dto.currency === undefined ? undefined : this.normalizeCurrency(dto.currency),
      occurredAt: dto.occurredAt === undefined ? undefined : this.toDate(dto.occurredAt),
      counterparty: dto.counterparty === undefined ? undefined : this.optionalText(dto.counterparty),
      dueDate: dto.dueDate === undefined ? undefined : this.toDate(dto.dueDate),
      status: dto.status,
      settledAt: dto.settledAt === undefined ? undefined : this.toDate(dto.settledAt),
      remark: dto.remark === undefined ? undefined : this.optionalText(dto.remark),
    };
    const nextStatus = dto.status ?? record.status;
    if (dto.status === BusinessFinanceStatus.SETTLED && dto.settledAt === undefined && !record.settledAt) {
      data.settledAt = new Date();
    }
    if (dto.status && dto.status !== BusinessFinanceStatus.SETTLED && dto.settledAt === undefined) {
      data.settledAt = null;
    }
    const updated = await this.prisma.businessMatterFinanceRecord.update({
      where: { id: record.id },
      data,
      include: this.financeInclude(),
    });
    await this.logActivity(matterId, user, BusinessActivityAction.FINANCE_UPDATED, `更新${this.financeKindLabel(dto.kind ?? record.kind)}“${updated.title}”`);
    return updated;
  }

  async removeFinanceRecord(matterId: string, recordId: string, user: PublicUser) {
    await this.businessMatters.requireEditableForRelatedData(matterId, user);
    const record = await this.requireFinanceRecord(matterId, recordId);
    const result = await this.prisma.businessMatterFinanceRecord.update({
      where: { id: record.id },
      data: { deletedAt: new Date() },
    });
    await this.logActivity(matterId, user, BusinessActivityAction.FINANCE_DELETED, `删除财务记录“${record.title}”`);
    return result;
  }

  async attachFinanceDocuments(
    matterId: string,
    recordId: string,
    dto: AttachFinanceDocumentsDto,
    user: PublicUser,
  ) {
    await this.businessMatters.requireEditableForRelatedData(matterId, user);
    await this.requireFinanceRecord(matterId, recordId);
    const documents = await this.prisma.document.findMany({
      where: { id: { in: dto.documentIds }, deletedAt: null, status: { not: DocumentStatus.DELETED } },
      select: { id: true, currentVersionId: true },
    });
    if (documents.length !== dto.documentIds.length) {
      throw new BadRequestException("存在不存在或已删除的凭证文件");
    }
    const existing = await this.prisma.businessMatterFinanceDocument.findMany({
      where: { recordId, documentId: { in: dto.documentIds } },
      select: { documentId: true },
    });
    if (existing.length) {
      throw new ConflictException("所选凭证中包含已关联文件");
    }
    const result = await this.prisma.businessMatterFinanceDocument.createMany({
      data: documents.map((document) => ({
        recordId,
        documentId: document.id,
        versionId: document.currentVersionId,
        relationType: this.optionalText(dto.relationType) ?? "VOUCHER",
      })),
    });
    await this.logActivity(matterId, user, BusinessActivityAction.FINANCE_DOCUMENT_ATTACHED, `为财务记录关联 ${result.count} 份凭证`);
    return { recordId, addedCount: result.count };
  }

  async detachFinanceDocument(matterId: string, recordId: string, documentId: string, user: PublicUser) {
    await this.businessMatters.requireEditableForRelatedData(matterId, user);
    await this.requireFinanceRecord(matterId, recordId);
    const link = await this.prisma.businessMatterFinanceDocument.findFirst({ where: { recordId, documentId } });
    if (!link) {
      throw new NotFoundException("凭证关联不存在");
    }
    const result = await this.prisma.businessMatterFinanceDocument.delete({
      where: { recordId_documentId: { recordId, documentId } },
    });
    await this.logActivity(matterId, user, BusinessActivityAction.FINANCE_DOCUMENT_DETACHED, "取消财务凭证关联");
    return result;
  }

  async listActivities(matterId: string, page = 1, pageSize = 30) {
    await this.businessMatters.requireReadable(matterId);
    const where = { matterId } satisfies Prisma.BusinessMatterActivityWhereInput;
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.businessMatterActivity.findMany({
        where,
        include: { actor: { select: personSelect } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.businessMatterActivity.count({ where }),
    ]);
    return { items, pagination: { page, pageSize, totalItems, totalPages: Math.ceil(totalItems / pageSize) } };
  }

  async getOverview(user: PublicUser) {
    const now = new Date();
    const nextSevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const activeTaskWhere: Prisma.BusinessMatterTaskWhereInput = {
      deletedAt: null,
      assigneeId: user.id,
      status: { in: [BusinessTaskStatus.TODO, BusinessTaskStatus.IN_PROGRESS] },
      matter: { deletedAt: null },
    };
    const contractWhere: Prisma.BusinessMatterContractWhereInput = {
      expiresAt: { not: null, lte: nextSevenDays },
      status: { in: [BusinessContractStatus.DRAFT, BusinessContractStatus.ACTIVE] },
      matter: { deletedAt: null },
    };
    const [matterTotal, matterInProgress, taskPending, taskOverdue, taskDueSoon, contractDueSoon, loan, reimbursement] = await Promise.all([
      this.prisma.businessMatter.count({ where: { deletedAt: null } }),
      this.prisma.businessMatter.count({ where: { deletedAt: null, status: BusinessMatterStatus.IN_PROGRESS } }),
      this.prisma.businessMatterTask.count({ where: activeTaskWhere }),
      this.prisma.businessMatterTask.count({ where: { ...activeTaskWhere, dueDate: { lt: now } } }),
      this.prisma.businessMatterTask.count({ where: { ...activeTaskWhere, dueDate: { gte: now, lte: nextSevenDays } } }),
      this.prisma.businessMatterContract.count({ where: contractWhere }),
      this.prisma.businessMatterFinanceRecord.aggregate({
        where: { deletedAt: null, kind: BusinessFinanceKind.LOAN, status: { not: BusinessFinanceStatus.CANCELLED } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.businessMatterFinanceRecord.aggregate({
        where: { deletedAt: null, kind: BusinessFinanceKind.REIMBURSEMENT, status: { not: BusinessFinanceStatus.CANCELLED } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
    ]);
    return {
      matters: { total: matterTotal, inProgress: matterInProgress },
      tasks: { pending: taskPending, overdue: taskOverdue, dueSoon: taskDueSoon },
      contracts: { dueSoon: contractDueSoon },
      finance: {
        loanCount: loan._count._all,
        loanAmount: loan._sum.amount?.toString() ?? "0",
        reimbursementCount: reimbursement._count._all,
        reimbursementAmount: reimbursement._sum.amount?.toString() ?? "0",
      },
    };
  }

  async listReminders(user: PublicUser) {
    const now = new Date();
    const nextSevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const [tasks, contracts] = await Promise.all([
      this.prisma.businessMatterTask.findMany({
        where: {
          deletedAt: null,
          assigneeId: user.id,
          status: { in: [BusinessTaskStatus.TODO, BusinessTaskStatus.IN_PROGRESS] },
          dueDate: { not: null, lte: nextSevenDays },
          matter: { deletedAt: null },
        },
        include: { matter: { select: { id: true, title: true, matterNo: true } } },
        orderBy: { dueDate: "asc" },
        take: 50,
      }),
      this.prisma.businessMatterContract.findMany({
        where: {
          expiresAt: { not: null, lte: nextSevenDays },
          status: { in: [BusinessContractStatus.DRAFT, BusinessContractStatus.ACTIVE] },
          matter: { deletedAt: null },
        },
        include: { matter: { select: { id: true, title: true, matterNo: true } } },
        orderBy: { expiresAt: "asc" },
        take: 50,
      }),
    ]);
    return {
      generatedAt: now,
      items: [
        ...tasks.map((task) => ({
          kind: "TASK" as const,
          id: task.id,
          title: task.title,
          dueAt: task.dueDate,
          overdue: Boolean(task.dueDate && task.dueDate < now),
          matter: task.matter,
        })),
        ...contracts.map((contract) => ({
          kind: "CONTRACT" as const,
          id: contract.id,
          title: `合同到期：${contract.partyName}`,
          dueAt: contract.expiresAt,
          overdue: Boolean(contract.expiresAt && contract.expiresAt < now),
          matter: contract.matter,
        })),
      ].sort((left, right) => (left.dueAt?.getTime() ?? 0) - (right.dueAt?.getTime() ?? 0)),
    };
  }

  private async requireTask(matterId: string, taskId: string) {
    const task = await this.prisma.businessMatterTask.findFirst({ where: { id: taskId, matterId, deletedAt: null } });
    if (!task) {
      throw new NotFoundException("跟进任务不存在");
    }
    return task;
  }

  private async requireFinanceRecord(matterId: string, recordId: string) {
    const record = await this.prisma.businessMatterFinanceRecord.findFirst({ where: { id: recordId, matterId, deletedAt: null } });
    if (!record) {
      throw new NotFoundException("财务记录不存在");
    }
    return record;
  }

  private async ensureActiveUser(userId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null, status: UserStatus.ACTIVE }, select: { id: true } });
    if (!user) {
      throw new BadRequestException("负责人不存在或已停用");
    }
  }

  private async logActivity(matterId: string, user: PublicUser, action: BusinessActivityAction, summary: string) {
    await this.prisma.businessMatterActivity.create({ data: { matterId, actorId: user.id, action, summary } });
  }

  private taskInclude(): Prisma.BusinessMatterTaskInclude {
    return {
      assignee: { select: personSelect },
      createdBy: { select: personSelect },
    };
  }

  private financeInclude(): Prisma.BusinessMatterFinanceRecordInclude {
    return {
      createdBy: { select: personSelect },
      documents: { include: { document: { include: { currentVersion: true } }, version: true }, orderBy: { createdAt: "desc" } },
    };
  }

  private normalizeText(value: string | null | undefined, message: string) {
    const normalized = value?.trim() ?? "";
    if (!normalized) {
      throw new BadRequestException(message);
    }
    return normalized;
  }

  private optionalText(value: string | null | undefined) {
    const normalized = value?.trim();
    return normalized || null;
  }

  private toDate(value: string | null | undefined) {
    if (value === undefined || value === null || value === "") {
      return value === null ? null : undefined;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException("日期格式无效");
    }
    return date;
  }

  private validateDateRange(
    start: string | Date | null | undefined,
    end: string | Date | null | undefined,
    message: string,
  ) {
    if (!start || !end) {
      return;
    }
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw new BadRequestException("日期格式无效");
    }
    if (startDate > endDate) {
      throw new BadRequestException(message);
    }
  }

  private requireAmount(amount: number) {
    if (!Number.isFinite(amount) || amount < 0) {
      throw new BadRequestException("金额必须是非负数字");
    }
    return new Prisma.Decimal(amount);
  }

  private toDecimal(amount: number | null | undefined) {
    return amount === undefined || amount === null ? amount : this.requireAmount(amount);
  }

  private normalizeCurrency(currency?: string) {
    const normalized = (currency || "CNY").trim().toUpperCase();
    if (!/^[A-Z]{3,12}$/.test(normalized)) {
      throw new BadRequestException("币种格式无效");
    }
    return normalized;
  }

  private normalizeRecordNo(recordNo?: string | null) {
    const normalized = recordNo?.trim();
    if (!normalized) {
      return null;
    }
    if (!/^[\w\-\u4e00-\u9fff]{1,120}$/u.test(normalized)) {
      throw new BadRequestException("记录单号包含不支持的字符");
    }
    return normalized;
  }

  private generateRecordNo(kind: BusinessFinanceKind) {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    return `FIN-${kind === BusinessFinanceKind.LOAN ? "LOAN" : "REIMB"}-${date}-${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  }

  private financeKindLabel(kind: BusinessFinanceKind) {
    return kind === BusinessFinanceKind.LOAN ? "借款记录" : "报销记录";
  }
}
