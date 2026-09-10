import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  BusinessActivityAction,
  BusinessMatterStatus,
  BusinessMilestoneStatus,
  BusinessStageStatus,
  DocumentStatus,
  PartnerStatus,
  Prisma,
  UserRole,
  UserStatus,
} from "@prisma/client";
import { randomUUID } from "node:crypto";

import { PublicUser } from "../users/user.presenter";
import { PrismaService } from "../prisma/prisma.service";
import { AttachBusinessMatterDocumentsDto } from "./dto/attach-business-matter-documents.dto";
import { CreateBusinessMatterDto } from "./dto/create-business-matter.dto";
import { ListBusinessMattersDto } from "./dto/list-business-matters.dto";
import { UpdateBusinessMatterDto } from "./dto/update-business-matter.dto";
import { CreateBusinessMilestoneDto } from "./dto/create-business-milestone.dto";
import { CreateBusinessStageDto } from "./dto/create-business-stage.dto";
import { UpdateBusinessMilestoneDto } from "./dto/update-business-milestone.dto";
import { UpdateBusinessStageDto } from "./dto/update-business-stage.dto";
import { calculateProjectProgress, calculateStageProgress, type ProjectProgressSummary } from "./progress-calculator";

const personSelect = { id: true, username: true, realName: true } satisfies Prisma.UserSelect;

@Injectable()
export class BusinessMattersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateBusinessMatterDto, user: PublicUser) {
    const ownerId = dto.ownerId ?? user.id;
    const ownerName = this.normalizeOptionalLabel(dto.ownerName);
    const departmentName = this.normalizeOptionalLabel(dto.departmentName);
    const partnerName = this.normalizeOptionalLabel(dto.partnerName);
    this.validateDateRange(dto.startDate, dto.endDate);
    this.validateExclusiveReference("负责人", dto.ownerId, ownerName);
    this.validateExclusiveReference("部门", dto.departmentId, departmentName);
    this.validateExclusiveReference("合作单位", dto.partnerId, partnerName);
    await this.ensureReferences({
      ownerId: dto.ownerId,
      departmentId: dto.departmentId,
      partnerId: dto.partnerId,
    });
    if (dto.parentId) {
      await this.ensureParentChain(null, dto.parentId);
    }

    const matter = await this.prisma.businessMatter.create({
      data: {
        matterNo: this.generateMatterNo(),
        title: this.normalizeTitle(dto.title),
        type: dto.type,
        status: dto.status ?? BusinessMatterStatus.PLANNING,
        parentId: dto.parentId ?? null,
        ownerId,
        ownerName,
        createdById: user.id,
        departmentId: dto.departmentId ?? null,
        departmentName,
        partnerId: dto.partnerId ?? null,
        partnerName,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        amount: this.toDecimal(dto.amount),
        remark: dto.remark?.trim() || null,
      },
      include: this.listInclude(),
    });
    await this.logActivity(matter.id, user, BusinessActivityAction.MATTER_CREATED, `创建事项“${matter.title}”`, {
      objectType: "MATTER",
      objectId: matter.id,
      snapshot: {
        matterNo: matter.matterNo,
        title: matter.title,
        type: matter.type,
        status: matter.status,
        ownerId: matter.ownerId,
      },
    });
    return matter;
  }

  async list(query: ListBusinessMattersDto) {
    const where: Prisma.BusinessMatterWhereInput = {
      deletedAt: null,
      type: query.type,
      status: query.status,
      parentId: query.parentId,
      ownerId: query.ownerId,
      departmentId: query.departmentId,
      partnerId: query.partnerId,
      documents: query.documentId ? { some: { documentId: query.documentId } } : undefined,
      OR: query.keyword
        ? [
            { title: { contains: query.keyword, mode: "insensitive" } },
            { matterNo: { contains: query.keyword, mode: "insensitive" } },
            { remark: { contains: query.keyword, mode: "insensitive" } },
            { ownerName: { contains: query.keyword, mode: "insensitive" } },
            { departmentName: { contains: query.keyword, mode: "insensitive" } },
            { partnerName: { contains: query.keyword, mode: "insensitive" } },
          ]
        : undefined,
    };
    const skip = (query.page - 1) * query.pageSize;
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.businessMatter.findMany({
        where,
        include: this.listInclude(),
        orderBy: { [query.sortBy]: query.sortOrder },
        skip,
        take: query.pageSize,
      }),
      this.prisma.businessMatter.count({ where }),
    ]);
    const progressByMatter = await this.progressSummaries(items.map((item) => item.id));
    const enrichedItems = items.map((item) => ({
      ...item,
      progressSummary: progressByMatter.get(item.id) ?? this.emptyProgressSummary(item.status),
    }));

    return {
      items: enrichedItems,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / query.pageSize),
      },
    };
  }

  async findById(id: string) {
    const matter = await this.prisma.businessMatter.findFirst({
      where: { id, deletedAt: null },
      include: this.detailInclude(),
    });
    if (!matter) {
      throw new NotFoundException("事项不存在");
    }
    return matter;
  }

  async getProjectPlan(id: string) {
    const matter = await this.requireReadable(id);
    const [stages, milestones, tasks, contract] = await Promise.all([
      this.prisma.businessMatterStage.findMany({
        where: { matterId: id, deletedAt: null },
        include: { owner: { select: personSelect }, createdBy: { select: personSelect } },
        orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
      }),
      this.prisma.businessMatterMilestone.findMany({
        where: { matterId: id, deletedAt: null },
        include: {
          stage: { select: { id: true, name: true } },
          owner: { select: personSelect },
          createdBy: { select: personSelect },
          completedBy: { select: personSelect },
        },
        orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      }),
      this.prisma.businessMatterTask.findMany({
        where: { matterId: id, deletedAt: null },
        select: { id: true, title: true, stageId: true, milestoneId: true, progress: true, status: true, dueDate: true },
        orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }],
      }),
      this.prisma.businessMatterContract.findUnique({
        where: { matterId: id },
        select: {
          id: true,
          contractNo: true,
          partyName: true,
          expiresAt: true,
          status: true,
        },
      }),
    ]);
    const summary = calculateProjectProgress({
      status: matter.status,
      endDate: matter.endDate,
      stages,
      milestones,
      tasks,
    });
    return {
      summary,
      stages: stages.map((stage) => ({
        ...stage,
        calculatedProgress: calculateStageProgress(stage, tasks),
        taskCount: tasks.filter((task) => task.stageId === stage.id).length,
      })),
      milestones,
      tasks,
      contract,
    };
  }

  async createStage(matterId: string, dto: CreateBusinessStageDto, user: PublicUser) {
    const matter = await this.requireEditable(matterId, user);
    const name = this.normalizeText(dto.name, "阶段名称不能为空");
    const ownerName = this.normalizeOptionalLabel(dto.ownerName);
    this.validateExclusiveReference("阶段负责人", dto.ownerId, ownerName);
    await this.ensureReferences({ ownerId: dto.ownerId ?? undefined });
    this.validateDateRange(dto.startDate, dto.endDate);
    const status = dto.status ?? BusinessStageStatus.PLANNED;
    const stage = await this.prisma.businessMatterStage.create({
      data: {
        matterId,
        name,
        description: this.normalizeOptionalLabel(dto.description),
        status,
        progress: status === BusinessStageStatus.COMPLETED ? 100 : dto.progress ?? 0,
        sort: dto.sort ?? 0,
        startDate: this.toDate(dto.startDate),
        endDate: this.toDate(dto.endDate),
        ownerId: ownerName ? null : dto.ownerId ?? matter.ownerId,
        ownerName,
        createdById: user.id,
      },
      include: this.stageInclude(),
    });
    await this.logActivity(matterId, user, BusinessActivityAction.MATTER_UPDATED, `创建项目阶段“${name}”`, {
      objectType: "STAGE",
      objectId: stage.id,
      snapshot: { name, status, progress: stage.progress, ownerId: stage.ownerId },
    });
    return stage;
  }

  async updateStage(matterId: string, stageId: string, dto: UpdateBusinessStageDto, user: PublicUser) {
    await this.requireEditable(matterId, user);
    const stage = await this.requireStage(matterId, stageId);
    const ownerName = dto.ownerName === undefined ? undefined : this.normalizeOptionalLabel(dto.ownerName);
    this.validateExclusiveReference("阶段负责人", dto.ownerId, ownerName);
    if (dto.ownerId) await this.ensureReferences({ ownerId: dto.ownerId });
    this.validateDateRange(
      dto.startDate === undefined ? stage.startDate : dto.startDate,
      dto.endDate === undefined ? stage.endDate : dto.endDate,
    );
    const nextStatus = dto.status ?? stage.status;
    const data: Prisma.BusinessMatterStageUpdateInput = {
      name: dto.name === undefined ? undefined : this.normalizeText(dto.name, "阶段名称不能为空"),
      description: dto.description === undefined ? undefined : this.normalizeOptionalLabel(dto.description),
      status: dto.status,
      progress: nextStatus === BusinessStageStatus.COMPLETED ? 100 : dto.progress,
      sort: dto.sort,
      startDate: dto.startDate === undefined ? undefined : this.toDate(dto.startDate),
      endDate: dto.endDate === undefined ? undefined : this.toDate(dto.endDate),
      owner: dto.ownerId !== undefined
        ? dto.ownerId === null ? { disconnect: true } : { connect: { id: dto.ownerId } }
        : ownerName !== undefined ? { disconnect: true } : undefined,
      ownerName: dto.ownerId !== undefined ? null : ownerName,
    };
    const updated = await this.prisma.businessMatterStage.update({
      where: { id: stage.id },
      data,
      include: this.stageInclude(),
    });
    await this.logActivity(matterId, user, BusinessActivityAction.MATTER_UPDATED, `更新项目阶段“${updated.name}”`, {
      objectType: "STAGE",
      objectId: updated.id,
      changes: this.activityChanges([
        ["阶段名称", stage.name, updated.name],
        ["状态", stage.status, updated.status],
        ["进度", stage.progress, updated.progress],
        ["负责人", stage.ownerId, updated.ownerId],
        ["自定义负责人", stage.ownerName, updated.ownerName],
        ["开始日期", stage.startDate, updated.startDate],
        ["结束日期", stage.endDate, updated.endDate],
      ]),
    });
    return updated;
  }

  async removeStage(matterId: string, stageId: string, user: PublicUser) {
    await this.requireEditable(matterId, user);
    const stage = await this.requireStage(matterId, stageId);
    await this.prisma.businessMatterTask.updateMany({ where: { stageId: stage.id }, data: { stageId: null } });
    await this.prisma.businessMatterMilestone.updateMany({ where: { stageId: stage.id }, data: { stageId: null } });
    const result = await this.prisma.businessMatterStage.update({ where: { id: stage.id }, data: { deletedAt: new Date() } });
    await this.logActivity(matterId, user, BusinessActivityAction.MATTER_UPDATED, `删除项目阶段“${stage.name}”`, {
      objectType: "STAGE",
      objectId: stage.id,
    });
    return result;
  }

  async createMilestone(matterId: string, dto: CreateBusinessMilestoneDto, user: PublicUser) {
    const matter = await this.requireEditable(matterId, user);
    await this.validateMilestoneStage(matterId, dto.stageId);
    const title = this.normalizeText(dto.title, "里程碑名称不能为空");
    const ownerName = this.normalizeOptionalLabel(dto.ownerName);
    this.validateExclusiveReference("里程碑负责人", dto.ownerId, ownerName);
    await this.ensureReferences({ ownerId: dto.ownerId ?? undefined });
    const milestone = await this.prisma.businessMatterMilestone.create({
      data: {
        matterId,
        stageId: dto.stageId ?? null,
        title,
        description: this.normalizeOptionalLabel(dto.description),
        dueDate: this.toDate(dto.dueDate),
        ownerId: ownerName ? null : dto.ownerId ?? matter.ownerId,
        ownerName,
        createdById: user.id,
      },
      include: this.milestoneInclude(),
    });
    await this.logActivity(matterId, user, BusinessActivityAction.MATTER_UPDATED, `创建里程碑“${title}”`, {
      objectType: "MILESTONE",
      objectId: milestone.id,
      snapshot: { title, dueDate: this.activityValue(milestone.dueDate), stageId: milestone.stageId },
    });
    return milestone;
  }

  async updateMilestone(matterId: string, milestoneId: string, dto: UpdateBusinessMilestoneDto, user: PublicUser) {
    await this.requireEditable(matterId, user);
    const milestone = await this.requireMilestone(matterId, milestoneId);
    const nextStageId = dto.stageId === undefined ? milestone.stageId : dto.stageId;
    await this.validateMilestoneStage(matterId, nextStageId);
    const ownerName = dto.ownerName === undefined ? undefined : this.normalizeOptionalLabel(dto.ownerName);
    this.validateExclusiveReference("里程碑负责人", dto.ownerId, ownerName);
    if (dto.ownerId) await this.ensureReferences({ ownerId: dto.ownerId });
    const nextStatus = dto.status ?? milestone.status;
    const data: Prisma.BusinessMatterMilestoneUpdateInput = {
      title: dto.title === undefined ? undefined : this.normalizeText(dto.title, "里程碑名称不能为空"),
      description: dto.description === undefined ? undefined : this.normalizeOptionalLabel(dto.description),
      stage: dto.stageId === undefined
        ? undefined
        : dto.stageId === null ? { disconnect: true } : { connect: { id: dto.stageId } },
      status: dto.status,
      dueDate: dto.dueDate === undefined ? undefined : this.toDate(dto.dueDate),
      owner: dto.ownerId !== undefined
        ? dto.ownerId === null ? { disconnect: true } : { connect: { id: dto.ownerId } }
        : ownerName !== undefined ? { disconnect: true } : undefined,
      ownerName: dto.ownerId !== undefined ? null : ownerName,
      completedAt: nextStatus === BusinessMilestoneStatus.COMPLETED
        ? milestone.completedAt ?? new Date()
        : null,
      completedBy: nextStatus === BusinessMilestoneStatus.COMPLETED
        ? { connect: { id: user.id } }
        : { disconnect: true },
    };
    const updated = await this.prisma.businessMatterMilestone.update({
      where: { id: milestone.id },
      data,
      include: this.milestoneInclude(),
    });
    await this.logActivity(matterId, user, BusinessActivityAction.MATTER_UPDATED, `更新里程碑“${updated.title}”`, {
      objectType: "MILESTONE",
      objectId: updated.id,
      changes: this.activityChanges([
        ["里程碑名称", milestone.title, updated.title],
        ["状态", milestone.status, updated.status],
        ["所属阶段", milestone.stageId, updated.stageId],
        ["截止日期", milestone.dueDate, updated.dueDate],
        ["负责人", milestone.ownerId, updated.ownerId],
        ["自定义负责人", milestone.ownerName, updated.ownerName],
      ]),
    });
    return updated;
  }

  async removeMilestone(matterId: string, milestoneId: string, user: PublicUser) {
    await this.requireEditable(matterId, user);
    const milestone = await this.requireMilestone(matterId, milestoneId);
    await this.prisma.businessMatterTask.updateMany({ where: { milestoneId: milestone.id }, data: { milestoneId: null } });
    const result = await this.prisma.businessMatterMilestone.update({ where: { id: milestone.id }, data: { deletedAt: new Date() } });
    await this.logActivity(matterId, user, BusinessActivityAction.MATTER_UPDATED, `删除里程碑“${milestone.title}”`, {
      objectType: "MILESTONE",
      objectId: milestone.id,
    });
    return result;
  }

  private async progressSummaries(matterIds: string[]) {
    const result = new Map<string, ProjectProgressSummary>();
    if (!matterIds.length) return result;
    const [matters, stages, milestones, tasks] = await Promise.all([
      this.prisma.businessMatter.findMany({
        where: { id: { in: matterIds }, deletedAt: null },
        select: { id: true, status: true, endDate: true },
      }),
      this.prisma.businessMatterStage.findMany({
        where: { matterId: { in: matterIds }, deletedAt: null },
        select: { id: true, matterId: true, status: true, progress: true, endDate: true },
      }),
      this.prisma.businessMatterMilestone.findMany({
        where: { matterId: { in: matterIds }, deletedAt: null },
        select: { matterId: true, status: true, dueDate: true },
      }),
      this.prisma.businessMatterTask.findMany({
        where: { matterId: { in: matterIds }, deletedAt: null },
        select: { matterId: true, stageId: true, progress: true, status: true, dueDate: true },
      }),
    ]);
    for (const matter of matters) {
      result.set(matter.id, calculateProjectProgress({
        status: matter.status,
        endDate: matter.endDate,
        stages: stages.filter((stage) => stage.matterId === matter.id),
        milestones: milestones.filter((milestone) => milestone.matterId === matter.id),
        tasks: tasks.filter((task) => task.matterId === matter.id),
      }));
    }
    return result;
  }

  private emptyProgressSummary(status: BusinessMatterStatus): ProjectProgressSummary {
    return {
      progress: status === BusinessMatterStatus.COMPLETED ? 100 : 0,
      health: status === BusinessMatterStatus.COMPLETED ? "COMPLETED" : status === BusinessMatterStatus.CANCELLED ? "CANCELLED" : "NO_PLAN",
      delayed: false,
      stageCount: 0,
      completedStageCount: 0,
      milestoneCount: 0,
      completedMilestoneCount: 0,
      overdueTaskCount: 0,
      overdueMilestoneCount: 0,
    };
  }

  private stageInclude(): Prisma.BusinessMatterStageInclude {
    return {
      owner: { select: personSelect },
      createdBy: { select: personSelect },
    };
  }

  private milestoneInclude(): Prisma.BusinessMatterMilestoneInclude {
    return {
      stage: { select: { id: true, name: true } },
      owner: { select: personSelect },
      createdBy: { select: personSelect },
      completedBy: { select: personSelect },
    };
  }

  private async requireStage(matterId: string, stageId: string) {
    const stage = await this.prisma.businessMatterStage.findFirst({ where: { id: stageId, matterId, deletedAt: null } });
    if (!stage) throw new NotFoundException("项目阶段不存在");
    return stage;
  }

  private async requireMilestone(matterId: string, milestoneId: string) {
    const milestone = await this.prisma.businessMatterMilestone.findFirst({ where: { id: milestoneId, matterId, deletedAt: null } });
    if (!milestone) throw new NotFoundException("里程碑不存在");
    return milestone;
  }

  private async validateMilestoneStage(matterId: string, stageId?: string | null) {
    if (!stageId) return;
    await this.requireStage(matterId, stageId);
  }

  async requireReadable(id: string) {
    const matter = await this.prisma.businessMatter.findFirst({
      where: { id, deletedAt: null },
    });
    if (!matter) {
      throw new NotFoundException("事项不存在");
    }
    return matter;
  }

  async requireEditableForRelatedData(id: string, user: PublicUser) {
    return this.requireEditable(id, user);
  }

  async update(id: string, dto: UpdateBusinessMatterDto, user: PublicUser) {
    const matter = await this.requireEditable(id, user);
    const ownerName = dto.ownerName === undefined ? undefined : this.normalizeOptionalLabel(dto.ownerName);
    const departmentName = dto.departmentName === undefined ? undefined : this.normalizeOptionalLabel(dto.departmentName);
    const partnerName = dto.partnerName === undefined ? undefined : this.normalizeOptionalLabel(dto.partnerName);
    if (dto.ownerId === null) {
      throw new BadRequestException("负责人不能为空");
    }
    this.validateExclusiveReference("负责人", dto.ownerId, ownerName);
    this.validateExclusiveReference("部门", dto.departmentId, departmentName);
    this.validateExclusiveReference("合作单位", dto.partnerId, partnerName);
    if (dto.parentId !== undefined && dto.parentId !== null) {
      await this.ensureParentChain(id, dto.parentId);
    }
    this.validateDateRange(
      dto.startDate === undefined ? matter.startDate : dto.startDate,
      dto.endDate === undefined ? matter.endDate : dto.endDate,
    );
    await this.ensureReferences({
      ownerId: dto.ownerId,
      departmentId: dto.departmentId === null ? undefined : dto.departmentId,
      partnerId: dto.partnerId === null ? undefined : dto.partnerId,
    });

    const data: Prisma.BusinessMatterUpdateInput = {
      title: dto.title === undefined ? undefined : this.normalizeTitle(dto.title),
      type: dto.type,
      status: dto.status,
      parent: dto.parentId === undefined ? undefined : dto.parentId === null ? { disconnect: true } : { connect: { id: dto.parentId } },
      owner: dto.ownerId === undefined ? undefined : { connect: { id: dto.ownerId } },
      ownerName: dto.ownerName !== undefined ? ownerName : dto.ownerId !== undefined ? null : undefined,
      department: dto.departmentId === undefined
        ? dto.departmentName === undefined ? undefined : { disconnect: true }
        : dto.departmentId === null ? { disconnect: true } : { connect: { id: dto.departmentId } },
      departmentName: dto.departmentName !== undefined ? departmentName : dto.departmentId !== undefined ? null : undefined,
      partner: dto.partnerId === undefined
        ? dto.partnerName === undefined ? undefined : { disconnect: true }
        : dto.partnerId === null ? { disconnect: true } : { connect: { id: dto.partnerId } },
      partnerName: dto.partnerName !== undefined ? partnerName : dto.partnerId !== undefined ? null : undefined,
      startDate: dto.startDate === undefined ? undefined : dto.startDate === null ? null : new Date(dto.startDate),
      endDate: dto.endDate === undefined ? undefined : dto.endDate === null ? null : new Date(dto.endDate),
      amount: dto.amount === undefined ? undefined : this.toDecimal(dto.amount),
      remark: dto.remark === undefined ? undefined : dto.remark?.trim() || null,
    };

    const updated = await this.prisma.businessMatter.update({
      where: { id },
      data,
      include: this.listInclude(),
    });
    await this.logActivity(id, user, BusinessActivityAction.MATTER_UPDATED, `更新事项“${updated.title}”`, {
      objectType: "MATTER",
      objectId: id,
      changes: this.activityChanges([
        ["事项名称", matter.title, updated.title],
        ["类型", matter.type, updated.type],
        ["状态", matter.status, updated.status],
        ["上级事项", matter.parentId, updated.parentId],
        ["负责人", matter.ownerId, updated.ownerId],
        ["自定义负责人", matter.ownerName, updated.ownerName],
        ["部门", matter.departmentId, updated.departmentId],
        ["自定义部门", matter.departmentName, updated.departmentName],
        ["合作单位", matter.partnerId, updated.partnerId],
        ["自定义合作单位", matter.partnerName, updated.partnerName],
        ["开始日期", matter.startDate, updated.startDate],
        ["结束日期", matter.endDate, updated.endDate],
        ["金额", matter.amount, updated.amount],
        ["备注", matter.remark, updated.remark],
      ]),
    });
    return updated;
  }

  async remove(id: string, user: PublicUser) {
    const matter = await this.requireEditable(id, user);
    const result = await this.prisma.businessMatter.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.logActivity(id, user, BusinessActivityAction.MATTER_DELETED, `删除事项“${matter.title}”`, {
      objectType: "MATTER",
      objectId: id,
      snapshot: { matterNo: matter.matterNo, title: matter.title, ownerId: matter.ownerId },
    });
    return result;
  }

  async attachDocuments(id: string, dto: AttachBusinessMatterDocumentsDto, user: PublicUser) {
    await this.requireEditable(id, user);
    const documentIds = [...new Set(dto.documentIds)];
    const documents = await this.prisma.document.findMany({
      where: { id: { in: documentIds }, deletedAt: null, status: { not: DocumentStatus.DELETED } },
      select: { id: true },
    });
    if (documents.length !== documentIds.length) {
      throw new BadRequestException("存在不存在或已删除的文件");
    }

    const existing = await this.prisma.businessMatterDocument.findMany({
      where: { matterId: id, documentId: { in: documentIds } },
      select: { documentId: true },
    });
    if (existing.length) {
      throw new ConflictException("所选文件中包含已关联文件");
    }

    const result = await this.prisma.businessMatterDocument.createMany({
      data: documentIds.map((documentId) => ({
        matterId: id,
        documentId,
        relationType: dto.relationType?.trim() || "REFERENCE",
        isPrimary: dto.isPrimary ?? false,
      })),
    });
    await this.logActivity(id, user, BusinessActivityAction.MATTER_UPDATED, `为事项关联 ${result.count} 份文件`, {
      objectType: "MATTER_DOCUMENT_LINK",
      objectId: id,
      related: { documentCount: result.count },
    });
    return { matterId: id, addedCount: result.count };
  }

  async detachDocument(id: string, documentId: string, user: PublicUser) {
    await this.requireEditable(id, user);
    const link = await this.prisma.businessMatterDocument.findFirst({
      where: { matterId: id, documentId },
    });
    if (!link) {
      throw new NotFoundException("文件关联不存在");
    }
    const result = await this.prisma.businessMatterDocument.delete({
      where: { matterId_documentId: { matterId: id, documentId } },
    });
    await this.logActivity(id, user, BusinessActivityAction.MATTER_UPDATED, "取消事项文件关联", {
      objectType: "MATTER_DOCUMENT_LINK",
      objectId: id,
      related: { documentId },
    });
    return result;
  }

  private async requireEditable(id: string, user: PublicUser) {
    const matter = await this.prisma.businessMatter.findFirst({ where: { id, deletedAt: null } });
    if (!matter) {
      throw new NotFoundException("事项不存在");
    }
    if (user.role !== UserRole.ADMIN && matter.createdById !== user.id && matter.ownerId !== user.id) {
      throw new ForbiddenException("只能修改自己创建或负责的事项");
    }
    return matter;
  }

  private async ensureReferences(input: { ownerId?: string; departmentId?: string; partnerId?: string }) {
    if (input.ownerId) {
      const owner = await this.prisma.user.findFirst({
        where: { id: input.ownerId, deletedAt: null, status: UserStatus.ACTIVE },
        select: { id: true },
      });
      if (!owner) {
        throw new BadRequestException("负责人不存在或已停用");
      }
    }
    if (input.departmentId) {
      const department = await this.prisma.department.findFirst({
        where: { id: input.departmentId, deletedAt: null },
        select: { id: true },
      });
      if (!department) {
        throw new BadRequestException("部门不存在");
      }
    }
    if (input.partnerId) {
      const partner = await this.prisma.partner.findFirst({
        where: { id: input.partnerId, deletedAt: null, status: PartnerStatus.ACTIVE },
        select: { id: true },
      });
      if (!partner) {
        throw new BadRequestException("合作单位不存在或已停用");
      }
    }
  }

  private normalizeTitle(title: string) {
    const normalized = title.trim();
    if (!normalized) {
      throw new BadRequestException("事项名称不能为空");
    }
    return normalized;
  }

  private normalizeText(value: string, message: string) {
    const normalized = value.trim();
    if (!normalized) throw new BadRequestException(message);
    return normalized;
  }

  private toDate(value?: Date | string | null) {
    if (value === undefined || value === null || value === "") return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) throw new BadRequestException("日期格式无效");
    return date;
  }

  private normalizeOptionalLabel(value: string | null | undefined) {
    const normalized = value?.trim();
    return normalized || null;
  }

  private validateExclusiveReference(label: string, id: string | null | undefined, customName: string | null | undefined) {
    if (id && customName) {
      throw new BadRequestException(`${label}不能同时选择已有记录和填写自定义名称`);
    }
  }

  private validateDateRange(startDate?: Date | string | null, endDate?: Date | string | null) {
    if (!startDate || !endDate) {
      return;
    }
    const start = startDate instanceof Date ? startDate : new Date(startDate);
    const end = endDate instanceof Date ? endDate : new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException("事项日期格式无效");
    }
    if (start.getTime() > end.getTime()) {
      throw new BadRequestException("开始日期不能晚于结束日期");
    }
  }

  private async ensureParentChain(matterId: string | null, parentId: string) {
    if (matterId === parentId) {
      throw new BadRequestException("上级事项不能选择自身");
    }
    let current = await this.prisma.businessMatter.findFirst({
      where: { id: parentId, deletedAt: null },
      select: { id: true, parentId: true },
    });
    if (!current) {
      throw new BadRequestException("上级事项不存在");
    }
    const visited = new Set<string>();
    while (current.parentId) {
      if (visited.has(current.id)) {
        throw new BadRequestException("事项层级不能形成循环");
      }
      visited.add(current.id);
      if (current.parentId === matterId) {
        throw new BadRequestException("事项层级不能形成循环");
      }
      current = await this.prisma.businessMatter.findFirst({
        where: { id: current.parentId, deletedAt: null },
        select: { id: true, parentId: true },
      });
      if (!current) {
        throw new BadRequestException("上级事项链无效");
      }
    }
  }

  private generateMatterNo() {
    const now = new Date();
    const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    return `MAT-${date}-${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  }

  private toDecimal(amount?: number | null) {
    return amount === undefined || amount === null ? amount : new Prisma.Decimal(amount);
  }

  private async logActivity(
    matterId: string,
    user: PublicUser,
    action: BusinessActivityAction,
    summary: string,
    metadata: Record<string, unknown>,
  ) {
    await this.prisma.businessMatterActivity.create({
      data: { matterId, actorId: user.id, action, summary, metadata: metadata as Prisma.InputJsonValue },
    });
  }

  private activityValue(value: unknown): string | number | boolean | null {
    if (value === undefined || value === null) return null;
    if (value instanceof Date) return value.toISOString();
    if (value instanceof Prisma.Decimal) return value.toString();
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
    return String(value);
  }

  private activityChanges(entries: Array<[string, unknown, unknown]>) {
    return entries.flatMap(([field, before, after]) => {
      const normalizedBefore = this.activityValue(before);
      const normalizedAfter = this.activityValue(after);
      return normalizedBefore === normalizedAfter ? [] : [{ field, before: normalizedBefore, after: normalizedAfter }];
    });
  }

  private listInclude(): Prisma.BusinessMatterInclude {
    return {
      parent: { select: { id: true, matterNo: true, title: true, type: true, status: true } },
      owner: { select: personSelect },
      createdBy: { select: personSelect },
      department: { select: { id: true, name: true } },
      partner: { select: { id: true, companyName: true } },
      _count: { select: { documents: true, children: true } },
    };
  }

  private detailInclude(): Prisma.BusinessMatterInclude {
    return {
      ...this.listInclude(),
      children: {
        where: { deletedAt: null },
        select: { id: true, matterNo: true, title: true, type: true, status: true, parentId: true, updatedAt: true },
        orderBy: [{ type: "asc" }, { updatedAt: "desc" }],
      },
      documents: {
        include: {
          document: { include: { currentVersion: true, category: true, subcategory: true } },
          version: true,
        },
        orderBy: { createdAt: "desc" },
      },
    };
  }
}
