import { sanitizeZipSegment } from "../documents/document-export";

export const FINANCE_MATERIAL_TYPES = [
  "REIMBURSEMENT_FORM",
  "INVOICE",
  "PAYMENT_FORM",
  "TICKET",
  "CONTRACT",
  "BANK_RECEIPT",
  "OTHER",
] as const;

export type FinanceMaterialTypeValue = (typeof FINANCE_MATERIAL_TYPES)[number];

export interface FinancePackageGroupLike {
  id: string;
  parentId: string | null;
  name: string;
}

export interface FinancePackageItemLike {
  id: string;
  groupId: string | null;
  exportFileName: string | null;
  originalFileName: string;
  versionId: string;
  currentVersionId: string | null;
}

export interface FinancePackageValidationIssue {
  code: "UNGROUPED_FILES" | "OUTDATED_VERSIONS" | "EMPTY_GROUPS" | "DUPLICATE_NAMES";
  level: "warning";
  count: number;
  message: string;
}

export interface FinancePackageValidation {
  groupCount: number;
  itemCount: number;
  ungroupedCount: number;
  outdatedVersionCount: number;
  emptyGroupCount: number;
  duplicateNameCount: number;
  issues: FinancePackageValidationIssue[];
}

export interface FinanceCandidateLike {
  title: string;
  originalFileName: string;
  categoryName: string | null;
  subcategoryName: string | null;
  tagNames: string[];
  remark: string | null;
  extractedText: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

const FINANCE_KEYWORDS = [
  "财务",
  "报销",
  "发票",
  "付款",
  "凭证",
  "回单",
  "流水",
  "工资",
  "税",
  "车票",
  "机票",
  "住宿",
  "餐饮",
] as const;

export function getFinanceGroupPath(groups: FinancePackageGroupLike[], groupId: string | null | undefined) {
  if (!groupId) {
    return [];
  }

  const byId = new Map(groups.map((group) => [group.id, group]));
  const path: string[] = [];
  const visited = new Set<string>();
  let current = byId.get(groupId);

  while (current) {
    if (visited.has(current.id)) {
      throw new Error("财务归集目录存在循环引用");
    }
    visited.add(current.id);
    path.unshift(current.name);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }

  return path;
}

export function buildFinancePackageEntryName(
  input: { rootFolderName: string; groupPath: string[]; fileName: string },
  usedNames: Set<string>,
) {
  const path = [input.rootFolderName, ...input.groupPath].map((segment) => sanitizeZipSegment(segment, "未命名"));
  const sanitizedFileName = sanitizeZipSegment(input.fileName, "未命名文件");
  const extensionMatch = sanitizedFileName.match(/(\.[^.]*)$/);
  const extension = extensionMatch?.[1] ?? "";
  const stem = extension ? sanitizedFileName.slice(0, -extension.length) : sanitizedFileName;
  let candidate = [...path, sanitizedFileName].join("/");
  let counter = 2;

  while (usedNames.has(normalizeEntryKey(candidate))) {
    candidate = [...path, `${stem} (${counter})${extension}`].join("/");
    counter += 1;
  }

  usedNames.add(normalizeEntryKey(candidate));
  return candidate;
}

export function inferFinanceMaterialType(value: string): FinanceMaterialTypeValue {
  const normalized = value.toLowerCase();
  const rules: Array<[FinanceMaterialTypeValue, string[]]> = [
    ["REIMBURSEMENT_FORM", ["日常报销", "报销单", "报销清单"]],
    ["INVOICE", ["发票", "电票"]],
    ["PAYMENT_FORM", ["付款单", "付款凭证"]],
    ["TICKET", ["车票", "机票", "行程单"]],
    ["CONTRACT", ["合同", "协议"]],
    ["BANK_RECEIPT", ["银行回单", "电子回单", "银行流水"]],
  ];

  return rules.find(([, keywords]) => keywords.some((keyword) => normalized.includes(keyword)))?.[0] ?? "OTHER";
}

export function scoreFinanceCandidate(
  candidate: FinanceCandidateLike,
  period: string,
  keyword = "",
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  const fileText = `${candidate.title} ${candidate.originalFileName}`.toLowerCase();
  const categoryText = `${candidate.categoryName ?? ""} ${candidate.subcategoryName ?? ""}`.toLowerCase();
  const tagText = candidate.tagNames.join(" ").toLowerCase();
  const remarkText = (candidate.remark ?? "").toLowerCase();
  const contentText = (candidate.extractedText ?? "").toLowerCase();
  const terms = splitTerms(keyword);

  if ([candidate.createdAt, candidate.updatedAt].some((value) => getChinaMonth(value) === period)) {
    score += 40;
    reasons.push("归集月份");
  } else if (fileText.includes(period.replace("-", ""))) {
    score += 25;
    reasons.push("文件日期");
  }

  if (FINANCE_KEYWORDS.some((term) => fileText.includes(term))) {
    score += 30;
    reasons.push("财务关键词");
  }
  if (FINANCE_KEYWORDS.some((term) => categoryText.includes(term))) {
    score += 25;
    reasons.push("财务分类");
  }
  if (FINANCE_KEYWORDS.some((term) => tagText.includes(term))) {
    score += 15;
    reasons.push("财务标签");
  }

  if (terms.length) {
    if (terms.every((term) => fileText.includes(term))) {
      score += 60;
      reasons.push("文件名匹配");
    } else if (terms.every((term) => categoryText.includes(term))) {
      score += 30;
      reasons.push("分类匹配");
    } else if (terms.every((term) => tagText.includes(term))) {
      score += 25;
      reasons.push("标签匹配");
    } else if (terms.every((term) => remarkText.includes(term) || contentText.includes(term))) {
      score += 15;
      reasons.push("备注或正文匹配");
    }
  }

  return { score, reasons };
}

export function validateFinancePackageLayout(
  groups: FinancePackageGroupLike[],
  items: FinancePackageItemLike[],
): FinancePackageValidation {
  const ungroupedCount = items.filter((item) => !item.groupId).length;
  const outdatedVersionCount = items.filter(
    (item) => Boolean(item.currentVersionId) && item.versionId !== item.currentVersionId,
  ).length;
  const occupiedGroupIds = collectOccupiedGroupIds(groups, items);
  const emptyGroupCount = groups.filter((group) => !occupiedGroupIds.has(group.id)).length;
  const duplicateNameCount = countDuplicateNames(groups, items);
  const issues: FinancePackageValidationIssue[] = [];

  if (ungroupedCount) {
    issues.push({
      code: "UNGROUPED_FILES",
      level: "warning",
      count: ungroupedCount,
      message: `${ungroupedCount} 个文件将直接放在总目录`,
    });
  }
  if (outdatedVersionCount) {
    issues.push({
      code: "OUTDATED_VERSIONS",
      level: "warning",
      count: outdatedVersionCount,
      message: `${outdatedVersionCount} 个文件已有新版本`,
    });
  }
  if (emptyGroupCount) {
    issues.push({
      code: "EMPTY_GROUPS",
      level: "warning",
      count: emptyGroupCount,
      message: `${emptyGroupCount} 个目录尚未放入文件`,
    });
  }
  if (duplicateNameCount) {
    issues.push({
      code: "DUPLICATE_NAMES",
      level: "warning",
      count: duplicateNameCount,
      message: `${duplicateNameCount} 个同目录重名文件将在导出时自动编号`,
    });
  }

  return {
    groupCount: groups.length,
    itemCount: items.length,
    ungroupedCount,
    outdatedVersionCount,
    emptyGroupCount,
    duplicateNameCount,
    issues,
  };
}

function collectOccupiedGroupIds(groups: FinancePackageGroupLike[], items: FinancePackageItemLike[]) {
  const byId = new Map(groups.map((group) => [group.id, group]));
  const occupied = new Set<string>();

  for (const item of items) {
    const visited = new Set<string>();
    let group = item.groupId ? byId.get(item.groupId) : undefined;
    while (group && !visited.has(group.id)) {
      visited.add(group.id);
      occupied.add(group.id);
      group = group.parentId ? byId.get(group.parentId) : undefined;
    }
  }

  return occupied;
}

function countDuplicateNames(groups: FinancePackageGroupLike[], items: FinancePackageItemLike[]) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const folder = getFinanceGroupPath(groups, item.groupId)
      .map((segment) => sanitizeZipSegment(segment, "未命名"))
      .join("/");
    const fileName = sanitizeZipSegment(item.exportFileName || item.originalFileName, "未命名文件");
    const key = normalizeEntryKey([folder, fileName].filter(Boolean).join("/"));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.values()].reduce((total, count) => total + Math.max(0, count - 1), 0);
}

function normalizeEntryKey(value: string) {
  return value.normalize("NFC").toLocaleLowerCase("zh-CN");
}

function splitTerms(keyword: string) {
  return [...new Set(keyword.trim().toLowerCase().split(/[\s,，;；、]+/).filter(Boolean))].slice(0, 8);
}

function getChinaMonth(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 7);
}
