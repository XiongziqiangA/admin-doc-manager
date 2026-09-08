import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  DocumentLogAction,
  DocumentLogResult,
  DocumentStatus,
  Prisma,
  UserRole,
} from "@prisma/client";
import { Response } from "express";

import { PublicUser } from "../users/user.presenter";
import { PrismaService } from "../prisma/prisma.service";
import { DocumentContentIndexService } from "../search/document-content.service";
import { normalizeTagName } from "../tags/tag-name";
import { buildDocumentNumber, parseDocumentNumberSequence } from "./document-number";
import { nextVersionNumber } from "./document-version";
import { isPreviewableFile, normalizeUploadedFileName } from "./document-file";
import { DocumentLogMeta } from "./document-log-meta";
import {
  buildExportManifestCsv,
  buildReadableExportFileName,
  buildUniqueZipEntryName,
  getCategoryDescendantIds,
  getCategoryPathNames,
} from "./document-export";
import { CreateDocumentDto } from "./dto/create-document.dto";
import { ExportDocumentsDto } from "./dto/export-documents.dto";
import { ListDocumentsDto } from "./dto/list-documents.dto";
import { UpdateDocumentDto } from "./dto/update-document.dto";
import { UploadVersionDto } from "./dto/upload-version.dto";
import { StorageService } from "./storage.service";
import { ZipEntry, writeZipArchive } from "./zip-writer";

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly contentIndexService: DocumentContentIndexService,
  ) {}

  async create(
    dto: CreateDocumentDto,
    file: Express.Multer.File,
    user: PublicUser,
    meta: DocumentLogMeta,
  ) {
    const category = await this.requirePrimaryCategory(dto.categoryId);
    await this.requireSubcategory(dto.subcategoryId, dto.categoryId);
    await this.requirePartners(dto.partnerIds);
    const tagIds = await this.resolveTagIds(dto.tagIds, dto.tagNames, user.id);

    const originalFileName = normalizeUploadedFileName(file.originalname);
    const storedFile = await this.storageService.saveDocumentFile(file);
    const versionNo = nextVersionNumber(0);
    const versionLabel = this.buildVersionLabel(versionNo, new Date());
    const title = dto.title?.trim() || originalFileName;
    const explicitDocumentNo = dto.documentNo?.trim();
    if (explicitDocumentNo) {
      await this.ensureDocumentNoAvailable(explicitDocumentNo);
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const documentNo = explicitDocumentNo ?? (await this.generateDocumentNo(category.code, attempt));
      try {
        const created = await this.prisma.$transaction(async (tx) => {
          const document = await tx.document.create({
            data: {
              title,
              documentNo,
              categoryId: dto.categoryId,
              subcategoryId: dto.subcategoryId,
              departmentId: dto.departmentId,
              creatorId: user.id,
              remark: dto.remark,
            },
          });
          const version = await tx.documentVersion.create({
            data: {
              documentId: document.id,
              versionNo,
              versionLabel,
              originalFileName,
              storageKey: storedFile.storageKey,
              fileSize: file.size,
              mimeType: file.mimetype || "application/octet-stream",
              fileExt: storedFile.fileExt,
              checksum: storedFile.checksum,
              uploadUserId: user.id,
              changeNote: dto.changeNote,
            },
          });
          await tx.document.update({
            where: { id: document.id },
            data: { currentVersionId: version.id },
          });
          await this.replaceRelations(tx, document.id, tagIds, dto.partnerIds ?? []);
          await this.createLog(tx, document.id, version.id, user.id, DocumentLogAction.UPLOAD, meta);

          return tx.document.findUnique({ where: { id: document.id }, include: this.documentInclude() });
        });
        this.queueContentIndex(created?.currentVersionId);
        return created;
      } catch (error) {
        if (!explicitDocumentNo && this.isUniqueDocumentNoConflict(error)) {
          continue;
        }
        throw error;
      }
    }

    throw new ConflictException("文件编号生成冲突，请重试");
  }

  async list(query: ListDocumentsDto) {
    const where = await this.buildListWhere(query, false);
    const skip = (query.page - 1) * query.pageSize;
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.document.findMany({
        where,
        include: this.documentInclude(),
        orderBy: { [query.sortBy]: query.sortOrder },
        skip,
        take: query.pageSize,
      }),
      this.prisma.document.count({ where }),
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

  async listRecycle(query: ListDocumentsDto) {
    const where = await this.buildListWhere(query, true);
    const skip = (query.page - 1) * query.pageSize;
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.document.findMany({
        where,
        include: this.documentInclude(),
        orderBy: { deletedAt: "desc" },
        skip,
        take: query.pageSize,
      }),
      this.prisma.document.count({ where }),
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

  async findById(id: string, user: PublicUser, meta: DocumentLogMeta) {
    const document = await this.prisma.document.findFirst({
      where: { id, deletedAt: null },
      include: this.documentInclude(),
    });
    if (!document) {
      throw new NotFoundException("文件不存在");
    }

    await this.prisma.documentLog.create({
      data: {
        documentId: id,
        versionId: document.currentVersionId,
        userId: user.id,
        action: DocumentLogAction.VIEW_DETAIL,
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
    });
    return document;
  }

  async update(id: string, dto: UpdateDocumentDto, user: PublicUser, meta: DocumentLogMeta) {
    const document = await this.requireDocument(id);
    this.assertCanModify(document, user);

    const categoryId = dto.categoryId ?? document.categoryId;
    if (dto.categoryId) {
      await this.requirePrimaryCategory(dto.categoryId);
    }
    if (dto.subcategoryId) {
      await this.requireSubcategory(dto.subcategoryId, categoryId);
    }
    if (dto.partnerIds) {
      await this.requirePartners(dto.partnerIds);
    }
    if (dto.documentNo) {
      await this.ensureDocumentNoAvailable(dto.documentNo.trim(), id);
    }
    const tagIds = dto.tagIds || dto.tagNames ? await this.resolveTagIds(dto.tagIds, dto.tagNames, user.id) : undefined;

    const updatedDocument = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.document.update({
        where: { id },
        data: {
          title: dto.title?.trim(),
          documentNo: dto.documentNo?.trim(),
          categoryId: dto.categoryId,
          subcategoryId: dto.subcategoryId,
          departmentId: dto.departmentId,
          status: dto.status,
          remark: dto.remark,
        },
      });
      if (tagIds || dto.partnerIds) {
        await this.replaceRelations(
          tx,
          id,
          tagIds,
          dto.partnerIds ?? undefined,
        );
      }
      await this.createLog(tx, id, updated.currentVersionId, user.id, DocumentLogAction.EDIT_INFO, meta);
      return tx.document.findUnique({ where: { id }, include: this.documentInclude() });
    });
    return updatedDocument;
  }

  async uploadVersion(
    id: string,
    dto: UploadVersionDto,
    file: Express.Multer.File,
    user: PublicUser,
    meta: DocumentLogMeta,
  ) {
    const document = await this.requireDocument(id);
    this.assertCanModify(document, user);
    const originalFileName = normalizeUploadedFileName(file.originalname);
    const storedFile = await this.storageService.saveDocumentFile(file);
    const versionCount = await this.prisma.documentVersion.count({
      where: { documentId: id },
    });
    const versionNo = nextVersionNumber(versionCount);
    const versionLabel = this.buildVersionLabel(versionNo, new Date());

    const version = await this.prisma.$transaction(async (tx) => {
      const version = await tx.documentVersion.create({
        data: {
          documentId: id,
          versionNo,
          versionLabel,
          originalFileName,
          storageKey: storedFile.storageKey,
          fileSize: file.size,
          mimeType: file.mimetype || "application/octet-stream",
          fileExt: storedFile.fileExt,
          checksum: storedFile.checksum,
          uploadUserId: user.id,
          changeNote: dto.changeNote,
        },
      });
      await tx.document.update({
        where: { id },
        data: { currentVersionId: version.id },
      });
      await this.createLog(tx, id, version.id, user.id, DocumentLogAction.UPLOAD_VERSION, meta);

      return version;
    });
    this.queueContentIndex(version.id);
    return version;
  }

  findDuplicatesByFileName(fileName: string) {
    const normalizedFileName = normalizeUploadedFileName(fileName).trim();
    if (!normalizedFileName) {
      throw new BadRequestException("鏂囦欢鍚嶇О涓嶈兘涓虹┖");
    }

    return this.prisma.document.findMany({
      where: {
        deletedAt: null,
        status: { not: DocumentStatus.DELETED },
        OR: [
          {
            title: {
              equals: normalizedFileName,
              mode: "insensitive",
            },
          },
          {
            currentVersion: {
              is: {
                originalFileName: {
                  equals: normalizedFileName,
                  mode: "insensitive",
                },
              },
            },
          },
        ],
      },
      include: this.documentInclude(),
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });
  }

  async exportDocuments(
    dto: ExportDocumentsDto,
    user: PublicUser,
    meta: DocumentLogMeta,
    response: Response,
  ) {
    if (dto.includeHistory) {
      throw new BadRequestException("批量导出暂只导出当前最新版本");
    }

    const documentIds = [...new Set((dto.documentIds ?? []).map((id) => id.trim()).filter(Boolean))];
    if (documentIds.length && dto.categoryId) {
      throw new BadRequestException("请只选择按文件导出或按分类导出其中一种方式");
    }
    if (!documentIds.length && !dto.categoryId) {
      throw new BadRequestException("请选择要导出的文件或分类");
    }

    const categories = await this.prisma.category.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, parentId: true, level: true },
      orderBy: [{ level: "asc" }, { sort: "asc" }],
    });
    const where = this.buildExportWhere(dto, documentIds, categories);
    const documents = await this.prisma.document.findMany({
      where,
      include: this.documentInclude(),
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });
    const orderedDocuments = documentIds.length
      ? documentIds.flatMap((id) => documents.find((document) => document.id === id) ?? [])
      : documents;

    if (!orderedDocuments.length) {
      throw new BadRequestException("没有可导出的文件");
    }

    const zipName = this.buildExportFileName(dto, orderedDocuments.length);

    const usedEntryNames = new Set<string>();
    const manifestRows = [];
    const exportedLogs: Prisma.DocumentLogCreateManyInput[] = [];
    const zipEntries: ZipEntry[] = [];

    for (const document of orderedDocuments) {
      const version = document.currentVersion;
      const categoryPath = getCategoryPathNames(categories, document.categoryId, document.subcategoryId);
      const categoryPathText = categoryPath.join("/");
      const tagNames = document.documentTags?.map((item) => item.tag.name) ?? [];
      const originalFileName = version?.originalFileName ?? document.title;
      const rowBase = {
        documentNo: document.documentNo,
        title: document.title,
        originalFileName,
        categoryPath: categoryPathText,
        tags: tagNames,
        versionLabel: version?.versionLabel ?? "-",
        fileSize: version?.fileSize ?? 0,
        updatedAt: document.updatedAt,
      };

      if (!version) {
        manifestRows.push({ ...rowBase, status: "源文件缺失" as const });
        continue;
      }

      try {
        const filePath = await this.storageService.getStoredFilePath(version.storageKey);
        const readableFileName = buildReadableExportFileName({
          documentNo: document.documentNo,
          title: document.title,
          originalFileName: version.originalFileName,
          fileExt: version.fileExt,
        });
        const entryName = buildUniqueZipEntryName(categoryPath, readableFileName, usedEntryNames);
        zipEntries.push({ name: entryName, date: document.updatedAt, source: { type: "file", path: filePath } });
        manifestRows.push({ ...rowBase, status: "已导出" as const });
        exportedLogs.push({
          documentId: document.id,
          versionId: version.id,
          userId: user.id,
          action: DocumentLogAction.DOWNLOAD,
          result: DocumentLogResult.SUCCESS,
          ip: meta.ip,
          userAgent: meta.userAgent,
        });
      } catch (error) {
        if (!this.isStorageNotFound(error)) {
          throw error;
        }
        manifestRows.push({ ...rowBase, status: "源文件缺失" as const });
      }
    }

    zipEntries.push({
      name: "导出清单.csv",
      date: new Date(),
      source: { type: "buffer", buffer: Buffer.from(buildExportManifestCsv(manifestRows), "utf8") },
    });

    if (exportedLogs.length) {
      await this.prisma.documentLog.createMany({ data: exportedLogs });
    }

    response.setHeader("Content-Type", "application/zip");
    response.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(zipName)}`);
    await writeZipArchive(response, zipEntries);
  }

  listVersions(id: string) {
    return this.prisma.documentVersion.findMany({
      where: { documentId: id },
      orderBy: { createdAt: "desc" },
    });
  }

  async getFileForDownload(id: string, versionId: string | undefined, user: PublicUser, meta: DocumentLogMeta) {
    const { document, version } = await this.requireDocumentVersion(id, versionId);
    await this.prisma.documentLog.create({
      data: {
        documentId: document.id,
        versionId: version.id,
        userId: user.id,
        action: DocumentLogAction.DOWNLOAD,
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
    });

    return {
      version,
      stream: await this.storageService.createReadStream(version.storageKey),
    };
  }

  async getFileForPreview(id: string, versionId: string | undefined, user: PublicUser, meta: DocumentLogMeta) {
    const { document, version } = await this.requireDocumentVersion(id, versionId);
    if (!isPreviewableFile(version.originalFileName)) {
      throw new BadRequestException("该文件类型不支持预览");
    }
    await this.prisma.documentLog.create({
      data: {
        documentId: document.id,
        versionId: version.id,
        userId: user.id,
        action: DocumentLogAction.VIEW_DETAIL,
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
    });
    const file = {
      version,
      stream: await this.storageService.createReadStream(version.storageKey),
    };
    if (!isPreviewableFile(file.version.originalFileName)) {
      throw new BadRequestException("该文件类型不支持预览");
    }

    return file;
  }

  async listLogs(query: ListDocumentsDto) {
    const skip = (query.page - 1) * query.pageSize;
    const where: Prisma.DocumentLogWhereInput = {
      document: query.keyword
        ? {
            OR: [
              { title: { contains: query.keyword, mode: "insensitive" } },
              { documentNo: { contains: query.keyword, mode: "insensitive" } },
            ],
          }
        : undefined,
    };
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.documentLog.findMany({
        where,
        include: {
          document: { select: { id: true, title: true, documentNo: true } },
          version: { select: { id: true, versionNo: true, versionLabel: true } },
          user: { select: { id: true, username: true, realName: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: query.pageSize,
      }),
      this.prisma.documentLog.count({ where }),
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

  async remove(id: string, user: PublicUser, meta: DocumentLogMeta) {
    await this.requireDocument(id);
    return this.prisma.$transaction(async (tx) => {
      const document = await tx.document.update({
        where: { id },
        data: { status: DocumentStatus.DELETED, deletedAt: new Date() },
      });
      await this.createLog(tx, id, document.currentVersionId, user.id, DocumentLogAction.DELETE, meta);
      return document;
    });
  }

  async restore(id: string, user: PublicUser, meta: DocumentLogMeta) {
    const document = await this.prisma.document.findUnique({ where: { id } });
    if (!document) {
      throw new NotFoundException("文件不存在");
    }

    return this.prisma.$transaction(async (tx) => {
      const restored = await tx.document.update({
        where: { id },
        data: { status: DocumentStatus.NORMAL, deletedAt: null },
      });
      await this.createLog(tx, id, restored.currentVersionId, user.id, DocumentLogAction.RESTORE, meta);
      return restored;
    });
  }

  async permanentlyDelete(id: string) {
    const document = await this.prisma.document.findUnique({
      where: { id },
      include: {
        versions: { select: { storageKey: true } },
      },
    });
    if (!document) {
      throw new NotFoundException("鏂囦欢涓嶅瓨鍦?");
    }
    if (!document.deletedAt) {
      throw new BadRequestException("璇峰厛灏嗘枃浠剁Щ鍏ュ洖鏀剁珯");
    }

    const storageKeys = document.versions.map((version) => version.storageKey);

    await this.prisma.$transaction(async (tx) => {
      await tx.documentLog.deleteMany({ where: { documentId: id } });
      await tx.documentTag.deleteMany({ where: { documentId: id } });
      await tx.documentPartner.deleteMany({ where: { documentId: id } });
      await tx.document.update({
        where: { id },
        data: { currentVersionId: null },
      });
      await tx.documentVersion.deleteMany({ where: { documentId: id } });
      await tx.document.delete({ where: { id } });
    });

    const deletedFileCount = await this.storageService.deleteDocumentFiles(storageKeys);

    return {
      id,
      deletedFileCount,
      expectedFileCount: new Set(storageKeys).size,
    };
  }

  async suggestDocumentNo(categoryId: string) {
    const category = await this.requirePrimaryCategory(categoryId);
    return { documentNo: await this.generateDocumentNo(category.code) };
  }

  private queueContentIndex(versionId: string | null | undefined) {
    if (!versionId || typeof this.contentIndexService?.indexVersion !== "function") {
      return;
    }
    void this.contentIndexService.indexVersion(versionId).catch(() => undefined);
  }

  private async buildListWhere(query: ListDocumentsDto, deleted: boolean): Promise<Prisma.DocumentWhereInput> {
    const keywordConditions = this.buildKeywordConditions(query.keyword);
    const subcategoryIds = query.subcategoryId ? await this.getSubcategoryScope(query.subcategoryId) : undefined;
    return {
      deletedAt: deleted ? { not: null } : null,
      status: deleted ? DocumentStatus.DELETED : query.status ?? { not: DocumentStatus.DELETED },
      categoryId: query.categoryId,
      subcategoryId: subcategoryIds ? { in: subcategoryIds } : undefined,
      documentTags: query.tagId ? { some: { tagId: query.tagId } } : undefined,
      documentPartners: query.partnerId ? { some: { partnerId: query.partnerId } } : undefined,
      versions: query.uploaderId ? { some: { uploadUserId: query.uploaderId } } : undefined,
      createdAt:
        query.uploadedFrom || query.uploadedTo
          ? {
              gte: query.uploadedFrom ? new Date(query.uploadedFrom) : undefined,
              lte: query.uploadedTo ? new Date(query.uploadedTo) : undefined,
            }
          : undefined,
      AND: keywordConditions.length ? keywordConditions : undefined,
    };
  }

  private async getSubcategoryScope(categoryId: string) {
    const categories = await this.prisma.category.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, parentId: true },
    });
    return getCategoryDescendantIds(categories, categoryId);
  }

  private buildExportWhere(
    dto: ExportDocumentsDto,
    documentIds: string[],
    categories: Array<{ id: string; name: string; parentId: string | null; level: number }>,
  ): Prisma.DocumentWhereInput {
    const baseWhere: Prisma.DocumentWhereInput = {
      deletedAt: null,
      status: { not: DocumentStatus.DELETED },
    };

    if (documentIds.length) {
      return {
        ...baseWhere,
        id: { in: documentIds },
      };
    }

    const category = categories.find((item) => item.id === dto.categoryId);
    if (!category) {
      throw new BadRequestException("导出分类不存在");
    }
    if (category.level === 1) {
      return {
        ...baseWhere,
        categoryId: category.id,
      };
    }

    return {
      ...baseWhere,
      subcategoryId: { in: getCategoryDescendantIds(categories, category.id) },
    };
  }

  private buildExportFileName(dto: ExportDocumentsDto, documentCount: number) {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const scope = dto.categoryId ? "分类文件" : `选中文件${documentCount}份`;
    return `行政资料导出_${scope}_${yyyy}${mm}${dd}.zip`;
  }

  private isStorageNotFound(error: unknown) {
    return error instanceof NotFoundException;
  }

  private buildKeywordConditions(keyword?: string): Prisma.DocumentWhereInput[] {
    const terms = this.splitSearchTerms(keyword);
    return terms.map((term) => ({
      OR: [
        { title: { contains: term, mode: "insensitive" } },
        { documentNo: { contains: term, mode: "insensitive" } },
        { remark: { contains: term, mode: "insensitive" } },
        { category: { name: { contains: term, mode: "insensitive" } } },
        { subcategory: { name: { contains: term, mode: "insensitive" } } },
        { department: { name: { contains: term, mode: "insensitive" } } },
        { creator: { realName: { contains: term, mode: "insensitive" } } },
        { creator: { username: { contains: term, mode: "insensitive" } } },
        { currentVersion: { is: { originalFileName: { contains: term, mode: "insensitive" } } } },
        { currentVersion: { is: { versionLabel: { contains: term, mode: "insensitive" } } } },
        { currentVersion: { is: { fileExt: { contains: term, mode: "insensitive" } } } },
        {
          currentVersion: {
            is: {
              contentIndex: {
                is: {
                  status: "READY",
                  extractedText: { contains: term, mode: "insensitive" },
                },
              },
            },
          },
        },
        { documentTags: { some: { tag: { name: { contains: term, mode: "insensitive" } } } } },
        {
          documentPartners: {
            some: { partner: { companyName: { contains: term, mode: "insensitive" } } },
          },
        },
      ],
    }));
  }

  private splitSearchTerms(keyword?: string) {
    return [
      ...new Set(
        (keyword ?? "")
          .trim()
          .split(/[\s,，;；、]+/)
          .map((term) => term.trim())
          .filter(Boolean)
          .slice(0, 8),
      ),
    ];
  }

  private documentInclude() {
    return {
      category: true,
      subcategory: true,
      department: true,
      creator: { select: { id: true, username: true, realName: true, role: true, status: true } },
      currentVersion: true,
      documentTags: { include: { tag: true } },
      documentPartners: { include: { partner: true } },
    } satisfies Prisma.DocumentInclude;
  }

  private async generateDocumentNo(prefix: string | null, offset = 0) {
    if (!prefix) {
      throw new BadRequestException("一级分类缺少编号前缀");
    }
    const now = new Date();
    const base = buildDocumentNumber(prefix, now, 0).slice(0, -3);
    const latest = await this.prisma.document.findFirst({
      where: { documentNo: { startsWith: base } },
      orderBy: { documentNo: "desc" },
      select: { documentNo: true },
    });
    const latestSequence = latest ? parseDocumentNumberSequence(latest.documentNo) : null;
    return buildDocumentNumber(prefix, now, (latestSequence ?? 0) + offset + 1);
  }

  private buildVersionLabel(versionNo: string, date: Date): string {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${versionNo} - ${yyyy}-${mm}-${dd}`;
  }

  private async requirePrimaryCategory(id: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, level: 1, deletedAt: null },
    });
    if (!category) {
      throw new BadRequestException("一级分类不存在");
    }
    return category;
  }

  private async requireSubcategory(id: string | undefined, parentId: string) {
    if (!id) {
      return;
    }
    const category = await this.prisma.category.findFirst({
      where: { id, deletedAt: null },
    });
    if (!category || category.level === 1) {
      throw new BadRequestException("子分类不存在或不属于所选一级分类");
    }

    let currentParentId = category.parentId;
    while (currentParentId) {
      if (currentParentId === parentId) {
        return;
      }
      const parent = await this.prisma.category.findFirst({
        where: { id: currentParentId, deletedAt: null },
      });
      currentParentId = parent?.parentId ?? null;
    }

    throw new BadRequestException("子分类不存在或不属于所选一级分类");
  }

  private async requirePartners(partnerIds: string[] | undefined) {
    if (!partnerIds?.length) {
      return;
    }
    const count = await this.prisma.partner.count({
      where: { id: { in: partnerIds }, deletedAt: null },
    });
    if (count !== new Set(partnerIds).size) {
      throw new BadRequestException("存在无效合作单位");
    }
  }

  private async resolveTagIds(tagIds: string[] | undefined, tagNames: string[] | undefined, userId: string) {
    const ids = new Set(tagIds ?? []);
    if (tagIds?.length) {
      const count = await this.prisma.tag.count({
        where: { id: { in: tagIds }, deletedAt: null },
      });
      if (count !== new Set(tagIds).size) {
        throw new BadRequestException("存在无效标签");
      }
    }

    for (const rawName of tagNames ?? []) {
      const name = normalizeTagName(rawName);
      if (!name) {
        continue;
      }
      const tag = await this.prisma.tag.upsert({
        where: { normalized: name.toLowerCase() },
        update: { name, deletedAt: null },
        create: { name, normalized: name.toLowerCase(), createdById: userId },
      });
      ids.add(tag.id);
    }

    return [...ids];
  }

  private async ensureDocumentNoAvailable(documentNo: string, exceptId?: string) {
    const existing = await this.prisma.document.findUnique({ where: { documentNo } });
    if (existing && existing.id !== exceptId) {
      throw new ConflictException("文件编号已存在");
    }
  }

  private isUniqueDocumentNoConflict(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002" &&
      Array.isArray(error.meta?.target) &&
      error.meta.target.includes("document_no")
    );
  }

  private async requireDocument(id: string) {
    const document = await this.prisma.document.findFirst({
      where: { id, deletedAt: null },
    });
    if (!document) {
      throw new NotFoundException("文件不存在");
    }
    return document;
  }

  private async requireDocumentVersion(id: string, versionId: string | undefined) {
    const document = await this.requireDocument(id);
    const targetVersionId = versionId ?? document.currentVersionId;
    if (!targetVersionId) {
      throw new NotFoundException("文件版本不存在");
    }
    const version = await this.prisma.documentVersion.findFirst({
      where: { id: targetVersionId, documentId: id },
    });
    if (!version) {
      throw new NotFoundException("文件版本不存在");
    }

    return { document, version };
  }

  private assertCanModify(document: { creatorId: string }, user: PublicUser) {
    if (user.role === UserRole.ADMIN || document.creatorId === user.id) {
      return;
    }
    throw new ForbiddenException("只能修改自己上传的文件");
  }

  private async replaceRelations(
    tx: Prisma.TransactionClient,
    documentId: string,
    tagIds?: string[],
    partnerIds?: string[],
  ) {
    if (tagIds) {
      await tx.documentTag.deleteMany({ where: { documentId } });
      if (tagIds.length) {
        await tx.documentTag.createMany({
          data: [...new Set(tagIds)].map((tagId) => ({ documentId, tagId })),
          skipDuplicates: true,
        });
      }
    }
    if (partnerIds) {
      await tx.documentPartner.deleteMany({ where: { documentId } });
      if (partnerIds.length) {
        await tx.documentPartner.createMany({
          data: [...new Set(partnerIds)].map((partnerId) => ({ documentId, partnerId })),
          skipDuplicates: true,
        });
      }
    }
  }

  private createLog(
    tx: Prisma.TransactionClient,
    documentId: string,
    versionId: string | null,
    userId: string,
    action: DocumentLogAction,
    meta: DocumentLogMeta,
  ) {
    return tx.documentLog.create({
      data: {
        documentId,
        versionId,
        userId,
        action,
        result: DocumentLogResult.SUCCESS,
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
    });
  }
}
