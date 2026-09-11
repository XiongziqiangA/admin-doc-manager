import { BadRequestException, Injectable } from "@nestjs/common";
import { DocumentStatus, Prisma } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import { EmbeddingService } from "./embedding.service";
import { CONTENT_INDEX_STATUS } from "./document-content.types";

interface SearchCandidate {
  id: string;
  title: string;
  documentNo: string;
  categoryId: string;
  subcategoryId: string | null;
  updatedAt: Date;
  category: { id: string; name: string; parentId: string | null };
  subcategory: { id: string; name: string; parentId: string | null } | null;
  currentVersion: {
    id: string;
    originalFileName: string;
    fileExt: string;
    contentIndex: { status: string; embedding: Prisma.JsonValue | null } | null;
  } | null;
  documentTags: Array<{ tag: { name: string } }>;
  documentPartners: Array<{ partner: { companyName: string } }>;
}

@Injectable()
export class SearchAssistantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingService: EmbeddingService,
  ) {}

  async search(query: string, limit: number) {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      throw new BadRequestException("请输入检索内容");
    }

    const terms = this.splitTerms(normalizedQuery);
    const categories = await this.prisma.category.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, parentId: true },
    });
    const contentMatchIds = await this.findContentMatchIds(terms);
    const candidates = await this.prisma.document.findMany({
      where: {
        deletedAt: null,
        status: { not: DocumentStatus.DELETED },
      },
      select: {
        id: true,
        title: true,
        documentNo: true,
        categoryId: true,
        subcategoryId: true,
        updatedAt: true,
        category: { select: { id: true, name: true, parentId: true } },
        subcategory: { select: { id: true, name: true, parentId: true } },
        currentVersion: {
          select: {
            originalFileName: true,
            fileExt: true,
            id: true,
            contentIndex: {
              select: { status: true, embedding: true },
            },
          },
        },
        documentTags: { select: { tag: { select: { name: true } } } },
        documentPartners: { select: { partner: { select: { companyName: true } } } },
      },
      orderBy: { updatedAt: "desc" },
    }) as SearchCandidate[];

    const queryEmbedding = await this.embeddingService.embed(normalizedQuery).catch(() => null);
    const scored = candidates
      .map((candidate) => this.scoreCandidate(candidate, terms, queryEmbedding?.embedding, contentMatchIds.has(candidate.id)))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score || right.updatedAt.getTime() - left.updatedAt.getTime())
      .slice(0, limit);
    const snippets = await this.loadSnippets(
      scored.flatMap((item) => item.candidate.currentVersion
        ? [{ documentId: item.candidate.id, versionId: item.candidate.currentVersion.id }]
        : []),
      terms,
    );
    const results = scored.map((item) => ({
        documentId: item.candidate.id,
        title: item.candidate.title,
        documentNo: item.candidate.documentNo,
        categoryPath: this.categoryPath(categories, item.candidate.categoryId, item.candidate.subcategoryId),
        matchedBy: item.matchedBy,
        score: Number(item.score.toFixed(4)),
        snippet: this.buildSnippet(item.candidate, terms, snippets.get(item.candidate.id)),
        updatedAt: item.candidate.updatedAt,
      }));

    return {
      mode: queryEmbedding ? "semantic" : "keyword",
      answer: results.length ? `找到 ${results.length} 份相关文件。` : "没有找到相关文件。",
      results,
    };
  }

  private scoreCandidate(
    candidate: SearchCandidate,
    terms: string[],
    queryEmbedding?: number[],
    contentMatched = false,
  ) {
    const fields = [
      ["文件名称", candidate.title, 5],
      ["文件编号", candidate.documentNo, 4],
      ["原始文件名", candidate.currentVersion?.originalFileName ?? "", 4],
      ["分类", [candidate.category.name, candidate.subcategory?.name ?? ""].join(" "), 3],
      ["标签", candidate.documentTags.map((item) => item.tag.name).join(" "), 3],
      ["合作单位", candidate.documentPartners.map((item) => item.partner.companyName).join(" "), 3],
    ] as const;
    const matchedBy: string[] = fields
      .filter(([, value]) => terms.some((term) => value.toLocaleLowerCase().includes(term)))
      .map(([name]) => name);
    if (contentMatched) {
      matchedBy.push("文件内容");
    }
    const keywordScore = terms.length
      ? fields.reduce((score, [, value, weight]) => score + terms.filter((term) => value.toLocaleLowerCase().includes(term)).length * weight, 0) / terms.length
        + (contentMatched ? 2 : 0)
      : 0;
    const vector = candidate.currentVersion?.contentIndex?.embedding;
    const semanticScore = queryEmbedding && candidate.currentVersion?.contentIndex?.status === CONTENT_INDEX_STATUS.READY && Array.isArray(vector)
      ? cosineSimilarity(queryEmbedding, vector)
      : 0;
    return {
      candidate,
      score: semanticScore > 0 ? semanticScore * 100 + keywordScore : keywordScore,
      matchedBy: semanticScore > 0 ? [...new Set([...matchedBy, "文件内容语义"])] : matchedBy,
      updatedAt: candidate.updatedAt,
    };
  }

  private buildSnippet(candidate: SearchCandidate, terms: string[], extractedText?: string) {
    const content = extractedText ?? "";
    const lowerContent = content.toLocaleLowerCase();
    const index = terms.map((term) => lowerContent.indexOf(term)).filter((value) => value >= 0).sort((a, b) => a - b)[0] ?? 0;
    if (content) {
      const start = Math.max(0, index - 60);
      return `${start > 0 ? "..." : ""}${content.slice(start, start + 220)}${start + 220 < content.length ? "..." : ""}`;
    }
    return `${candidate.title}（${candidate.currentVersion?.fileExt || "文件"}）`;
  }

  private async findContentMatchIds(terms: string[]) {
    if (!terms.length) {
      return new Set<string>();
    }

    const matches = await this.prisma.documentContentChunk.findMany({
      where: {
        version: {
          currentFor: {
            is: {
              deletedAt: null,
              status: { not: DocumentStatus.DELETED },
            },
          },
        },
        OR: terms.map((term) => ({
          content: { contains: term, mode: "insensitive" },
        })),
      },
      select: { documentId: true },
      distinct: ["documentId"],
    });
    return new Set(matches.map((match) => match.documentId));
  }

  private async loadSnippets(
    versions: Array<{ documentId: string; versionId: string }>,
    terms: string[],
  ) {
    if (!versions.length) {
      return new Map<string, string>();
    }

    const chunks = await this.prisma.documentContentChunk.findMany({
      where: {
        documentId: { in: versions.map((item) => item.documentId) },
        OR: versions.map((item) => ({ documentId: item.documentId, versionId: item.versionId })),
        ...(terms.length
          ? { AND: [{ OR: terms.map((term) => ({ content: { contains: term, mode: "insensitive" as const } })) }] }
          : {}),
      },
      select: {
        documentId: true,
        content: true,
      },
      orderBy: [{ documentId: "asc" }, { chunkIndex: "asc" }],
    });
    const snippets = new Map<string, string>();
    for (const chunk of chunks) {
      if (!snippets.has(chunk.documentId)) snippets.set(chunk.documentId, chunk.content);
    }
    return snippets;
  }

  private categoryPath(categories: Array<{ id: string; name: string; parentId: string | null }>, categoryId: string, subcategoryId: string | null) {
    const byId = new Map(categories.map((category) => [category.id, category]));
    const names: string[] = [];
    let current = byId.get(subcategoryId ?? categoryId);
    const seen = new Set<string>();
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      names.unshift(current.name);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return names;
  }

  private splitTerms(query: string) {
    return [...new Set(query.trim().split(/[\s,，;；、]+/).map((term) => term.trim().toLocaleLowerCase()).filter(Boolean).slice(0, 12))];
  }
}

function cosineSimilarity(left: number[], right: Prisma.JsonValue) {
  if (!Array.isArray(right) || left.length !== right.length || !right.every((value) => typeof value === "number")) {
    return 0;
  }
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    const rightValue = right[index] as number;
    dot += left[index] * rightValue;
    leftMagnitude += left[index] ** 2;
    rightMagnitude += rightValue ** 2;
  }
  return leftMagnitude && rightMagnitude ? dot / Math.sqrt(leftMagnitude * rightMagnitude) : 0;
}
