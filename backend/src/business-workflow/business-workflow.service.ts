import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
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
  UserRole,
  UserStatus,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { Response } from "express";

import { PublicUser } from "../users/user.presenter";
import { BusinessMattersService } from "../business-matters/business-matters.service";
import { PrismaService } from "../prisma/prisma.service";
import { AttachFinanceDocumentsDto } from "./dto/attach-finance-documents.dto";
import { AttachBusinessDocumentsDto } from "./dto/attach-business-documents.dto";
import { CreateBusinessFinanceRecordDto } from "./dto/create-business-finance-record.dto";
import { CreateBusinessFollowUpDto } from "./dto/create-business-follow-up.dto";
import { CreateBusinessTaskDto } from "./dto/create-business-task.dto";
import { ListBusinessFollowUpsDto } from "./dto/list-business-follow-ups.dto";
import { ListBusinessFinanceRecordsDto } from "./dto/list-business-finance-records.dto";
import { ListBusinessTasksDto } from "./dto/list-business-tasks.dto";
import { ResponsibilityReportDto } from "./dto/responsibility-report.dto";
import { UpdateBusinessFinanceRecordDto } from "./dto/update-business-finance-record.dto";
import { UpdateBusinessTaskDto } from "./dto/update-business-task.dto";
import { UpsertBusinessContractDto } from "./dto/upsert-business-contract.dto";

const personSelect = { id: true, username: true, realName: true } satisfies Prisma.UserSelect;

type ActivityScalar = string | number | boolean | null;
type ActivityChange = { field: string; before: ActivityScalar; after: ActivityScalar };
type ActivityMetadata = {
  objectType: string;
  objectId: string;
  changes?: ActivityChange[];
  snapshot?: Record<string, ActivityScalar>;
  related?: Record<string, ActivityScalar>;
};

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
    const assigneeName = this.optionalText(dto.assigneeName);
    this.validateExclusivePerson("任务负责人", dto.assigneeId, assigneeName);
    const assigneeId = assigneeName ? null : dto.assigneeId ?? matter.ownerId;
    if (assigneeId) {
      await this.ensureResponsibleUser(assigneeId, user, "任务负责人");
    }
    const title = this.normalizeText(dto.title, "任务标题不能为空");
    const status: BusinessTaskStatus = dto.status === undefined ? BusinessTaskStatus.TODO : dto.status;
    if (!this.isInitialTaskStatus(status)) {
      throw new BadRequestException("新建任务只能处于待处理或进行中状态");
    }
    const completionNote = this.optionalText(dto.completionNote);
    const cancellationReason = this.optionalText(dto.cancellationReason);
    this.validateTaskOutcome(status, completionNote, cancellationReason);
    const task = await this.prisma.businessMatterTask.create({
      data: {
        matterId,
        title,
        description: this.optionalText(dto.description),
        status,
        priority: dto.priority ?? BusinessTaskPriority.NORMAL,
        progress: dto.progress ?? 0,
        dueDate: this.toDate(dto.dueDate),
        startedAt: status === BusinessTaskStatus.IN_PROGRESS ? new Date() : null,
        completedAt: null,
        completedById: null,
        completionNote,
        cancelledAt: null,
        cancelledById: null,
        cancellationReason,
        assigneeId,
        assigneeName,
        createdById: user.id,
      },
      include: this.taskInclude(),
    });
    await this.logActivity(matterId, user, BusinessActivityAction.TASK_CREATED, `创建跟进任务“${title}”`, {
      objectType: "TASK",
      objectId: task.id,
      snapshot: {
        title: task.title,
        status: task.status,
        priority: task.priority,
        assigneeId: task.assigneeId,
        dueDate: this.activityValue(task.dueDate),
      },
    });
    return task;
  }

  async updateTask(matterId: string, taskId: string, dto: UpdateBusinessTaskDto, user: PublicUser) {
    await this.businessMatters.requireEditableForRelatedData(matterId, user);
    const task = await this.requireTask(matterId, taskId);
    if (dto.assigneeId !== undefined && dto.assigneeId !== null) {
      if (user.role !== UserRole.ADMIN) {
        throw new ForbiddenException("只有管理员可以调整任务负责人");
      }
      await this.ensureActiveUser(dto.assigneeId);
    }
    const assigneeName = dto.assigneeName === undefined ? undefined : this.optionalText(dto.assigneeName);
    this.validateExclusivePerson("任务负责人", dto.assigneeId, assigneeName);
    const nextStatus = dto.status ?? task.status;
    this.validateTaskStatusTransition(task.status, nextStatus);
    const completionNote = dto.completionNote === undefined ? task.completionNote : this.optionalText(dto.completionNote);
    const cancellationReason = dto.cancellationReason === undefined ? task.cancellationReason : this.optionalText(dto.cancellationReason);
    if (nextStatus === BusinessTaskStatus.COMPLETED && task.status !== BusinessTaskStatus.COMPLETED) {
      this.requireTaskActor(task, user);
    }
    if (nextStatus === BusinessTaskStatus.CANCELLED && task.status !== BusinessTaskStatus.CANCELLED) {
      this.requireTaskActor(task, user);
    }
    this.validateTaskOutcome(nextStatus, completionNote, cancellationReason, task.status);
    const data: Prisma.BusinessMatterTaskUpdateInput = {
      title: dto.title === undefined ? undefined : this.normalizeText(dto.title, "任务标题不能为空"),
      description: dto.description === undefined ? undefined : this.optionalText(dto.description),
      priority: dto.priority,
      status: dto.status,
      progress: nextStatus === BusinessTaskStatus.COMPLETED ? 100 : dto.progress,
      dueDate: dto.dueDate === undefined ? undefined : this.toDate(dto.dueDate),
      startedAt: nextStatus === BusinessTaskStatus.IN_PROGRESS && !task.startedAt ? new Date() : undefined,
      completionNote: dto.completionNote === undefined ? undefined : completionNote,
      cancellationReason: dto.cancellationReason === undefined ? undefined : cancellationReason,
      completedBy: nextStatus === BusinessTaskStatus.COMPLETED && task.status !== BusinessTaskStatus.COMPLETED
        ? { connect: { id: user.id } }
        : undefined,
      cancelledBy: nextStatus === BusinessTaskStatus.CANCELLED && task.status !== BusinessTaskStatus.CANCELLED
        ? { connect: { id: user.id } }
        : undefined,
      assignee: dto.assigneeId !== undefined
        ? dto.assigneeId === null
          ? { disconnect: true }
          : { connect: { id: dto.assigneeId } }
        : dto.assigneeName !== undefined
          ? { disconnect: true }
          : undefined,
      assigneeName: dto.assigneeId !== undefined
        ? null
        : dto.assigneeName === undefined
          ? undefined
          : assigneeName,
      completedAt: dto.status === undefined
        ? undefined
        : nextStatus === BusinessTaskStatus.COMPLETED
          ? task.completedAt ?? new Date()
          : null,
      cancelledAt: dto.status === undefined
        ? undefined
        : nextStatus === BusinessTaskStatus.CANCELLED
          ? task.cancelledAt ?? new Date()
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
    await this.logActivity(matterId, user, action, `更新跟进任务“${updated.title}”`, {
      objectType: "TASK",
      objectId: updated.id,
      changes: this.activityChanges([
        ["任务标题", task.title, updated.title],
        ["状态", task.status, updated.status],
        ["优先级", task.priority, updated.priority],
        ["进度", task.progress, updated.progress],
        ["负责人", task.assigneeId, updated.assigneeId],
        ["自定义负责人", task.assigneeName, updated.assigneeName],
        ["截止日期", task.dueDate, updated.dueDate],
        ["完成说明", task.completionNote, updated.completionNote],
        ["完成时间", task.completedAt, updated.completedAt],
        ["完成人", task.completedById, updated.completedById],
        ["取消原因", task.cancellationReason, updated.cancellationReason],
        ["取消时间", task.cancelledAt, updated.cancelledAt],
        ["取消人", task.cancelledById, updated.cancelledById],
      ]),
    });
    return updated;
  }

  async attachTaskDocuments(
    matterId: string,
    taskId: string,
    dto: AttachBusinessDocumentsDto,
    user: PublicUser,
  ) {
    await this.businessMatters.requireEditableForRelatedData(matterId, user);
    await this.requireTask(matterId, taskId);
    const documentIds = [...new Set(dto.documentIds)];
    const documents = await this.prisma.document.findMany({
      where: { id: { in: documentIds }, deletedAt: null, status: { not: DocumentStatus.DELETED } },
      select: { id: true, currentVersionId: true },
    });
    if (documents.length !== documentIds.length) {
      throw new BadRequestException("存在不存在或已删除的任务附件");
    }
    const existing = await this.prisma.businessMatterTaskDocument.findMany({
      where: { taskId, documentId: { in: documentIds } },
      select: { documentId: true },
    });
    if (existing.length) {
      throw new ConflictException("所选附件中包含已关联文件");
    }
    const result = await this.prisma.businessMatterTaskDocument.createMany({
      data: documents.map((document) => ({
        taskId,
        documentId: document.id,
        versionId: document.currentVersionId,
        relationType: this.optionalText(dto.relationType) ?? "ATTACHMENT",
      })),
    });
    await this.logActivity(matterId, user, BusinessActivityAction.TASK_DOCUMENT_ATTACHED, `为跟进任务关联 ${result.count} 份附件`, {
      objectType: "TASK_DOCUMENT_LINK",
      objectId: taskId,
      related: { documentCount: result.count },
    });
    return { taskId, addedCount: result.count };
  }

  async detachTaskDocument(matterId: string, taskId: string, documentId: string, user: PublicUser) {
    await this.businessMatters.requireEditableForRelatedData(matterId, user);
    await this.requireTask(matterId, taskId);
    const link = await this.prisma.businessMatterTaskDocument.findFirst({ where: { taskId, documentId } });
    if (!link) {
      throw new NotFoundException("任务附件关联不存在");
    }
    const result = await this.prisma.businessMatterTaskDocument.delete({
      where: { taskId_documentId: { taskId, documentId } },
    });
    await this.logActivity(matterId, user, BusinessActivityAction.TASK_DOCUMENT_DETACHED, "取消跟进任务附件关联", {
      objectType: "TASK_DOCUMENT_LINK",
      objectId: taskId,
      related: { documentId },
    });
    return result;
  }

  async removeTask(matterId: string, taskId: string, user: PublicUser) {
    await this.businessMatters.requireEditableForRelatedData(matterId, user);
    const task = await this.requireTask(matterId, taskId);
    const result = await this.prisma.businessMatterTask.update({
      where: { id: task.id },
      data: { deletedAt: new Date() },
    });
    await this.logActivity(matterId, user, BusinessActivityAction.TASK_DELETED, `删除跟进任务“${task.title}”`, {
      objectType: "TASK",
      objectId: task.id,
      snapshot: { title: task.title, status: task.status, assigneeId: task.assigneeId },
    });
    return result;
  }

  async listFollowUps(matterId: string, query: ListBusinessFollowUpsDto) {
    await this.businessMatters.requireReadable(matterId);
    const where: Prisma.BusinessMatterFollowUpWhereInput = {
      matterId,
      deletedAt: null,
      nextAssigneeId: query.nextAssigneeId,
    };
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.businessMatterFollowUp.findMany({
        where,
        include: this.followUpInclude(),
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.businessMatterFollowUp.count({ where }),
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

  async createFollowUp(matterId: string, dto: CreateBusinessFollowUpDto, user: PublicUser) {
    await this.businessMatters.requireEditableForRelatedData(matterId, user);
    const content = this.normalizeText(dto.content, "跟进内容不能为空");
    const nextAssigneeId = dto.nextAssigneeId?.trim() || null;
    const nextAssigneeName = this.optionalText(dto.nextAssigneeName);
    this.validateExclusivePerson("下一责任人", nextAssigneeId, nextAssigneeName);
    const nextDueAt = this.toDate(dto.nextDueAt);
    if (nextDueAt && !nextAssigneeId && !nextAssigneeName) {
      throw new BadRequestException("填写下一次跟进时间时必须指定下一责任人");
    }
    if (nextAssigneeId) {
      if (user.role !== UserRole.ADMIN && nextAssigneeId !== user.id) {
        throw new ForbiddenException("普通员工不能指定其他人的下一次跟进");
      }
      await this.ensureActiveUser(nextAssigneeId);
    }
    const followUp = await this.prisma.businessMatterFollowUp.create({
      data: {
        method: dto.method,
        content,
        result: this.optionalText(dto.result),
        nextAction: this.optionalText(dto.nextAction),
        nextAssigneeId,
        nextAssigneeName,
        nextDueAt,
        matterId,
        createdById: user.id,
      },
      include: this.followUpInclude(),
    });
    await this.logActivity(
      matterId,
      user,
      BusinessActivityAction.FOLLOW_UP_CREATED,
      `记录一次${this.followUpMethodLabel(dto.method)}跟进`,
      {
        objectType: "FOLLOW_UP",
        objectId: followUp.id,
        snapshot: {
          method: followUp.method,
          nextAssigneeId: followUp.nextAssigneeId,
          nextAssigneeName: followUp.nextAssigneeName,
          nextDueAt: this.activityValue(followUp.nextDueAt),
        },
      },
    );
    return followUp;
  }

  async attachFollowUpDocuments(
    matterId: string,
    followUpId: string,
    dto: AttachBusinessDocumentsDto,
    user: PublicUser,
  ) {
    await this.businessMatters.requireEditableForRelatedData(matterId, user);
    await this.requireFollowUp(matterId, followUpId);
    const documentIds = [...new Set(dto.documentIds)];
    const documents = await this.prisma.document.findMany({
      where: { id: { in: documentIds }, deletedAt: null, status: { not: DocumentStatus.DELETED } },
      select: { id: true, currentVersionId: true },
    });
    if (documents.length !== documentIds.length) {
      throw new BadRequestException("存在不存在或已删除的跟进附件");
    }
    const existing = await this.prisma.businessMatterFollowUpDocument.findMany({
      where: { followUpId, documentId: { in: documentIds } },
      select: { documentId: true },
    });
    if (existing.length) {
      throw new ConflictException("所选附件中包含已关联文件");
    }
    const result = await this.prisma.businessMatterFollowUpDocument.createMany({
      data: documents.map((document) => ({
        followUpId,
        documentId: document.id,
        versionId: document.currentVersionId,
        relationType: this.optionalText(dto.relationType) ?? "ATTACHMENT",
      })),
    });
    await this.logActivity(matterId, user, BusinessActivityAction.FOLLOW_UP_DOCUMENT_ATTACHED, `为人工跟进关联 ${result.count} 份附件`, {
      objectType: "FOLLOW_UP_DOCUMENT_LINK",
      objectId: followUpId,
      related: { documentCount: result.count },
    });
    return { followUpId, addedCount: result.count };
  }

  async detachFollowUpDocument(matterId: string, followUpId: string, documentId: string, user: PublicUser) {
    await this.businessMatters.requireEditableForRelatedData(matterId, user);
    await this.requireFollowUp(matterId, followUpId);
    const link = await this.prisma.businessMatterFollowUpDocument.findFirst({ where: { followUpId, documentId } });
    if (!link) {
      throw new NotFoundException("跟进附件关联不存在");
    }
    const result = await this.prisma.businessMatterFollowUpDocument.delete({
      where: { followUpId_documentId: { followUpId, documentId } },
    });
    await this.logActivity(matterId, user, BusinessActivityAction.FOLLOW_UP_DOCUMENT_DETACHED, "取消人工跟进附件关联", {
      objectType: "FOLLOW_UP_DOCUMENT_LINK",
      objectId: followUpId,
      related: { documentId },
    });
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
      select: {
        id: true,
        contractNo: true,
        partyName: true,
        signedAt: true,
        effectiveAt: true,
        expiresAt: true,
        renewalNoticeDays: true,
        amount: true,
        status: true,
        remark: true,
      },
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
    await this.logActivity(matterId, user, BusinessActivityAction.CONTRACT_UPDATED, "更新合同信息", {
      objectType: "CONTRACT",
      objectId: contract.id,
      changes: this.activityChanges([
        ["合同编号", existing?.contractNo, contract.contractNo],
        ["合同相对方", existing?.partyName, contract.partyName],
        ["签署日期", existing?.signedAt, contract.signedAt],
        ["生效日期", existing?.effectiveAt, contract.effectiveAt],
        ["到期日期", existing?.expiresAt, contract.expiresAt],
        ["提前提醒天数", existing?.renewalNoticeDays, contract.renewalNoticeDays],
        ["合同金额", existing?.amount, contract.amount],
        ["状态", existing?.status, contract.status],
        ["备注", existing?.remark, contract.remark],
      ]),
    });
    return contract;
  }

  async removeContract(matterId: string, user: PublicUser) {
    await this.businessMatters.requireEditableForRelatedData(matterId, user);
    const contract = await this.prisma.businessMatterContract.findUnique({ where: { matterId } });
    if (!contract) {
      throw new NotFoundException("合同信息不存在");
    }
    const result = await this.prisma.businessMatterContract.delete({ where: { matterId } });
    await this.logActivity(matterId, user, BusinessActivityAction.CONTRACT_DELETED, "删除合同信息", {
      objectType: "CONTRACT",
      objectId: contract.id,
      snapshot: {
        contractNo: contract.contractNo,
        partyName: contract.partyName,
        status: contract.status,
        amount: this.activityValue(contract.amount),
      },
    });
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
    const status: BusinessFinanceStatus = dto.status === undefined ? BusinessFinanceStatus.DRAFT : dto.status;
    if (!this.isInitialFinanceStatus(status)) {
      throw new BadRequestException("新建财务记录只能处于草稿或待处理状态");
    }
    const applicantName = this.optionalText(dto.applicantName);
    const handlerName = this.optionalText(dto.handlerName);
    const approverName = this.optionalText(dto.approverName);
    const payerName = this.optionalText(dto.payerName);
    const settlementOwnerName = this.optionalText(dto.settlementOwnerName);
    this.validateExclusivePerson("申请人", dto.applicantId, applicantName);
    this.validateExclusivePerson("经办负责人", dto.handlerId, handlerName);
    this.validateExclusivePerson("审批负责人", dto.approverId, approverName);
    this.validateExclusivePerson("付款负责人", dto.payerId, payerName);
    this.validateExclusivePerson("结算负责人", dto.settlementOwnerId, settlementOwnerName);
    const applicantId = applicantName ? null : dto.applicantId ?? user.id;
    const handlerId = handlerName ? null : dto.handlerId ?? user.id;
    if (applicantId) await this.ensureResponsibleUser(applicantId, user, "申请人");
    if (handlerId) await this.ensureResponsibleUser(handlerId, user, "经办负责人");
    await this.ensureOptionalResponsibleUser(dto.approverId, "审批负责人");
    await this.ensureOptionalResponsibleUser(dto.payerId, "付款负责人");
    await this.ensureOptionalResponsibleUser(dto.settlementOwnerId, "结算负责人");
    const record = await this.prisma.businessMatterFinanceRecord.create({
      data: {
        matterId,
        recordNo: this.normalizeRecordNo(dto.recordNo) ?? this.generateRecordNo(dto.kind),
        kind: dto.kind,
        status,
        title,
        amount: this.requireAmount(dto.amount),
        currency: this.normalizeCurrency(dto.currency),
        applicantId,
        applicantName,
        handlerId,
        handlerName,
        approverId: dto.approverId ?? null,
        approverName,
        payerId: dto.payerId ?? null,
        payerName,
        settlementOwnerId: dto.settlementOwnerId ?? null,
        settlementOwnerName,
        occurredAt: this.toDate(dto.occurredAt),
        counterparty: this.optionalText(dto.counterparty),
        dueDate: this.toDate(dto.dueDate),
        settledAt: this.toDate(dto.settledAt),
        remark: this.optionalText(dto.remark),
        rejectionReason: this.optionalText(dto.rejectionReason),
        settlementNote: this.optionalText(dto.settlementNote),
        createdById: user.id,
      },
      include: this.financeInclude(),
    });
    await this.logActivity(matterId, user, BusinessActivityAction.FINANCE_CREATED, `创建${this.financeKindLabel(dto.kind)}“${title}”`, {
      objectType: "FINANCE_RECORD",
      objectId: record.id,
      snapshot: {
        recordNo: record.recordNo,
        kind: record.kind,
        status: record.status,
        title: record.title,
        amount: this.activityValue(record.amount),
        applicantId: record.applicantId,
        applicantName: record.applicantName,
        handlerId: record.handlerId,
        handlerName: record.handlerName,
        approverId: record.approverId,
        approverName: record.approverName,
        payerId: record.payerId,
        payerName: record.payerName,
        settlementOwnerId: record.settlementOwnerId,
        settlementOwnerName: record.settlementOwnerName,
      },
    });
    return record;
  }

  async updateFinanceRecord(matterId: string, recordId: string, dto: UpdateBusinessFinanceRecordDto, user: PublicUser) {
    await this.businessMatters.requireEditableForRelatedData(matterId, user);
    const record = await this.requireFinanceRecord(matterId, recordId);
    const nextStatus = dto.status ?? record.status;
    this.validateFinanceStatusTransition(record.status, nextStatus);
    const responsibilityData = await this.buildFinanceResponsibilityData(dto, user);
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
      rejectionReason: dto.rejectionReason === undefined ? undefined : this.optionalText(dto.rejectionReason),
      settlementNote: dto.settlementNote === undefined ? undefined : this.optionalText(dto.settlementNote),
      ...responsibilityData,
    };
    if (nextStatus !== record.status && nextStatus === BusinessFinanceStatus.APPROVED) {
      this.requireFinanceActor({ ...record, approverId: dto.approverId === undefined ? record.approverId : dto.approverId }, "approverId", user, "审批负责人");
      data.approvedAt = new Date();
      data.approvedBy = { connect: { id: user.id } };
    }
    if (nextStatus !== record.status && nextStatus === BusinessFinanceStatus.PAID) {
      this.requireFinanceActor({ ...record, payerId: dto.payerId === undefined ? record.payerId : dto.payerId }, "payerId", user, "付款负责人");
      data.paidAt = new Date();
      data.paidBy = { connect: { id: user.id } };
    }
    if (nextStatus !== record.status && nextStatus === BusinessFinanceStatus.REJECTED) {
      this.requireFinanceActor({ ...record, approverId: dto.approverId === undefined ? record.approverId : dto.approverId }, "approverId", user, "审批负责人");
      const rejectionReason = this.optionalText(dto.rejectionReason);
      if (!rejectionReason) {
        throw new BadRequestException("拒绝财务记录时必须填写拒绝原因");
      }
      data.rejectionReason = rejectionReason;
      data.rejectedAt = new Date();
      data.rejectedBy = { connect: { id: user.id } };
    }
    if (nextStatus !== record.status && nextStatus === BusinessFinanceStatus.SETTLED) {
      this.requireFinanceActor({ ...record, settlementOwnerId: dto.settlementOwnerId === undefined ? record.settlementOwnerId : dto.settlementOwnerId }, "settlementOwnerId", user, "结算负责人");
      const settlementNote = this.optionalText(dto.settlementNote);
      if (!settlementNote) {
        throw new BadRequestException("结清财务记录时必须填写结算说明");
      }
      data.settlementNote = settlementNote;
    }
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
    await this.logActivity(matterId, user, BusinessActivityAction.FINANCE_UPDATED, `更新${this.financeKindLabel(dto.kind ?? record.kind)}“${updated.title}”`, {
      objectType: "FINANCE_RECORD",
      objectId: updated.id,
      changes: this.activityChanges([
        ["记录类型", record.kind, updated.kind],
        ["标题", record.title, updated.title],
        ["金额", record.amount, updated.amount],
        ["币种", record.currency, updated.currency],
        ["状态", record.status, updated.status],
        ["申请人", record.applicantId, updated.applicantId],
        ["自定义申请人", record.applicantName, updated.applicantName],
        ["经办负责人", record.handlerId, updated.handlerId],
        ["自定义经办负责人", record.handlerName, updated.handlerName],
        ["审批负责人", record.approverId, updated.approverId],
        ["自定义审批负责人", record.approverName, updated.approverName],
        ["付款负责人", record.payerId, updated.payerId],
        ["自定义付款负责人", record.payerName, updated.payerName],
        ["结算负责人", record.settlementOwnerId, updated.settlementOwnerId],
        ["自定义结算负责人", record.settlementOwnerName, updated.settlementOwnerName],
        ["应结日期", record.dueDate, updated.dueDate],
        ["结清日期", record.settledAt, updated.settledAt],
        ["拒绝原因", record.rejectionReason, updated.rejectionReason],
        ["结算说明", record.settlementNote, updated.settlementNote],
      ]),
      related: {
        recordNo: updated.recordNo,
      },
    });
    return updated;
  }

  async removeFinanceRecord(matterId: string, recordId: string, user: PublicUser) {
    await this.businessMatters.requireEditableForRelatedData(matterId, user);
    const record = await this.requireFinanceRecord(matterId, recordId);
    const result = await this.prisma.businessMatterFinanceRecord.update({
      where: { id: record.id },
      data: { deletedAt: new Date() },
    });
    await this.logActivity(matterId, user, BusinessActivityAction.FINANCE_DELETED, `删除财务记录“${record.title}”`, {
      objectType: "FINANCE_RECORD",
      objectId: record.id,
      snapshot: {
        recordNo: record.recordNo,
        kind: record.kind,
        status: record.status,
        title: record.title,
        amount: this.activityValue(record.amount),
        handlerId: record.handlerId,
      },
    });
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
    await this.logActivity(matterId, user, BusinessActivityAction.FINANCE_DOCUMENT_ATTACHED, `为财务记录关联 ${result.count} 份凭证`, {
      objectType: "FINANCE_DOCUMENT_LINK",
      objectId: recordId,
      related: { documentCount: result.count },
    });
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
    await this.logActivity(matterId, user, BusinessActivityAction.FINANCE_DOCUMENT_DETACHED, "取消财务凭证关联", {
      objectType: "FINANCE_DOCUMENT_LINK",
      objectId: recordId,
      related: { documentId },
    });
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
    const activeFollowUpWhere: Prisma.BusinessMatterFollowUpWhereInput = {
      deletedAt: null,
      nextAssigneeId: user.id,
      nextDueAt: { not: null },
      matter: { deletedAt: null },
    };
    const contractWhere: Prisma.BusinessMatterContractWhereInput = {
      expiresAt: { not: null, lte: nextSevenDays },
      status: { in: [BusinessContractStatus.DRAFT, BusinessContractStatus.ACTIVE] },
      matter: { deletedAt: null },
    };
    const [matterTotal, matterInProgress, taskPending, taskOverdue, taskDueSoon, followUpPending, followUpOverdue, followUpDueSoon, contractDueSoon, loan, reimbursement] = await Promise.all([
      this.prisma.businessMatter.count({ where: { deletedAt: null } }),
      this.prisma.businessMatter.count({ where: { deletedAt: null, status: BusinessMatterStatus.IN_PROGRESS } }),
      this.prisma.businessMatterTask.count({ where: activeTaskWhere }),
      this.prisma.businessMatterTask.count({ where: { ...activeTaskWhere, dueDate: { lt: now } } }),
      this.prisma.businessMatterTask.count({ where: { ...activeTaskWhere, dueDate: { gte: now, lte: nextSevenDays } } }),
      this.prisma.businessMatterFollowUp.count({ where: activeFollowUpWhere }),
      this.prisma.businessMatterFollowUp.count({ where: { ...activeFollowUpWhere, nextDueAt: { lt: now } } }),
      this.prisma.businessMatterFollowUp.count({ where: { ...activeFollowUpWhere, nextDueAt: { gte: now, lte: nextSevenDays } } }),
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
      followUps: { pending: followUpPending, overdue: followUpOverdue, dueSoon: followUpDueSoon },
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
    const [tasks, contracts, followUps] = await Promise.all([
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
      this.prisma.businessMatterFollowUp.findMany({
        where: {
          deletedAt: null,
          nextAssigneeId: user.id,
          nextDueAt: { not: null, lte: nextSevenDays },
          matter: { deletedAt: null },
        },
        include: { matter: { select: { id: true, title: true, matterNo: true } } },
        orderBy: { nextDueAt: "asc" },
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
        ...followUps.map((followUp) => ({
          kind: "FOLLOW_UP" as const,
          id: followUp.id,
          title: `跟进：${followUp.content.slice(0, 80)}`,
          dueAt: followUp.nextDueAt,
          overdue: Boolean(followUp.nextDueAt && followUp.nextDueAt < now),
          matter: followUp.matter,
        })),
      ].sort((left, right) => (left.dueAt?.getTime() ?? 0) - (right.dueAt?.getTime() ?? 0)),
    };
  }

  async getResponsibilityReport(query: ResponsibilityReportDto) {
    const dateRange = this.reportDateRange(query);
    const now = new Date();
    const [users, taskGroups, overdueTaskGroups, handledGroups, approvedGroups, paidGroups, settledGroups, createdFollowUpGroups, overdueFollowUpGroups] = await Promise.all([
      this.prisma.user.findMany({
        where: { deletedAt: null, id: query.userId },
        select: { id: true, username: true, realName: true },
        orderBy: { realName: "asc" },
      }),
      this.prisma.businessMatterTask.groupBy({
        by: ["assigneeId", "status"],
        where: { deletedAt: null, assigneeId: { not: null }, matter: { deletedAt: null }, ...(dateRange ? { createdAt: dateRange } : {}) },
        _count: { _all: true },
      }),
      this.prisma.businessMatterTask.groupBy({
        by: ["assigneeId"],
        where: {
          deletedAt: null,
          assigneeId: { not: null },
          status: { in: [BusinessTaskStatus.TODO, BusinessTaskStatus.IN_PROGRESS] },
          dueDate: { lt: now, ...(dateRange ?? {}) },
          matter: { deletedAt: null },
        },
        _count: { _all: true },
      }),
      this.prisma.businessMatterFinanceRecord.groupBy({
        by: ["handlerId", "kind"],
        where: { deletedAt: null, handlerId: { not: null }, matter: { deletedAt: null }, ...(dateRange ? { createdAt: dateRange } : {}) },
        _count: { _all: true },
      }),
      this.prisma.businessMatterFinanceRecord.groupBy({
        by: ["approvedById"],
        where: { deletedAt: null, approvedById: { not: null }, approvedAt: dateRange ?? { not: null }, matter: { deletedAt: null } },
        _count: { _all: true },
      }),
      this.prisma.businessMatterFinanceRecord.groupBy({
        by: ["paidById"],
        where: { deletedAt: null, paidById: { not: null }, paidAt: dateRange ?? { not: null }, matter: { deletedAt: null } },
        _count: { _all: true },
      }),
      this.prisma.businessMatterFinanceRecord.groupBy({
        by: ["settlementOwnerId"],
        where: {
          deletedAt: null,
          settlementOwnerId: { not: null },
          status: BusinessFinanceStatus.SETTLED,
          settledAt: dateRange ?? { not: null },
          matter: { deletedAt: null },
        },
        _count: { _all: true },
      }),
      this.prisma.businessMatterFollowUp.groupBy({
        by: ["createdById"],
        where: { deletedAt: null, matter: { deletedAt: null }, ...(dateRange ? { createdAt: dateRange } : {}) },
        _count: { _all: true },
      }),
      this.prisma.businessMatterFollowUp.groupBy({
        by: ["nextAssigneeId"],
        where: {
          deletedAt: null,
          nextAssigneeId: { not: null },
          nextDueAt: { lt: now, ...(dateRange ?? {}) },
          matter: { deletedAt: null },
        },
        _count: { _all: true },
      }),
    ]);

    const items = users.map((person) => ({
      userId: person.id,
      username: person.username,
      realName: person.realName,
      tasks: { pending: 0, completed: 0, overdue: 0 },
      finance: { loansHandled: 0, reimbursementsHandled: 0, approved: 0, paid: 0, settled: 0 },
      followUps: { created: 0, overdue: 0 },
    }));
    const rows = new Map(items.map((item) => [item.userId, item]));
    const count = (value: { _count?: unknown }) => {
      if (value._count && typeof value._count === "object" && "_all" in value._count) {
        return (value._count as { _all?: number })._all ?? 0;
      }
      return 0;
    };

    for (const group of taskGroups) {
      const row = group.assigneeId ? rows.get(group.assigneeId) : undefined;
      if (!row) continue;
      if (group.status === BusinessTaskStatus.COMPLETED) row.tasks.completed += count(group);
      if (group.status === BusinessTaskStatus.TODO || group.status === BusinessTaskStatus.IN_PROGRESS) row.tasks.pending += count(group);
    }
    for (const group of overdueTaskGroups) {
      const row = group.assigneeId ? rows.get(group.assigneeId) : undefined;
      if (row) row.tasks.overdue += count(group);
    }
    for (const group of handledGroups) {
      const row = group.handlerId ? rows.get(group.handlerId) : undefined;
      if (!row) continue;
      if (group.kind === BusinessFinanceKind.LOAN) row.finance.loansHandled += count(group);
      if (group.kind === BusinessFinanceKind.REIMBURSEMENT) row.finance.reimbursementsHandled += count(group);
    }
    for (const group of approvedGroups) {
      const row = group.approvedById ? rows.get(group.approvedById) : undefined;
      if (row) row.finance.approved += count(group);
    }
    for (const group of paidGroups) {
      const row = group.paidById ? rows.get(group.paidById) : undefined;
      if (row) row.finance.paid += count(group);
    }
    for (const group of settledGroups) {
      const row = group.settlementOwnerId ? rows.get(group.settlementOwnerId) : undefined;
      if (row) row.finance.settled += count(group);
    }
    for (const group of createdFollowUpGroups) {
      const row = rows.get(group.createdById);
      if (row) row.followUps.created += count(group);
    }
    for (const group of overdueFollowUpGroups) {
      const row = group.nextAssigneeId ? rows.get(group.nextAssigneeId) : undefined;
      if (row) row.followUps.overdue += count(group);
    }

    return {
      generatedAt: now,
      filters: { dateFrom: query.dateFrom ?? null, dateTo: query.dateTo ?? null, userId: query.userId ?? null },
      items,
    };
  }

  async exportResponsibilityReport(query: ResponsibilityReportDto, response: Response) {
    const report = await this.getResponsibilityReport(query);
    const headers = ["员工", "账号", "待处理任务", "已完成任务", "逾期任务", "借款经办", "报销经办", "审批数", "付款数", "结算数", "人工跟进", "逾期跟进"];
    const rows = report.items.map((item) => [
      item.realName,
      item.username,
      item.tasks.pending,
      item.tasks.completed,
      item.tasks.overdue,
      item.finance.loansHandled,
      item.finance.reimbursementsHandled,
      item.finance.approved,
      item.finance.paid,
      item.finance.settled,
      item.followUps.created,
      item.followUps.overdue,
    ]);
    const csv = [headers, ...rows].map((row) => row.map((value) => this.csvValue(value)).join(",")).join("\r\n");
    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader("Content-Disposition", "attachment; filename*=UTF-8''responsibility-report.csv");
    return response.send(`\uFEFF${csv}`);
  }

  private reportDateRange(query: ResponsibilityReportDto) {
    const from = query.dateFrom ? this.parseReportDate(query.dateFrom, "统计开始日期", false) : undefined;
    const to = query.dateTo ? this.parseReportDate(query.dateTo, "统计结束日期", true) : undefined;
    if (from && to && from > to) {
      throw new BadRequestException("统计开始日期不能晚于结束日期");
    }
    if (!from && !to) return undefined;
    return { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
  }

  private parseReportDate(value: string, label: string, endOfDay: boolean) {
    const normalized = value.length === 10
      ? `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`
      : value;
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${label}格式无效`);
    }
    return date;
  }

  private csvValue(value: unknown) {
    const text = String(value ?? "");
    const protectedText = /^[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${protectedText.replaceAll('"', '""')}"`;
  }

  private async requireTask(matterId: string, taskId: string) {
    const task = await this.prisma.businessMatterTask.findFirst({ where: { id: taskId, matterId, deletedAt: null } });
    if (!task) {
      throw new NotFoundException("跟进任务不存在");
    }
    return task;
  }

  private async requireFollowUp(matterId: string, followUpId: string) {
    const followUp = await this.prisma.businessMatterFollowUp.findFirst({ where: { id: followUpId, matterId, deletedAt: null } });
    if (!followUp) {
      throw new NotFoundException("人工跟进记录不存在");
    }
    return followUp;
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

  private async ensureResponsibleUser(userId: string, user: PublicUser, label: string) {
    if (user.role !== UserRole.ADMIN && userId !== user.id) {
      throw new ForbiddenException(`普通员工不能指定其他人的${label}`);
    }
    await this.ensureActiveUser(userId);
  }

  private async ensureOptionalResponsibleUser(userId: string | null | undefined, label: string) {
    if (userId) {
      await this.ensureActiveUser(userId);
    }
  }

  private async buildFinanceResponsibilityData(dto: UpdateBusinessFinanceRecordDto, user: PublicUser) {
    const data: Prisma.BusinessMatterFinanceRecordUpdateInput = {};
    const fields = [
      ["applicantId", "applicantName", "applicant", "申请人"],
      ["handlerId", "handlerName", "handler", "经办负责人"],
      ["approverId", "approverName", "approver", "审批负责人"],
      ["payerId", "payerName", "payer", "付款负责人"],
      ["settlementOwnerId", "settlementOwnerName", "settlementOwner", "结算负责人"],
    ] as const;
    for (const [idField, nameField, relation, label] of fields) {
      const value = dto[idField];
      const customName = dto[nameField] === undefined ? undefined : this.optionalText(dto[nameField]);
      this.validateExclusivePerson(label, value, customName);
      if (value === undefined && dto[nameField] === undefined) {
        continue;
      }
      if (value !== undefined && user.role !== UserRole.ADMIN) {
        throw new ForbiddenException(`只有管理员可以调整${label}`);
      }
      if (customName) {
        data[relation] = { disconnect: true } as never;
        data[nameField] = customName as never;
      } else if (value !== undefined) {
        data[nameField] = null as never;
        if (value === null) {
          data[relation] = { disconnect: true } as never;
        } else {
          await this.ensureActiveUser(value);
          data[relation] = { connect: { id: value } } as never;
        }
      } else {
        data[relation] = { disconnect: true } as never;
        data[nameField] = null as never;
      }
    }
    return data;
  }

  private validateExclusivePerson(label: string, id?: string | null, customName?: string | null) {
    if (id && customName) {
      throw new BadRequestException(`${label}不能同时填写系统账号和自定义名称`);
    }
  }

  private requireFinanceActor(
    record: { approverId?: string | null; payerId?: string | null; settlementOwnerId?: string | null },
    field: "approverId" | "payerId" | "settlementOwnerId",
    user: PublicUser,
    label: string,
  ) {
    const assigneeId = record[field];
    if (user.role === UserRole.ADMIN) {
      return;
    }
    if (!assigneeId) {
      throw new BadRequestException(`请先指定${label}`);
    }
    if (assigneeId !== user.id) {
      throw new ForbiddenException(`只有指定的${label}或管理员可以执行此操作`);
    }
  }

  private validateTaskOutcome(
    status: BusinessTaskStatus,
    completionNote: string | null | undefined,
    cancellationReason: string | null | undefined,
    previousStatus?: BusinessTaskStatus,
  ) {
    if (status === BusinessTaskStatus.COMPLETED && previousStatus !== BusinessTaskStatus.COMPLETED && !completionNote) {
      throw new BadRequestException("完成任务时必须填写完成说明");
    }
    if (status === BusinessTaskStatus.CANCELLED && previousStatus !== BusinessTaskStatus.CANCELLED && !cancellationReason) {
      throw new BadRequestException("取消任务时必须填写取消原因");
    }
  }

  private requireTaskActor(task: { assigneeId?: string | null }, user: PublicUser) {
    if (user.role !== UserRole.ADMIN && task.assigneeId !== user.id) {
      throw new ForbiddenException("只有任务负责人或管理员可以结束任务");
    }
  }

  private validateTaskStatusTransition(current: BusinessTaskStatus, next: BusinessTaskStatus) {
    const allowed: Record<BusinessTaskStatus, BusinessTaskStatus[]> = {
      TODO: [BusinessTaskStatus.TODO, BusinessTaskStatus.IN_PROGRESS, BusinessTaskStatus.CANCELLED],
      IN_PROGRESS: [BusinessTaskStatus.IN_PROGRESS, BusinessTaskStatus.COMPLETED, BusinessTaskStatus.CANCELLED],
      COMPLETED: [BusinessTaskStatus.COMPLETED],
      CANCELLED: [BusinessTaskStatus.CANCELLED],
    };
    if (!allowed[current].includes(next)) {
      throw new BadRequestException(`任务状态不能从${current}变更为${next}`);
    }
  }

  private isInitialTaskStatus(status: BusinessTaskStatus) {
    return status === BusinessTaskStatus.TODO || status === BusinessTaskStatus.IN_PROGRESS;
  }

  private validateFinanceStatusTransition(current: BusinessFinanceStatus, next: BusinessFinanceStatus) {
    const allowed: Record<BusinessFinanceStatus, BusinessFinanceStatus[]> = {
      DRAFT: [BusinessFinanceStatus.DRAFT, BusinessFinanceStatus.PENDING, BusinessFinanceStatus.CANCELLED],
      PENDING: [BusinessFinanceStatus.PENDING, BusinessFinanceStatus.APPROVED, BusinessFinanceStatus.REJECTED, BusinessFinanceStatus.CANCELLED],
      APPROVED: [BusinessFinanceStatus.APPROVED, BusinessFinanceStatus.PAID, BusinessFinanceStatus.CANCELLED],
      PAID: [BusinessFinanceStatus.PAID, BusinessFinanceStatus.SETTLED],
      SETTLED: [BusinessFinanceStatus.SETTLED],
      REJECTED: [BusinessFinanceStatus.REJECTED, BusinessFinanceStatus.DRAFT],
      CANCELLED: [BusinessFinanceStatus.CANCELLED],
    };
    if (!allowed[current].includes(next)) {
      throw new BadRequestException(`财务记录状态不能从${current}变更为${next}`);
    }
  }

  private isInitialFinanceStatus(status: BusinessFinanceStatus) {
    return status === BusinessFinanceStatus.DRAFT || status === BusinessFinanceStatus.PENDING;
  }

  private async logActivity(
    matterId: string,
    user: PublicUser,
    action: BusinessActivityAction,
    summary: string,
    metadata?: ActivityMetadata,
  ) {
    await this.prisma.businessMatterActivity.create({
      data: {
        matterId,
        actorId: user.id,
        action,
        summary,
        metadata: metadata as Prisma.InputJsonValue | undefined,
      },
    });
  }

  private activityValue(value: unknown): ActivityScalar {
    if (value === undefined || value === null) {
      return null;
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (value instanceof Prisma.Decimal) {
      return value.toString();
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return value;
    }
    return String(value);
  }

  private activityChanges(entries: Array<[string, unknown, unknown]>): ActivityChange[] {
    return entries.flatMap(([field, before, after]) => {
      const normalizedBefore = this.activityValue(before);
      const normalizedAfter = this.activityValue(after);
      return normalizedBefore === normalizedAfter
        ? []
        : [{ field, before: normalizedBefore, after: normalizedAfter }];
    });
  }

  private taskInclude(): Prisma.BusinessMatterTaskInclude {
    return {
      assignee: { select: personSelect },
      createdBy: { select: personSelect },
      completedBy: { select: personSelect },
      cancelledBy: { select: personSelect },
      documents: {
        include: {
          document: { include: { currentVersion: true, category: true, subcategory: true } },
          version: true,
        },
        orderBy: { createdAt: "desc" },
      },
    };
  }

  private followUpInclude(): Prisma.BusinessMatterFollowUpInclude {
    return {
      createdBy: { select: personSelect },
      nextAssignee: { select: personSelect },
      documents: {
        include: {
          document: { include: { currentVersion: true, category: true, subcategory: true } },
          version: true,
        },
        orderBy: { createdAt: "desc" },
      },
    };
  }

  private financeInclude(): Prisma.BusinessMatterFinanceRecordInclude {
    return {
      createdBy: { select: personSelect },
      applicant: { select: personSelect },
      handler: { select: personSelect },
      approver: { select: personSelect },
      payer: { select: personSelect },
      settlementOwner: { select: personSelect },
      approvedBy: { select: personSelect },
      paidBy: { select: personSelect },
      rejectedBy: { select: personSelect },
      documents: {
        include: {
          document: { include: { currentVersion: true, category: true, subcategory: true } },
          version: true,
        },
        orderBy: { createdAt: "desc" },
      },
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

  private followUpMethodLabel(method: string) {
    const labels: Record<string, string> = {
      CALL: "电话",
      WECHAT: "微信",
      EMAIL: "邮件",
      MEETING: "会议",
      ONSITE: "现场",
      OTHER: "其他",
    };
    return labels[method] ?? "其他";
  }
}
