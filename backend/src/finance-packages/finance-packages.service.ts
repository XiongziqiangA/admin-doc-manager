import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { DocumentStatus, FinanceMaterialType, FinancePackageStatus, Prisma } from "@prisma/client";
import { Response } from "express";

import { PrismaService } from "../prisma/prisma.service";
import { PublicUser } from "../users/user.presenter";
import { StorageService } from "../documents/storage.service";
import { getCategoryDescendantIds, sanitizeZipSegment } from "../documents/document-export";
import { ZipEntry, writeZipArchive } from "../documents/zip-writer";
import {
  buildFinancePackageEntryName,
  getFinanceGroupPath,
  inferFinanceMaterialType,
  scoreFinanceCandidate,
  validateFinancePackageLayout,
} from "./finance-package-export";
import { buildFinancePackageManifestXlsx, FinancePackageManifestRow } from "./finance-package-manifest";
import { CreateFinancePackageDto } from "./dto/create-finance-package.dto";
import { AddFinancePackageItemsDto, UpdateFinancePackageItemDto } from "./dto/finance-package-item.dto";
import { CreateFinancePackageGroupDto, UpdateFinancePackageGroupDto } from "./dto/finance-package-group.dto";
import { ListFinanceCandidatesDto } from "./dto/list-finance-candidates.dto";
import { ListFinancePackagesDto } from "./dto/list-finance-packages.dto";
import { UpdateFinancePackageDto } from "./dto/update-finance-package.dto";

const MATERIAL_TYPE_LABELS: Record<FinanceMaterialType, string> = {
  REIMBURSEMENT_FORM: "报销单",
  INVOICE: "发票",
  PAYMENT_FORM: "付款单",
  TICKET: "车票/行程单",
  CONTRACT: "合同",
  BANK_RECEIPT: "银行回单",
  OTHER: "其他凭证",
};

function endOfDate(value: string) {
  const date = new Date(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    date.setUTCHours(23, 59, 59, 999);
  }
  return date;
}

@Injectable()
export class FinancePackagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  async list(query: ListFinancePackagesDto) {
    const where: Prisma.FinancePackageTaskWhereInput = {
      period: query.period,
      status: query.status,
    };
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.financePackageTask.findMany({
        where,
        include: {
          createdBy: { select: { id: true, username: true, realName: true } },
          _count: { select: { groups: true, items: true, exports: true } },
        },
        orderBy: [{ period: "desc" }, { updatedAt: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.financePackageTask.count({ where }),
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

  async findById(id: string) {
    const task = await this.prisma.financePackageTask.findFirst({
      where: { id },
      include: {
        createdBy: { select: { id: true, username: true, realName: true } },
        groups: { orderBy: [{ sort: "asc" }, { createdAt: "asc" }] },
        items: { include: this.itemInclude(), orderBy: [{ sort: "asc" }, { createdAt: "asc" }] },
        exports: {
          include: { exportedBy: { select: { id: true, username: true, realName: true } } },
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });
    if (!task) {
      throw new NotFoundException("财务归集任务不存在");
    }
    return {
      ...task,
      validation: validateFinancePackageLayout(
        task.groups,
        task.items.map((item) => ({
          id: item.id,
          groupId: item.groupId,
          exportFileName: item.exportFileName,
          originalFileName: item.version.originalFileName,
          versionId: item.versionId,
          currentVersionId: item.document.currentVersionId,
        })),
      ),
    };
  }

  async create(dto: CreateFinancePackageDto, user: PublicUser) {
    const taskData = {
      name: dto.name.trim(),
      period: dto.period,
      rootFolderName: sanitizeZipSegment(dto.rootFolderName, "财务资料"),
      includeManifest: dto.includeManifest ?? true,
      createdById: user.id,
    };

    if (!dto.copyGroupsFromTaskId) {
      return this.prisma.financePackageTask.create({ data: taskData });
    }

    const source = await this.prisma.financePackageTask.findFirst({
      where: { id: dto.copyGroupsFromTaskId },
      select: { id: true },
    });
    if (!source) {
      throw new BadRequestException("要复制目录的归集任务不存在");
    }
    const sourceGroups = await this.prisma.financePackageGroup.findMany({
      where: { taskId: source.id },
      orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
    });

    return this.prisma.$transaction(async (tx) => {
      const task = await tx.financePackageTask.create({ data: taskData });
      const newIds = new Map<string, string>();
      const remaining = [...sourceGroups];

      while (remaining.length) {
        const index = remaining.findIndex((group) => !group.parentId || newIds.has(group.parentId));
        if (index < 0) {
          throw new BadRequestException("复制来源的目录结构存在循环引用");
        }
        const [group] = remaining.splice(index, 1);
        const created = await tx.financePackageGroup.create({
          data: {
            taskId: task.id,
            name: group.name,
            parentId: group.parentId ? newIds.get(group.parentId) : null,
            sort: group.sort,
          },
        });
        newIds.set(group.id, created.id);
      }

      return task;
    });
  }

  async update(id: string, dto: UpdateFinancePackageDto) {
    await this.requireTask(id);
    return this.prisma.financePackageTask.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        period: dto.period,
        rootFolderName: dto.rootFolderName ? sanitizeZipSegment(dto.rootFolderName, "财务资料") : undefined,
        includeManifest: dto.includeManifest,
        status: FinancePackageStatus.DRAFT,
      },
    });
  }

  async remove(id: string) {
    await this.requireTask(id);
    return this.prisma.financePackageTask.delete({ where: { id } });
  }

  async createGroup(taskId: string, dto: CreateFinancePackageGroupDto) {
    await this.requireTask(taskId);
    if (dto.parentId) {
      await this.requireGroup(taskId, dto.parentId);
      await this.assertGroupDepth(taskId, dto.parentId);
    }
    const name = sanitizeZipSegment(dto.name, "未命名目录");
    await this.assertGroupNameAvailable(taskId, dto.parentId ?? null, name);
    const group = await this.prisma.financePackageGroup.create({
      data: { taskId, name, parentId: dto.parentId ?? null, sort: dto.sort },
    });
    await this.markTaskDraft(taskId);
    return group;
  }

  async updateGroup(taskId: string, groupId: string, dto: UpdateFinancePackageGroupDto) {
    const group = await this.requireGroup(taskId, groupId);
    const name = dto.name ? sanitizeZipSegment(dto.name, "未命名目录") : undefined;
    if (name) {
      await this.assertGroupNameAvailable(taskId, group.parentId, name, groupId);
    }
    const updated = await this.prisma.financePackageGroup.update({
      where: { id: groupId },
      data: { name, sort: dto.sort },
    });
    await this.markTaskDraft(taskId);
    return updated;
  }

  async addItems(taskId: string, dto: AddFinancePackageItemsDto) {
    await this.requireTask(taskId);
    if (dto.groupId) {
      await this.requireGroup(taskId, dto.groupId);
    }

    const documentIds = [...new Set(dto.documentIds.map((id) => id.trim()).filter(Boolean))];
    if (!documentIds.length) {
      throw new BadRequestException("请选择要加入的文件");
    }

    const documents = await this.prisma.document.findMany({
      where: {
        id: { in: documentIds },
        deletedAt: null,
        status: { not: DocumentStatus.DELETED },
        currentVersionId: { not: null },
      },
      select: {
        id: true,
        title: true,
        currentVersionId: true,
        currentVersion: { select: { id: true, originalFileName: true } },
      },
    });
    if (documents.length !== documentIds.length || documents.some((document) => !document.currentVersion)) {
      throw new BadRequestException("存在已删除、无版本或不存在的文件");
    }

    const existing = await this.prisma.financePackageItem.findMany({
      where: { taskId, documentId: { in: documentIds } },
      select: { documentId: true },
    });
    const existingIds = new Set(existing.map((item) => item.documentId));
    const documentsToAdd = documents.filter((document) => !existingIds.has(document.id));
    const aggregate = await this.prisma.financePackageItem.aggregate({
      where: { taskId, groupId: dto.groupId ?? null },
      _max: { sort: true },
    });
    const firstSort = (aggregate._max.sort ?? 0) + 1;

    if (documentsToAdd.length) {
      await this.prisma.financePackageItem.createMany({
        data: documentsToAdd.map((document, index) => ({
          taskId,
          groupId: dto.groupId ?? null,
          documentId: document.id,
          versionId: document.currentVersion!.id,
          materialType:
            dto.materialType ??
            (inferFinanceMaterialType(`${document.title} ${document.currentVersion!.originalFileName}`) as FinanceMaterialType),
          sort: firstSort + index,
        })),
        skipDuplicates: true,
      });
      await this.markTaskDraft(taskId);
    }

    return {
      addedCount: documentsToAdd.length,
      skippedCount: documentIds.length - documentsToAdd.length,
    };
  }

  async removeGroup(taskId: string, groupId: string) {
    await this.requireTask(taskId);
    await this.requireGroup(taskId, groupId);
    const [childCount, itemCount] = await this.prisma.$transaction([
      this.prisma.financePackageGroup.count({ where: { parentId: groupId } }),
      this.prisma.financePackageItem.count({ where: { taskId, groupId } }),
    ]);
    if (childCount || itemCount) {
      throw new BadRequestException("目录中仍有子目录或文件，不能删除");
    }
    const deleted = await this.prisma.financePackageGroup.delete({ where: { id: groupId } });
    await this.markTaskDraft(taskId);
    return deleted;
  }

  async updateItem(taskId: string, itemId: string, dto: UpdateFinancePackageItemDto) {
    await this.requireTask(taskId);
    const item = await this.prisma.financePackageItem.findFirst({
      where: { id: itemId, taskId },
      include: { document: { select: { currentVersionId: true } } },
    });
    if (!item) {
      throw new NotFoundException("归集文件不存在");
    }
    if (dto.groupId) {
      await this.requireGroup(taskId, dto.groupId);
    }
    if (dto.useLatestVersion && !item.document.currentVersionId) {
      throw new BadRequestException("文件没有可用的最新版本");
    }

    const updated = await this.prisma.financePackageItem.update({
      where: { id: itemId },
      data: {
        versionId: dto.useLatestVersion ? item.document.currentVersionId! : undefined,
        groupId: dto.groupId,
        materialType: dto.materialType,
        exportFileName:
          dto.exportFileName === undefined ? undefined : dto.exportFileName?.trim() || null,
        sort: dto.sort,
        remark: dto.remark === undefined ? undefined : dto.remark?.trim() || null,
      },
      include: this.itemInclude(),
    });
    await this.markTaskDraft(taskId);
    return updated;
  }

  async removeItem(taskId: string, itemId: string) {
    await this.requireTask(taskId);
    const item = await this.prisma.financePackageItem.findFirst({ where: { id: itemId, taskId } });
    if (!item) {
      throw new NotFoundException("归集文件不存在");
    }
    const deleted = await this.prisma.financePackageItem.delete({ where: { id: itemId } });
    await this.markTaskDraft(taskId);
    return deleted;
  }

  async listCandidates(taskId: string, query: ListFinanceCandidatesDto) {
    const task = await this.requireTask(taskId);
    const assignedItems = await this.prisma.financePackageItem.findMany({
      where: { taskId },
      select: { documentId: true },
    });
    const assignedIds = assignedItems.map((item) => item.documentId);
    const terms = this.splitTerms(query.keyword);
    const subcategoryIds = query.subcategoryId
      ? getCategoryDescendantIds(
          await this.prisma.category.findMany({
            where: { deletedAt: null },
            select: { id: true, name: true, parentId: true },
          }),
          query.subcategoryId,
        )
      : undefined;
    const hasExplicitFilter = Boolean(
      query.categoryId ||
        query.subcategoryId ||
        query.departmentId ||
        query.tagId ||
        query.materialType ||
        query.uploadedFrom ||
        query.uploadedTo,
    );
    const keywordConditions: Prisma.DocumentWhereInput[] = terms.map((term) => ({
      OR: [
        { title: { contains: term, mode: "insensitive" } },
        { remark: { contains: term, mode: "insensitive" } },
        { category: { name: { contains: term, mode: "insensitive" } } },
        { subcategory: { name: { contains: term, mode: "insensitive" } } },
        { documentTags: { some: { tag: { name: { contains: term, mode: "insensitive" } } } } },
        { currentVersion: { is: { originalFileName: { contains: term, mode: "insensitive" } } } },
        {
          currentVersion: {
            is: {
              contentIndex: {
                is: { status: "READY", extractedText: { contains: term, mode: "insensitive" } },
              },
            },
          },
        },
      ],
    }));
    const documents = await this.prisma.document.findMany({
      where: {
        id: assignedIds.length ? { notIn: assignedIds } : undefined,
        deletedAt: null,
        status: { not: DocumentStatus.DELETED },
        currentVersionId: { not: null },
        categoryId: query.categoryId,
        subcategoryId: subcategoryIds ? { in: subcategoryIds } : undefined,
        departmentId: query.departmentId,
        documentTags: query.tagId ? { some: { tagId: query.tagId } } : undefined,
        createdAt:
          query.uploadedFrom || query.uploadedTo
            ? {
                gte: query.uploadedFrom ? new Date(query.uploadedFrom) : undefined,
                lte: query.uploadedTo ? endOfDate(query.uploadedTo) : undefined,
              }
            : undefined,
        AND: keywordConditions.length ? keywordConditions : undefined,
      },
      include: this.candidateInclude(),
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });

    const ranked = documents
      .flatMap((document) => {
        if (!document.currentVersion) {
          return [];
        }
        const contentIndex = document.currentVersion.contentIndex;
        const result = scoreFinanceCandidate(
          {
            title: document.title,
            originalFileName: document.currentVersion.originalFileName,
            categoryName: document.category?.name ?? null,
            subcategoryName: document.subcategory?.name ?? null,
            tagNames: document.documentTags.map((item) => item.tag.name),
            remark: document.remark,
            extractedText: contentIndex?.status === "READY" ? contentIndex.extractedText : null,
            createdAt: document.createdAt,
            updatedAt: document.updatedAt,
          },
          task.period,
          query.keyword,
        );
        const materialType = inferFinanceMaterialType(
          [
            document.title,
            document.currentVersion.originalFileName,
            document.category?.name,
            document.subcategory?.name,
            ...document.documentTags.map((item) => item.tag.name),
          ]
            .filter(Boolean)
            .join(" "),
        );
        if (query.materialType && materialType !== query.materialType) {
          return [];
        }
        if (!result.score && !hasExplicitFilter) {
          return [];
        }
        const { contentIndex: _contentIndex, ...currentVersion } = document.currentVersion;
        return [{ document: { ...document, currentVersion }, materialType, ...result }];
      })
      .sort((left, right) => right.score - left.score || right.document.updatedAt.getTime() - left.document.updatedAt.getTime());
    const start = (query.page - 1) * query.pageSize;
    return {
      items: ranked.slice(start, start + query.pageSize),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems: ranked.length,
        totalPages: Math.ceil(ranked.length / query.pageSize),
      },
    };
  }

  async exportPackage(taskId: string, user: PublicUser, response: Response) {
    const task = await this.prisma.financePackageTask.findFirst({
      where: { id: taskId },
      include: {
        groups: { orderBy: [{ sort: "asc" }, { createdAt: "asc" }] },
        items: {
          include: {
            version: true,
            document: { select: { id: true, title: true, documentNo: true, currentVersionId: true } },
          },
          orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
        },
      },
    });
    if (!task) {
      throw new NotFoundException("财务归集任务不存在");
    }
    if (!task.items.length) {
      throw new BadRequestException("归集任务中还没有文件");
    }

    const usedNames = new Set<string>();
    const zipEntries: ZipEntry[] = [];
    const manifestRows: FinancePackageManifestRow[] = [];
    const missingFiles: string[] = [];

    for (const item of task.items) {
      const groupPath = getFinanceGroupPath(task.groups, item.groupId);
      const requestedFileName = this.ensureFileExtension(
        item.exportFileName || item.version.originalFileName,
        item.version.originalFileName,
      );
      const outputPath = buildFinancePackageEntryName(
        { rootFolderName: task.rootFolderName, groupPath, fileName: requestedFileName },
        usedNames,
      );
      try {
        const sourcePath = await this.storageService.getStoredFilePath(item.version.storageKey);
        zipEntries.push({ name: outputPath, date: item.version.createdAt, source: { type: "file", path: sourcePath } });
        manifestRows.push({
          documentNo: item.document.documentNo,
          title: item.document.title,
          originalFileName: item.version.originalFileName,
          exportFileName: outputPath.split("/").at(-1) ?? requestedFileName,
          outputPath,
          materialType: MATERIAL_TYPE_LABELS[item.materialType],
          versionLabel: item.version.versionLabel,
          fileSize: item.version.fileSize,
          checksum: item.version.checksum,
          status: "已导出",
        });
      } catch {
        missingFiles.push(item.version.originalFileName);
      }
    }

    if (missingFiles.length) {
      throw new BadRequestException(`有 ${missingFiles.length} 个源文件缺失，请先检查存储目录`);
    }
    if (task.includeManifest) {
      const manifestPath = buildFinancePackageEntryName(
        { rootFolderName: task.rootFolderName, groupPath: [], fileName: "文件清单.xlsx" },
        usedNames,
      );
      zipEntries.push({
        name: manifestPath,
        date: new Date(),
        source: { type: "buffer", buffer: await buildFinancePackageManifestXlsx(manifestRows) },
      });
    }

    const exportFileName = `${sanitizeZipSegment(task.name, "财务资料")}_${this.getChinaDateStamp(new Date())}.zip`;
    response.setHeader("Content-Type", "application/zip");
    response.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(exportFileName)}`);
    await writeZipArchive(response, zipEntries);

    const exportedAt = new Date();
    await this.prisma.$transaction([
      this.prisma.financePackageTask.update({
        where: { id: taskId },
        data: { status: FinancePackageStatus.EXPORTED, lastExportedAt: exportedAt },
      }),
      this.prisma.financePackageExport.create({
        data: {
          taskId,
          exportedById: user.id,
          fileName: exportFileName,
          fileCount: task.items.length,
        },
      }),
    ]);
  }

  private requireTask(id: string) {
    return this.prisma.financePackageTask.findFirst({ where: { id } }).then((task) => {
      if (!task) {
        throw new NotFoundException("财务归集任务不存在");
      }
      return task;
    });
  }

  private requireGroup(taskId: string, groupId: string) {
    return this.prisma.financePackageGroup.findFirst({ where: { id: groupId, taskId } }).then((group) => {
      if (!group) {
        throw new BadRequestException("归集目录不存在或不属于当前任务");
      }
      return group;
    });
  }

  private async assertGroupNameAvailable(taskId: string, parentId: string | null, name: string, exceptId?: string) {
    const duplicate = await this.prisma.financePackageGroup.findFirst({
      where: {
        taskId,
        parentId,
        name: { equals: name, mode: "insensitive" },
        id: exceptId ? { not: exceptId } : undefined,
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new BadRequestException("同一层级已存在同名目录");
    }
  }

  private async assertGroupDepth(taskId: string, parentId: string) {
    let currentId: string | null = parentId;
    let depth = 1;
    const visited = new Set<string>();
    while (currentId) {
      if (visited.has(currentId)) {
        throw new BadRequestException("归集目录存在循环引用");
      }
      visited.add(currentId);
      const group: { parentId: string | null } | null = await this.prisma.financePackageGroup.findFirst({
        where: { id: currentId, taskId },
        select: { parentId: true },
      });
      currentId = group?.parentId ?? null;
      depth += 1;
    }
    if (depth > 4) {
      throw new BadRequestException("归集目录最多支持四级");
    }
  }

  private itemInclude() {
    return {
      group: true,
      version: true,
      document: {
        include: {
          category: true,
          subcategory: true,
          currentVersion: true,
          documentTags: { include: { tag: true } },
        },
      },
    } satisfies Prisma.FinancePackageItemInclude;
  }

  private candidateInclude() {
    return {
      category: true,
      subcategory: true,
      department: true,
      creator: { select: { id: true, username: true, realName: true, role: true, status: true } },
      documentTags: { include: { tag: true } },
      currentVersion: { include: { contentIndex: { select: { status: true, extractedText: true } } } },
    } satisfies Prisma.DocumentInclude;
  }

  private splitTerms(keyword?: string) {
    return [...new Set((keyword ?? "").trim().split(/[\s,，;；、]+/).filter(Boolean))].slice(0, 8);
  }

  private ensureFileExtension(fileName: string, originalFileName: string) {
    if (/\.[^.]+$/.test(fileName)) {
      return fileName;
    }
    const extension = originalFileName.match(/(\.[^.]+)$/)?.[1];
    return extension ? `${fileName}${extension}` : fileName;
  }

  private getChinaDateStamp(date: Date) {
    return new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10).replaceAll("-", "");
  }

  private markTaskDraft(taskId: string) {
    return this.prisma.financePackageTask.update({
      where: { id: taskId },
      data: { status: FinancePackageStatus.DRAFT },
    });
  }
}
