export interface ExportCategoryNode {
  id: string;
  name: string;
  parentId: string | null;
}

export interface ExportManifestRow {
  documentNo: string;
  title: string;
  originalFileName: string;
  categoryPath: string;
  tags: string[];
  versionLabel: string;
  fileSize: number;
  updatedAt: Date | string;
  status: "已导出" | "源文件缺失";
}

const ILLEGAL_ZIP_SEGMENT_CHARS = /[<>:"/\\|?*\x00-\x1F]/g;
const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export function sanitizeZipSegment(value: string | null | undefined, fallback = "未命名") {
  const sanitized = (value ?? "")
    .normalize("NFC")
    .replace(ILLEGAL_ZIP_SEGMENT_CHARS, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+|\.+$/g, "");

  if (!sanitized || WINDOWS_RESERVED_NAMES.test(sanitized)) {
    return fallback;
  }
  return sanitized.slice(0, 120);
}

export function getCategoryPathNames(
  categories: ExportCategoryNode[],
  categoryId: string,
  subcategoryId?: string | null,
) {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const targetId = subcategoryId ?? categoryId;
  const names: string[] = [];
  const seen = new Set<string>();
  let current = byId.get(targetId);

  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    names.unshift(current.name);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }

  if (!names.length) {
    const primary = byId.get(categoryId);
    return [sanitizeZipSegment(primary?.name, "未分类")];
  }

  return names.map((name) => sanitizeZipSegment(name, "未分类"));
}

export function getCategoryDescendantIds(categories: ExportCategoryNode[], categoryId: string) {
  const childIdsByParent = new Map<string, string[]>();
  for (const category of categories) {
    if (!category.parentId) {
      continue;
    }
    childIdsByParent.set(category.parentId, [...(childIdsByParent.get(category.parentId) ?? []), category.id]);
  }

  const ids = new Set<string>([categoryId]);
  const stack = [...(childIdsByParent.get(categoryId) ?? [])];
  while (stack.length) {
    const id = stack.pop();
    if (!id || ids.has(id)) {
      continue;
    }
    ids.add(id);
    stack.push(...(childIdsByParent.get(id) ?? []));
  }

  return [...ids];
}

export function buildReadableExportFileName(input: {
  documentNo: string;
  title: string;
  originalFileName?: string | null;
  fileExt?: string | null;
}) {
  const baseName = sanitizeZipSegment(`${input.documentNo}_${input.title}`, "未命名文件");
  const normalizedExt = normalizeFileExt(input.fileExt) ?? getExtFromFileName(input.originalFileName);
  if (!normalizedExt || baseName.toLowerCase().endsWith(normalizedExt.toLowerCase())) {
    return baseName;
  }
  return `${baseName}${normalizedExt}`;
}

export function buildUniqueZipEntryName(categoryPath: string[], fileName: string, usedNames: Set<string>) {
  const sanitizedPath = categoryPath.map((segment) => sanitizeZipSegment(segment, "未分类"));
  const sanitizedFileName = sanitizeZipSegment(fileName, "未命名文件");
  const ext = getExtFromFileName(sanitizedFileName) ?? "";
  const stem = ext ? sanitizedFileName.slice(0, -ext.length) : sanitizedFileName;
  let candidate = [...sanitizedPath, sanitizedFileName].join("/");
  let counter = 2;

  while (usedNames.has(candidate)) {
    candidate = [...sanitizedPath, `${stem} (${counter})${ext}`].join("/");
    counter += 1;
  }

  usedNames.add(candidate);
  return candidate;
}

export function buildExportManifestCsv(rows: ExportManifestRow[]) {
  const header = [
    "文件编号",
    "文件名称",
    "原始文件名",
    "分类路径",
    "标签",
    "版本",
    "文件大小",
    "更新时间",
    "导出状态",
  ];
  const body = rows.map((row) => [
    row.documentNo,
    row.title,
    row.originalFileName,
    row.categoryPath,
    row.tags.join("、"),
    row.versionLabel,
    String(row.fileSize),
    formatManifestDate(row.updatedAt),
    row.status,
  ]);
  return `\uFEFF${[header, ...body].map((line) => line.map(escapeCsvCell).join(",")).join("\r\n")}\r\n`;
}

function normalizeFileExt(fileExt?: string | null) {
  if (!fileExt) {
    return null;
  }
  const trimmed = fileExt.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.startsWith(".") ? trimmed : `.${trimmed}`;
}

function getExtFromFileName(fileName?: string | null) {
  const sanitized = sanitizeZipSegment(fileName, "");
  const match = sanitized.match(/(\.[^.]+)$/);
  return match?.[1] ?? null;
}

function escapeCsvCell(value: string) {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

function formatManifestDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}
