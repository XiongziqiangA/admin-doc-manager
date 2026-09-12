#!/usr/bin/env node

/**
 * Read-only by default migration utility for the former SQLite asset system.
 *
 * The legacy application uses Node's built-in SQLite module and bcrypt hashes;
 * the merged application uses PostgreSQL and scrypt. The tool therefore keeps
 * the source database untouched, writes an auditable plan first, and requires
 * an explicit one-time password for newly imported accounts when --apply is
 * supplied.
 */

import { createHash, randomBytes, scryptSync } from "node:crypto";
import { createReadStream, copyFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { dirname, extname, basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_TARGET_ORGANIZATION_ID = "00000000-0000-4000-8000-000000000001";
const SOURCE_SYSTEM = "ai-asset-management-system-sqlite";

const SOURCE_TABLES = [
  "organizations",
  "departments",
  "locations",
  "users",
  "roles",
  "user_roles",
  "asset_types",
  "projects",
  "project_resource_requirements",
  "assets",
  "asset_identifiers",
  "asset_relations",
  "pending_assets",
  "reservations",
  "borrow_records",
  "handover_records",
  "transfers",
  "inventory_tasks",
  "inventory_records",
  "asset_files",
  "file_text_chunks",
  "ai_conversations",
  "ai_messages",
  "approvals",
  "approval_actions",
  "approval_signers",
  "asset_maintenance_records",
  "anomalies",
  "asset_exit_requests",
  "asset_events",
  "audit_logs",
  "notifications",
];

const ADMIN_ROLE_CODES = new Set(["system_admin", "group_admin", "company_admin", "asset_admin"]);
const CSV_COLUMNS = ["entity", "sourceId", "targetId", "status", "message"];

function printUsage() {
  console.log(`
旧资产 SQLite 迁移工具

默认模式为 dry-run，只读取旧库、校验附件并生成报告：
  node scripts/migrate-legacy-assets.mjs --source-db <旧库路径>

真正写入合并系统必须显式指定：
  MIGRATION_DEFAULT_PASSWORD='一次性初始密码' \
  node scripts/migrate-legacy-assets.mjs --source-db <旧库路径> --apply

可选参数：
  --source-storage <路径>     旧系统 storage 目录，默认按旧库位置推断
  --target-organization <id>  目标企业 ID，默认当前企业固定 ID
  --target-storage <路径>     新系统存储目录，默认 <仓库>/data/storage
  --report-dir <路径>         报告目录，默认 <仓库>/migration-reports
  --batch-size <数量>         分批处理数量，默认 100
  --copy-files                apply 时复制 asset_files 中登记的附件
  --allow-unsupported         明确允许跳过不支持或未登记的历史数据
  --help                      显示帮助

安全约束：
  - 不会修改旧 SQLite 文件。
  - 默认不会连接 PostgreSQL。
  - --apply 必须同时提供 MIGRATION_DEFAULT_PASSWORD，且不会将密码写入报告。
  - --apply 默认要求所有迁移异常均已处理；只有显式指定 --allow-unsupported 才会跳过可确认的历史数据。
  - 不支持的历史表会进入异常清单，不会静默丢弃。
`);
}

export function parseArgs(argv) {
  const options = {
    apply: false,
    copyFiles: false,
    allowUnsupported: false,
    batchSize: 100,
    sourceDb: process.env.LEGACY_ASSET_DB ?? "",
    sourceStorage: process.env.LEGACY_ASSET_STORAGE ?? "",
    targetOrganization: process.env.MIGRATION_TARGET_ORGANIZATION_ID ?? DEFAULT_TARGET_ORGANIZATION_ID,
    targetStorage: process.env.MIGRATION_TARGET_STORAGE ?? join(REPO_ROOT, "data", "storage"),
    reportDir: process.env.MIGRATION_REPORT_DIR ?? join(REPO_ROOT, "migration-reports"),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }
    if (argument === "--apply") {
      options.apply = true;
      continue;
    }
    if (argument === "--copy-files") {
      options.copyFiles = true;
      continue;
    }
    if (argument === "--allow-unsupported") {
      options.allowUnsupported = true;
      continue;
    }
    const [key, inlineValue] = argument.split("=", 2);
    const value = inlineValue ?? argv[++index];
    if (!value || value.startsWith("--")) {
      throw new Error(`参数 ${key} 缺少值`);
    }
    switch (key) {
      case "--source-db":
        options.sourceDb = value;
        break;
      case "--source-storage":
        options.sourceStorage = value;
        break;
      case "--target-organization":
        options.targetOrganization = value;
        break;
      case "--target-storage":
        options.targetStorage = value;
        break;
      case "--report-dir":
        options.reportDir = value;
        break;
      case "--batch-size":
        options.batchSize = Number(value);
        if (!Number.isInteger(options.batchSize) || options.batchSize < 1 || options.batchSize > 1000) {
          throw new Error("--batch-size 必须是 1 到 1000 之间的整数");
        }
        break;
      default:
        throw new Error(`未知参数：${key}`);
    }
  }

  if (options.help) {
    return options;
  }
  if (!options.sourceDb) {
    throw new Error("必须提供 --source-db，或设置 LEGACY_ASSET_DB");
  }
  options.sourceDb = resolve(options.sourceDb);
  if (!options.sourceStorage) {
    options.sourceStorage = resolve(dirname(options.sourceDb), "..", "storage");
  }
  options.sourceStorage = resolve(options.sourceStorage);
  options.targetStorage = resolve(options.targetStorage);
  options.reportDir = resolve(options.reportDir);
  return options;
}

function quoteIdentifier(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`不安全的 SQLite 标识符：${value}`);
  }
  return `"${value}"`;
}

function tableExists(db, table) {
  return Boolean(
    db.prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1").get(table),
  );
}

export function readLegacySnapshot(sourceDbPath) {
  if (!existsSync(sourceDbPath)) {
    throw new Error(`旧 SQLite 文件不存在：${sourceDbPath}`);
  }
  const db = new DatabaseSync(sourceDbPath, { readOnly: true });
  try {
    const tables = {};
    for (const table of SOURCE_TABLES) {
      tables[table] = tableExists(db, table) ? db.prepare(`SELECT * FROM ${quoteIdentifier(table)}`).all() : [];
    }
    return tables;
  } finally {
    db.close();
  }
}

function parseJson(value, fallback) {
  if (value && typeof value === "object") {
    return value;
  }
  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function asDate(value) {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function asNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function text(value, fallback = "") {
  return value === null || value === undefined ? fallback : String(value).trim();
}

function idOf(row) {
  return text(row?.id);
}

export function referenceId(row, field) {
  return text(row?.[field]);
}

export function orderTreeRows(rows, parentField, label) {
  const rowsById = new Map();
  for (const row of rows ?? []) {
    const sourceId = idOf(row);
    if (!sourceId) {
      throw new Error(`${label}存在缺少 ID 的记录，无法安全迁移`);
    }
    if (rowsById.has(sourceId)) {
      throw new Error(`${label}存在重复 ID：${sourceId}`);
    }
    rowsById.set(sourceId, row);
  }

  const visiting = new Set();
  const visited = new Set();
  const ordered = [];
  const visit = (sourceId, path) => {
    if (visited.has(sourceId)) {
      return;
    }
    if (visiting.has(sourceId)) {
      const cycleStart = path.indexOf(sourceId);
      const cycle = [...path.slice(cycleStart), sourceId].join(" -> ");
      throw new Error(`${label}存在循环父级关系：${cycle}`);
    }
    const row = rowsById.get(sourceId);
    if (!row) {
      throw new Error(`${label}引用了不存在的父级：${sourceId}`);
    }
    visiting.add(sourceId);
    const parentId = text(row[parentField]);
    if (parentId) {
      if (!rowsById.has(parentId)) {
        throw new Error(`${label} ${sourceId} 引用了不存在的父级：${parentId}`);
      }
      visit(parentId, [...path, sourceId]);
    }
    visiting.delete(sourceId);
    visited.add(sourceId);
    ordered.push(row);
  };

  for (const sourceId of rowsById.keys()) {
    visit(sourceId, []);
  }
  return ordered;
}

function roleForLegacyUser(userId, roles, userRoles) {
  const roleById = new Map(roles.map((role) => [role.id, role.code]));
  const roleCodes = userRoles.filter((binding) => binding.user_id === userId).map((binding) => roleById.get(binding.role_id));
  return roleCodes.some((code) => ADMIN_ROLE_CODES.has(code)) ? "ADMIN" : "EMPLOYEE";
}

function normalizedUsername(user, used) {
  const email = text(user.email);
  const localPart = email.split("@", 1)[0].toLowerCase().replace(/[^a-z0-9_.-]/g, "");
  const base = localPart || `legacy_${idOf(user).slice(0, 8)}`;
  let username = base.slice(0, 80) || `legacy_${idOf(user).slice(0, 8)}`;
  let suffix = 2;
  while (used.has(username)) {
    username = `${base.slice(0, Math.max(1, 80 - String(suffix).length - 1))}_${suffix}`;
    suffix += 1;
  }
  used.add(username);
  return username;
}

function mapStatus(value, mappings, fallback) {
  return mappings[text(value).toLowerCase()] ?? fallback;
}

function addIssue(report, entity, sourceId, code, message) {
  report.issues.push({ entity, sourceId: sourceId || null, code, message });
}

function addPlanRow(report, entity, sourceId, targetId, status, message = "") {
  report.plan.push({ entity, sourceId: sourceId || "", targetId: targetId || "", status, message });
}

const ACKNOWLEDGEABLE_ISSUE_CODES = new Set(["UNREFERENCED_FILE", "COPY_FILES_NOT_ENABLED"]);

function isAcknowledgeableIssue(issue) {
  return ACKNOWLEDGEABLE_ISSUE_CODES.has(issue.code) || issue.code.startsWith("UNSUPPORTED_");
}

export function getMigrationBlockingIssues(report, options = {}) {
  return report.issues.filter((issue) => !options.allowUnsupported || !isAcknowledgeableIssue(issue));
}

async function hashFile(filePath) {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) {
    digest.update(chunk);
  }
  return digest.digest("hex");
}

function walkFiles(root) {
  if (!existsSync(root)) {
    return [];
  }
  const result = [];
  const visit = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const absolutePath = join(current, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
      } else if (entry.isFile()) {
        const stats = statSync(absolutePath);
        result.push({
          relativePath: relative(root, absolutePath).split(sep).join("/"),
          absolutePath,
          size: stats.size,
          modifiedAt: stats.mtime.toISOString(),
        });
      }
    }
  };
  visit(root);
  return result;
}

function safeStoragePath(root, storageKey) {
  const normalizedKey = text(storageKey).replaceAll("\\", "/").replace(/^\/+/, "");
  if (!normalizedKey || normalizedKey.split("/").some((part) => part === "..")) {
    return null;
  }
  const candidate = resolve(root, normalizedKey);
  const rootWithSeparator = `${resolve(root)}${sep}`;
  if (candidate !== resolve(root) && !candidate.startsWith(rootWithSeparator)) {
    return null;
  }
  return candidate;
}

export async function buildMigrationReport(options, snapshot) {
  const report = {
    schemaVersion: 1,
    sourceSystem: SOURCE_SYSTEM,
    generatedAt: new Date().toISOString(),
    mode: options.apply ? "apply" : "dry-run",
    allowUnsupported: Boolean(options.allowUnsupported),
    sourceDb: options.sourceDb,
    sourceStorage: options.sourceStorage,
    targetOrganizationId: options.targetOrganization,
    targetStorage: options.targetStorage,
    summary: {},
    plan: [],
    files: [],
    issues: [],
  };

  const roles = snapshot.roles ?? [];
  const usernames = new Set();
  const userMap = new Map();
  for (const user of snapshot.users ?? []) {
    const sourceId = idOf(user);
    const username = normalizedUsername(user, usernames);
    userMap.set(sourceId, { id: sourceId, username, role: roleForLegacyUser(sourceId, roles, snapshot.user_roles ?? []) });
    addPlanRow(report, "user", sourceId, sourceId, "ready", `账号 ${username}，角色 ${userMap.get(sourceId).role}`);
  }

  for (const [entity, rows, parentField] of [
    ["部门", snapshot.departments, "parent_id"],
    ["位置", snapshot.locations, "parent_id"],
    ["资产类型", snapshot.asset_types, "parent_id"],
    ["项目", snapshot.projects, "parent_id"],
  ]) {
    try {
      orderTreeRows(rows ?? [], parentField, entity);
    } catch (error) {
      addIssue(report, entity, null, "INVALID_HIERARCHY", error instanceof Error ? error.message : String(error));
    }
  }

  const assetTypeIds = new Set((snapshot.asset_types ?? []).map(idOf));
  const assetIds = new Set((snapshot.assets ?? []).map(idOf));
  for (const asset of snapshot.assets ?? []) {
    const sourceId = idOf(asset);
    if (!referenceId(asset, "asset_type_id") || !assetTypeIds.has(referenceId(asset, "asset_type_id"))) {
      addIssue(report, "asset", sourceId, "MISSING_REQUIRED_REFERENCE", `资产 ${sourceId} 没有可用的资产类型引用`);
    }
  }
  for (const [entity, rows] of [
    ["reservation", snapshot.reservations],
    ["borrow", snapshot.borrow_records],
    ["transfer", snapshot.transfers],
    ["handover", snapshot.handover_records],
    ["inventory_record", snapshot.inventory_records],
    ["maintenance", snapshot.asset_maintenance_records],
    ["asset_exit", snapshot.asset_exit_requests],
    ["asset_event", snapshot.asset_events],
  ]) {
    for (const row of rows ?? []) {
      const assetId = referenceId(row, "asset_id");
      if (!assetId || !assetIds.has(assetId)) {
        addIssue(report, entity, idOf(row), "MISSING_REQUIRED_REFERENCE", `关联资产不存在：${assetId}`);
      }
    }
  }

  const simpleEntities = [
    ["organization", snapshot.organizations],
    ["department", snapshot.departments],
    ["location", snapshot.locations],
    ["asset_type", snapshot.asset_types],
    ["asset", snapshot.assets],
    ["asset_identifier", snapshot.asset_identifiers],
    ["pending_asset", snapshot.pending_assets],
    ["project", snapshot.projects],
    ["reservation", snapshot.reservations],
    ["borrow", snapshot.borrow_records],
    ["handover", snapshot.handover_records],
    ["transfer", snapshot.transfers],
    ["inventory_task", snapshot.inventory_tasks],
    ["inventory_record", snapshot.inventory_records],
    ["maintenance", snapshot.asset_maintenance_records],
    ["anomaly", snapshot.anomalies],
    ["asset_exit", snapshot.asset_exit_requests],
    ["asset_event", snapshot.asset_events],
    ["notification", snapshot.notifications],
  ];
  for (const [entity, rows = []] of simpleEntities) {
    for (const row of rows) {
      const sourceId = idOf(row);
      addPlanRow(report, entity, sourceId, sourceId, "ready");
    }
  }

  for (const [entity, rows = [], code, message] of [
    ["asset_relation", snapshot.asset_relations, "UNSUPPORTED_ASSET_RELATION", "新系统当前没有资产父子关系模型"],
    ["project_resource_requirement", snapshot.project_resource_requirements, "UNSUPPORTED_PROJECT_RESOURCE_REQUIREMENT", "新系统当前没有项目资产需求模型"],
    ["ai_conversation", snapshot.ai_conversations, "UNSUPPORTED_AI_HISTORY", "旧系统 AI 会话不会迁移到统一文件/资产系统"],
    ["ai_message", snapshot.ai_messages, "UNSUPPORTED_AI_HISTORY", "旧系统 AI 消息不会迁移到统一文件/资产系统"],
    ["file_text_chunk", snapshot.file_text_chunks, "UNSUPPORTED_LEGACY_FILE_CHUNK", "旧资产附件正文索引没有对应文件记录，需随附件迁移后重新建立"],
  ]) {
    for (const row of rows ?? []) {
      addIssue(report, entity, idOf(row), code, message);
    }
  }

  const supportedApprovalTypes = new Set(["borrow", "reservation", "transfer", "asset_exit", "asset_intake"]);
  for (const approval of snapshot.approvals ?? []) {
    const sourceType = text(approval.biz_type).toLowerCase();
    if (supportedApprovalTypes.has(sourceType)) {
      addPlanRow(report, "approval", idOf(approval), idOf(approval), "ready", sourceType);
    } else {
      addPlanRow(report, "approval", idOf(approval), "", "skipped", `不支持的历史审批类型：${sourceType || "空"}`);
      addIssue(report, "approval", idOf(approval), "UNSUPPORTED_APPROVAL_TYPE", `历史审批类型 ${sourceType || "空"} 在新系统没有等价枚举，已保留在报告中`);
    }
  }

  const referencedStorageKeys = new Set();
  for (const file of snapshot.asset_files ?? []) {
    const sourceId = idOf(file);
    const storageKey = text(file.storage_key);
    const sourcePath = safeStoragePath(options.sourceStorage, storageKey);
    const fileEntry = {
      sourceId,
      fileName: text(file.file_name, `legacy-${sourceId}`),
      storageKey,
      sourcePath,
      size: null,
      sha256: null,
      status: "missing",
    };
    if (!sourcePath) {
      fileEntry.status = "unsafe-path";
      addIssue(report, "asset_file", sourceId, "UNSAFE_STORAGE_KEY", `存储键超出旧 storage 根目录：${storageKey}`);
    } else if (existsSync(sourcePath)) {
      fileEntry.size = statSync(sourcePath).size;
      fileEntry.sha256 = await hashFile(sourcePath);
      fileEntry.status = "verified";
      referencedStorageKeys.add(storageKey.replaceAll("\\", "/"));
    } else {
      addIssue(report, "asset_file", sourceId, "MISSING_FILE", `数据库登记的文件不存在：${storageKey}`);
    }
    report.files.push(fileEntry);
    addPlanRow(report, "asset_file", sourceId, sourceId, fileEntry.status === "verified" ? "ready" : "blocked", fileEntry.status);
  }

  for (const file of walkFiles(options.sourceStorage)) {
    const normalizedPath = file.relativePath.replaceAll("\\", "/");
    if (basename(normalizedPath) === ".gitkeep" || referencedStorageKeys.has(normalizedPath)) {
      continue;
    }
    addIssue(report, "storage", normalizedPath, "UNREFERENCED_FILE", "storage 中存在未被 asset_files 登记的文件");
    report.files.push({ ...file, storageKey: normalizedPath, sha256: await hashFile(file.absolutePath), status: "unreferenced" });
  }

  for (const [table, rows = []] of Object.entries(snapshot)) {
    report.summary[table] = rows.length;
  }
  report.summary.planRows = report.plan.length;
  report.summary.fileBytes = report.files.reduce((total, file) => total + (Number(file.size) || 0), 0);
  report.summary.issueCount = report.issues.length;
  report.summary.blockedCount = report.plan.filter((row) => row.status === "blocked").length;
  report.summary.migrationBlockingCount = getMigrationBlockingIssues(report, { allowUnsupported: options.allowUnsupported }).length;
  return report;
}

function toCsvCell(value) {
  const stringValue = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(stringValue) ? `"${stringValue.replaceAll('"', '""')}"` : stringValue;
}

export function reportToCsv(report) {
  const rows = [CSV_COLUMNS.join(",")];
  for (const row of report.plan) {
    rows.push([row.entity, row.sourceId, row.targetId, row.status, row.message].map(toCsvCell).join(","));
  }
  for (const issue of report.issues) {
    rows.push([issue.entity, issue.sourceId, "", "issue", `${issue.code}: ${issue.message}`].map(toCsvCell).join(","));
  }
  return `${rows.join("\n")}\n`;
}

function chunks(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function legacyPasswordHash(password) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, 64);
  return `scrypt:${salt}:${derivedKey.toString("hex")}`;
}

function enumValue(value, mappings, fallback) {
  return mappings[text(value).toLowerCase()] ?? fallback;
}

function documentNoForLegacyFile(fileId) {
  return `LEGACY-${fileId}`;
}

function fileExt(fileName) {
  return extname(fileName).replace(/^\./, "").toLowerCase();
}

function targetStorageKey(file) {
  const extension = fileExt(file.fileName);
  return `legacy-assets/${file.sourceId}${extension ? `.${extension}` : ""}`;
}

async function copyVerifiedFile(file, targetStorage) {
  if (file.status !== "verified" || !file.sourcePath) {
    return null;
  }
  const key = targetStorageKey(file);
  const destination = safeStoragePath(targetStorage, key);
  if (!destination) {
    throw new Error(`无法生成安全的目标存储键：${key}`);
  }
  if (existsSync(destination)) {
    const existingHash = await hashFile(destination);
    if (existingHash !== file.sha256) {
      throw new Error(`目标存储键已存在但 SHA-256 不一致：${file.fileName}`);
    }
    return { key, targetHash: existingHash, reused: true };
  }
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(file.sourcePath, destination);
  const targetHash = await hashFile(destination);
  if (targetHash !== file.sha256) {
    unlinkSync(destination);
    throw new Error(`复制后 SHA-256 校验失败：${file.fileName}`);
  }
  return { key, targetHash, reused: false };
}

function mapDepartmentId(id, sourceIds) {
  return id && sourceIds.has(id) ? id : null;
}

function mapUserId(id, userMap) {
  return id && userMap.has(id) ? userMap.get(id).id : null;
}

function mapAssetTypeId(id, assetTypeIds) {
  return id && assetTypeIds.has(id) ? id : null;
}

function mapLocationId(id, locationIds) {
  return id && locationIds.has(id) ? id : null;
}

function dateOrNull(value) {
  return asDate(value);
}

async function applyMigration(options, snapshot, report) {
  if (!options.apply) {
    return { applied: false, imported: 0 };
  }
  const defaultPassword = process.env.MIGRATION_DEFAULT_PASSWORD;
  if (!defaultPassword || defaultPassword.length < 12) {
    throw new Error("--apply 必须提供 MIGRATION_DEFAULT_PASSWORD，且长度至少为 12；密码不会写入报告");
  }

  const { PrismaClient, UserRole, UserStatus } = await import("@prisma/client");
  let prisma = new PrismaClient();
  const rootPrisma = prisma;
  const importReport = { applied: true, imported: 0, updated: 0, skipped: 0, errors: [] };
  const copiedStorageKeys = [];
  const userMap = new Map((snapshot.users ?? []).map((user) => [idOf(user), { id: idOf(user) }]));
  const departmentIds = new Set((snapshot.departments ?? []).map(idOf));
  const locationIds = new Set((snapshot.locations ?? []).map(idOf));
  const assetTypeIds = new Set((snapshot.asset_types ?? []).map(idOf));
  const projectIds = new Set((snapshot.projects ?? []).map(idOf));
  const creatorId = (await prisma.user.findFirst({ where: { organizationId: options.targetOrganization, role: UserRole.ADMIN, deletedAt: null }, select: { id: true } }))?.id;
  if (!creatorId) {
    throw new Error(`目标企业 ${options.targetOrganization} 没有可用管理员账号，无法作为缺省创建人`);
  }

  const run = async (entity, sourceId, callback) => {
    try {
      const result = await callback();
      if (result === "updated") importReport.updated += 1;
      else if (result === "skipped") importReport.skipped += 1;
      else importReport.imported += 1;
      return result;
    } catch (error) {
      importReport.errors.push({ entity, sourceId, message: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  };

  try {
    await rootPrisma.$transaction(async (transactionPrisma) => {
      prisma = transactionPrisma;
      const organization = await prisma.organization.findUnique({ where: { id: options.targetOrganization } });
    if (!organization || organization.deletedAt) {
      throw new Error(`目标企业不存在或已删除：${options.targetOrganization}`);
    }

    const roleBySource = new Map();
    for (const user of snapshot.users ?? []) {
      const sourceId = idOf(user);
      const role = roleForLegacyUser(sourceId, snapshot.roles ?? [], snapshot.user_roles ?? []);
      const existingById = await prisma.user.findUnique({ where: { id: sourceId } });
      const planned = report.plan.find((row) => row.entity === "user" && row.sourceId === sourceId);
      const username = planned?.message.match(/^账号 (.+)，角色/)?.[1] ?? `legacy_${sourceId.slice(0, 8)}`;
      const existingByIdentity = existingById ?? await prisma.user.findFirst({
        where: {
          organizationId: options.targetOrganization,
          deletedAt: null,
          OR: [{ username }, ...(text(user.email) ? [{ email: text(user.email) }] : [])],
        },
      });
      const existing = existingByIdentity;
      const data = {
        username: existing ? existing.username : username,
        realName: text(user.name, username),
        role,
        status: user.enabled === 0 ? UserStatus.DISABLED : UserStatus.ACTIVE,
        organizationId: options.targetOrganization,
        departmentId: null,
        email: text(user.email) || null,
        phone: null,
        ...(existing ? {} : { passwordHash: legacyPasswordHash(defaultPassword) }),
      };
      await run("user", sourceId, async () => {
        if (existing && existing.organizationId !== options.targetOrganization) {
          throw new Error("匹配到的用户属于其他企业，已拒绝跨企业覆盖");
        }
        if (existing && existing.username !== username) {
          report.plan.find((row) => row.entity === "user" && row.sourceId === sourceId).targetId = existing.id;
        }
        const saved = existing
          ? await prisma.user.update({ where: { id: existing.id }, data })
          : await prisma.user.create({ data: { id: sourceId, ...data } });
        const roleRecord = await prisma.role.findUnique({ where: { code: role } });
        if (!roleRecord) throw new Error(`目标角色未初始化：${role}`);
        await prisma.organizationMember.upsert({
          where: { organizationId_userId: { organizationId: options.targetOrganization, userId: saved.id } },
          update: { isPrimary: true },
          create: { organizationId: options.targetOrganization, userId: saved.id, isPrimary: true },
        });
        await prisma.userRoleBinding.upsert({
          where: { organizationId_userId_roleId: { organizationId: options.targetOrganization, userId: saved.id, roleId: roleRecord.id } },
          update: {},
          create: { organizationId: options.targetOrganization, userId: saved.id, roleId: roleRecord.id },
        });
        roleBySource.set(sourceId, role);
        userMap.set(sourceId, { id: saved.id, role });
        return existing ? "updated" : "created";
      });
    }

    for (const rows of chunks(orderTreeRows(snapshot.departments ?? [], "parent_id", "部门"), options.batchSize)) {
      for (const row of rows) {
        const sourceId = idOf(row);
        await run("department", sourceId, async () => {
          const existing = await prisma.department.findUnique({ where: { id: sourceId } });
          const data = { name: text(row.name, `迁移部门 ${sourceId}`), parentId: mapDepartmentId(referenceId(row, "parent_id"), departmentIds), managerNote: text(row.code) ? `旧系统编码：${text(row.code)}` : null };
          if (existing && existing.name !== data.name) throw new Error(`相同部门 ID 已存在但名称不同：${existing.name}`);
          return existing
            ? (await prisma.department.update({ where: { id: sourceId }, data }), "updated")
            : (await prisma.department.create({ data: { id: sourceId, ...data } }), "created");
        });
      }
    }

    for (const user of snapshot.users ?? []) {
      const departmentId = mapDepartmentId(text(user.department_id), departmentIds);
      if (!departmentId) {
        continue;
      }
      await run("user-department", idOf(user), async () => {
        const targetUserId = userMap.get(idOf(user))?.id ?? idOf(user);
        await prisma.user.update({ where: { id: targetUserId }, data: { departmentId } });
        return "updated";
      });
    }

    for (const rows of chunks(orderTreeRows(snapshot.locations ?? [], "parent_id", "位置"), options.batchSize)) {
      for (const row of rows) {
        const sourceId = idOf(row);
        await run("location", sourceId, async () => {
          const existing = await prisma.location.findUnique({ where: { id: sourceId } });
          const data = { organizationId: options.targetOrganization, name: text(row.name, `迁移位置 ${sourceId}`), code: text(row.code, `LEGACY-${sourceId.slice(0, 8)}`).toUpperCase(), enabled: row.enabled !== 0, parentId: mapLocationId(text(row.parent_id), locationIds) };
          if (existing && existing.organizationId !== options.targetOrganization) throw new Error("位置已属于其他企业");
          return existing
            ? (await prisma.location.update({ where: { id: sourceId }, data }), "updated")
            : (await prisma.location.create({ data: { id: sourceId, ...data } }), "created");
        });
      }
    }

    for (const rows of chunks(orderTreeRows(snapshot.asset_types ?? [], "parent_id", "资产类型"), options.batchSize)) {
      for (const row of rows) {
        const sourceId = idOf(row);
        await run("asset_type", sourceId, async () => {
          const existing = await prisma.assetType.findUnique({ where: { id: sourceId } });
          const data = { organizationId: options.targetOrganization, name: text(row.name, `迁移资产类型 ${sourceId}`), code: text(row.code, `LEGACY-${sourceId.slice(0, 8)}`).toUpperCase(), enabled: row.enabled !== 0, parentId: mapAssetTypeId(text(row.parent_id), assetTypeIds), fieldSchema: parseJson(row.field_schema, []) };
          if (existing && existing.organizationId !== options.targetOrganization) throw new Error("资产类型已属于其他企业");
          return existing
            ? (await prisma.assetType.update({ where: { id: sourceId }, data }), "updated")
            : (await prisma.assetType.create({ data: { id: sourceId, ...data } }), "created");
        });
      }
    }

    for (const rows of chunks(orderTreeRows(snapshot.projects ?? [], "parent_id", "项目"), options.batchSize)) {
      for (const row of rows) {
        const sourceId = idOf(row);
        await run("project", sourceId, async () => {
          const ownerId = mapUserId(referenceId(row, "manager_user_id"), userMap) ?? creatorId;
          const data = { matterNo: `LEGACY-PROJECT-${sourceId}`, title: text(row.name, `迁移项目 ${sourceId}`), type: "PROJECT", status: enumValue(row.status, { active: "IN_PROGRESS", closed: "COMPLETED", archived: "COMPLETED" }, "PLANNING"), parentId: referenceId(row, "parent_id") || null, ownerId, ownerName: null, createdById: creatorId, departmentId: mapDepartmentId(referenceId(row, "department_id"), departmentIds), departmentName: null, partnerId: null, partnerName: null, startDate: dateOrNull(row.start_date), endDate: dateOrNull(row.end_date), amount: null, remark: text(row.description) || null };
          const existing = await prisma.businessMatter.findUnique({ where: { id: sourceId } });
          if (existing && existing.matterNo !== data.matterNo) throw new Error("项目 ID 已存在但编号不同");
          return existing
            ? (await prisma.businessMatter.update({ where: { id: sourceId }, data }), "updated")
            : (await prisma.businessMatter.create({ data: { id: sourceId, ...data } }), "created");
        });
      }
    }

    for (const rows of chunks(snapshot.assets ?? [], options.batchSize)) {
      for (const row of rows) {
        const sourceId = idOf(row);
        await run("asset", sourceId, async () => {
          const existingByCode = await prisma.asset.findFirst({ where: { organizationId: options.targetOrganization, assetCode: text(row.asset_code) }, select: { id: true } });
          if (existingByCode && existingByCode.id !== sourceId) throw new Error(`资产编号已被其他资产使用：${text(row.asset_code)}`);
          const existing = await prisma.asset.findUnique({ where: { id: sourceId } });
          const assetTypeId = mapAssetTypeId(referenceId(row, "asset_type_id"), assetTypeIds);
          if (!assetTypeId) throw new Error(`资产类型不存在：${referenceId(row, "asset_type_id")}`);
          const data = { organizationId: options.targetOrganization, businessMatterId: projectIds.has(referenceId(row, "project_id")) ? referenceId(row, "project_id") : null, assetTypeId, departmentId: mapDepartmentId(referenceId(row, "department_id"), departmentIds), locationId: mapLocationId(referenceId(row, "location_id"), locationIds), assetCode: text(row.asset_code, `LEGACY-ASSET-${sourceId}`), name: text(row.name, `迁移资产 ${sourceId}`), brand: text(row.brand) || null, model: text(row.model) || null, serialNumber: text(row.serial_number) || null, supplier: text(row.supplier) || null, purchaseDate: dateOrNull(row.purchase_date), purchaseAmount: asNumber(row.purchase_amount), assetStatus: text(row.asset_status, "active"), resourceStatus: text(row.resource_status, "available"), ownerUserId: mapUserId(referenceId(row, "owner_user_id"), userMap), usingUserId: mapUserId(referenceId(row, "using_user_id"), userMap), customFields: parseJson(row.custom_fields, {}), description: text(row.description) || null, source: "legacy_sqlite_import", qrToken: text(row.qr_token, `legacy:${sourceId}`), version: Number(row.version) > 0 ? Number(row.version) : 1, createdById: mapUserId(referenceId(row, "created_by"), userMap) ?? creatorId, createdAt: dateOrNull(row.created_at) ?? new Date(), updatedAt: dateOrNull(row.updated_at) ?? new Date(), archivedAt: dateOrNull(row.archived_at) };
          if (existing && existing.organizationId !== options.targetOrganization) throw new Error("资产已属于其他企业");
          return existing
            ? (await prisma.asset.update({ where: { id: sourceId }, data }), "updated")
            : (await prisma.asset.create({ data: { id: sourceId, ...data } }), "created");
        });
      }
    }

    const upsertById = async (entity, row, callback) => run(entity, idOf(row), callback);
    for (const row of snapshot.asset_identifiers ?? []) {
      await upsertById("asset_identifier", row, async () => {
        const assetId = referenceId(row, "asset_id");
        if (!(await prisma.asset.findUnique({ where: { id: assetId }, select: { id: true } }))) throw new Error(`关联资产不存在：${assetId}`);
        const existing = await prisma.assetIdentifier.findUnique({ where: { id: idOf(row) } });
        const data = { assetId, identifierType: text(row.identifier_type, "legacy"), value: text(row.value), isPrimary: row.is_primary === 1, createdAt: dateOrNull(row.created_at) ?? new Date() };
        return existing
          ? (await prisma.assetIdentifier.update({ where: { id: idOf(row) }, data }), "updated")
          : (await prisma.assetIdentifier.create({ data: { id: idOf(row), ...data } }), "created");
      });
    }

    for (const row of snapshot.pending_assets ?? []) {
      await upsertById("pending_asset", row, async () => {
        const submittedById = mapUserId(text(row.submitted_by), userMap) ?? creatorId;
        const existing = await prisma.pendingAsset.findUnique({ where: { id: idOf(row) } });
        const data = { organizationId: options.targetOrganization, submittedById, source: text(row.source, "legacy_sqlite_import"), rawPayload: parseJson(row.raw_payload, {}), aiFields: parseJson(row.ai_fields, null), confidence: asNumber(row.confidence), duplicateCandidates: parseJson(row.duplicate_candidates, []), status: text(row.status, "pending"), reviewNote: text(row.review_note) || null, reviewedById: mapUserId(text(row.reviewed_by), userMap), createdAt: dateOrNull(row.created_at) ?? new Date(), reviewedAt: dateOrNull(row.reviewed_at) };
        return existing
          ? (await prisma.pendingAsset.update({ where: { id: idOf(row) }, data }), "updated")
          : (await prisma.pendingAsset.create({ data: { id: idOf(row), ...data } }), "created");
      });
    }

    const reservationMap = new Map();
    for (const row of snapshot.reservations ?? []) {
      await upsertById("reservation", row, async () => {
        const existing = await prisma.assetReservation.findUnique({ where: { id: idOf(row) } });
        const data = { organizationId: options.targetOrganization, assetId: referenceId(row, "asset_id"), applicantId: mapUserId(referenceId(row, "applicant_id"), userMap) ?? creatorId, businessMatterId: projectIds.has(referenceId(row, "project_id")) ? referenceId(row, "project_id") : null, startAt: dateOrNull(row.start_at) ?? new Date(), endAt: dateOrNull(row.end_at) ?? new Date(Date.now() + 3600000), purpose: text(row.purpose, "历史资产预约"), status: enumValue(row.status, { pending: "PENDING", approved: "APPROVED", active: "ACTIVE", completed: "COMPLETED", cancelled: "CANCELLED", rejected: "REJECTED", expired: "EXPIRED" }, "CANCELLED"), cancelReason: null, cancelledAt: null, createdAt: dateOrNull(row.created_at) ?? new Date(), updatedAt: dateOrNull(row.updated_at) ?? new Date() };
        reservationMap.set(idOf(row), idOf(row));
        return existing
          ? (await prisma.assetReservation.update({ where: { id: idOf(row) }, data }), "updated")
          : (await prisma.assetReservation.create({ data: { id: idOf(row), ...data } }), "created");
      });
    }

    for (const row of snapshot.borrow_records ?? []) {
      await upsertById("borrow", row, async () => {
        const existing = await prisma.assetBorrowRecord.findUnique({ where: { id: idOf(row) } });
        const data = { organizationId: options.targetOrganization, assetId: referenceId(row, "asset_id"), applicantId: mapUserId(referenceId(row, "applicant_id"), userMap) ?? creatorId, reservationId: reservationMap.get(referenceId(row, "reservation_id")) ?? null, businessMatterId: projectIds.has(referenceId(row, "project_id")) ? referenceId(row, "project_id") : null, borrowStart: dateOrNull(row.borrow_start) ?? new Date(), borrowEnd: dateOrNull(row.borrow_end) ?? new Date(Date.now() + 3600000), actualReturnAt: dateOrNull(row.actual_return_at), purpose: text(row.purpose, "历史资产借用"), note: text(row.note) || null, status: enumValue(row.status, { requested: "REQUESTED", approved: "APPROVED", active: "ACTIVE", return_pending: "RETURN_PENDING", returned: "RETURNED", rejected: "REJECTED", cancelled: "CANCELLED" }, "CANCELLED"), cancelReason: null, createdAt: dateOrNull(row.created_at) ?? new Date(), updatedAt: dateOrNull(row.updated_at) ?? new Date() };
        return existing
          ? (await prisma.assetBorrowRecord.update({ where: { id: idOf(row) }, data }), "updated")
          : (await prisma.assetBorrowRecord.create({ data: { id: idOf(row), ...data } }), "created");
      });
    }

    for (const row of snapshot.transfers ?? []) {
      await upsertById("transfer", row, async () => {
        const existing = await prisma.assetTransfer.findUnique({ where: { id: idOf(row) } });
        const data = {
          organizationId: options.targetOrganization,
          assetId: referenceId(row, "asset_id"),
          approvalId: null,
          fromDepartmentId: mapDepartmentId(text(row.from_department_id), departmentIds),
          toDepartmentId: mapDepartmentId(text(row.to_department_id), departmentIds),
          fromLocationId: mapLocationId(text(row.from_location_id), locationIds),
          toLocationId: mapLocationId(text(row.to_location_id), locationIds),
          fromOwnerId: mapUserId(text(row.from_owner_id), userMap),
          toOwnerId: mapUserId(text(row.to_owner_id), userMap),
          reason: text(row.reason, "历史资产调拨"),
          status: enumValue(text(row.status), { pending: "PENDING", approved: "APPROVED", in_transit: "IN_TRANSIT", completed: "COMPLETED", rejected: "REJECTED", cancelled: "CANCELLED" }, "CANCELLED"),
          createdById: mapUserId(text(row.created_by), userMap) ?? creatorId,
          createdAt: dateOrNull(row.created_at) ?? new Date(),
          completedAt: dateOrNull(row.completed_at),
        };
        return existing
          ? (await prisma.assetTransfer.update({ where: { id: idOf(row) }, data }), "updated")
          : (await prisma.assetTransfer.create({ data: { id: idOf(row), ...data } }), "created");
      });
    }

    for (const row of snapshot.handover_records ?? []) {
      await upsertById("handover", row, async () => {
        const existing = await prisma.assetHandoverRecord.findUnique({ where: { id: idOf(row) } });
        const data = { assetId: referenceId(row, "asset_id"), borrowId: referenceId(row, "borrow_id") || null, transferId: referenceId(row, "transfer_id") || null, fromUserId: mapUserId(referenceId(row, "from_user_id"), userMap), toUserId: mapUserId(referenceId(row, "to_user_id"), userMap), handoverType: enumValue(row.handover_type, { checkout: "CHECKOUT", return: "RETURN", transfer: "TRANSFER" }, "TRANSFER"), itemsSnapshot: parseJson(row.items_snapshot, []), note: text(row.note) || null, status: enumValue(row.status, { draft: "DRAFT", confirmed: "CONFIRMED", cancelled: "CANCELLED" }, "DRAFT"), createdById: mapUserId(referenceId(row, "created_by"), userMap) ?? creatorId, createdAt: dateOrNull(row.created_at) ?? new Date(), confirmedAt: dateOrNull(row.confirmed_at) };
        return existing
          ? (await prisma.assetHandoverRecord.update({ where: { id: idOf(row) }, data }), "updated")
          : (await prisma.assetHandoverRecord.create({ data: { id: idOf(row), ...data } }), "created");
      });
    }

    for (const row of snapshot.inventory_tasks ?? []) {
      await upsertById("inventory_task", row, async () => {
        const existing = await prisma.assetInventoryTask.findUnique({ where: { id: idOf(row) } });
        const data = { organizationId: options.targetOrganization, name: text(row.name, "历史盘点任务"), scopeType: enumValue(row.scope_type, { organization: "ORGANIZATION", department: "DEPARTMENT", location: "LOCATION", project: "PROJECT", asset_type: "ASSET_TYPE", asset_list: "ASSET_LIST" }, "ORGANIZATION"), scopeValue: parseJson(row.scope_value, text(row.scope_value) || null), plannedStart: dateOrNull(row.planned_start) ?? new Date(), plannedEnd: dateOrNull(row.planned_end) ?? new Date(Date.now() + 86400000), ownerId: mapUserId(text(row.owner_id), userMap) ?? creatorId, status: enumValue(row.status, { open: "OPEN", completed: "COMPLETED", cancelled: "CANCELLED" }, "OPEN"), createdById: creatorId, createdAt: dateOrNull(row.created_at) ?? new Date(), completedAt: dateOrNull(row.completed_at) };
        return existing
          ? (await prisma.assetInventoryTask.update({ where: { id: idOf(row) }, data }), "updated")
          : (await prisma.assetInventoryTask.create({ data: { id: idOf(row), ...data } }), "created");
      });
    }

    for (const row of snapshot.inventory_records ?? []) {
      await upsertById("inventory_record", row, async () => {
        const existing = await prisma.assetInventoryRecord.findUnique({ where: { id: idOf(row) } });
        const data = { taskId: referenceId(row, "task_id"), assetId: referenceId(row, "asset_id"), checkerId: mapUserId(referenceId(row, "checker_id"), userMap) ?? creatorId, checkedAt: dateOrNull(row.checked_at) ?? new Date(), checkedLocationId: mapLocationId(referenceId(row, "checked_location_id"), locationIds), checkedAssetStatus: text(row.checked_asset_status) || null, checkedOwnerId: mapUserId(referenceId(row, "checked_owner_id"), userMap), result: enumValue(row.result, { normal: "NORMAL", surplus: "SURPLUS", missing: "MISSING", location_mismatch: "LOCATION_MISMATCH", status_mismatch: "STATUS_MISMATCH", owner_mismatch: "OWNER_MISMATCH" }, "NORMAL"), exceptionTypes: text(row.exception_type) ? [text(row.exception_type)] : [], note: text(row.note) || null };
        return existing
          ? (await prisma.assetInventoryRecord.update({ where: { id: idOf(row) }, data }), "updated")
          : (await prisma.assetInventoryRecord.create({ data: { id: idOf(row), ...data } }), "created");
      });
    }

    for (const row of snapshot.asset_maintenance_records ?? []) {
      await upsertById("maintenance", row, async () => {
        const existing = await prisma.assetMaintenanceRecord.findUnique({ where: { id: idOf(row) } });
        const data = {
          organizationId: options.targetOrganization,
          assetId: referenceId(row, "asset_id"),
          maintenanceType: enumValue(text(row.maintenance_type), { repair: "REPAIR", maintenance: "MAINTENANCE", inspection: "INSPECTION" }, "INSPECTION"),
          title: text(row.title, "历史维修保养记录"),
          description: text(row.description) || null,
          vendor: text(row.vendor) || null,
          plannedAt: dateOrNull(row.planned_at),
          startedAt: dateOrNull(row.started_at),
          completedAt: dateOrNull(row.completed_at),
          cost: asNumber(row.cost),
          status: enumValue(text(row.status), { scheduled: "SCHEDULED", in_progress: "IN_PROGRESS", completed: "COMPLETED", cancelled: "CANCELLED" }, "CANCELLED"),
          resourceStatusBefore: text(row.resource_status_before) || null,
          createdById: mapUserId(text(row.created_by), userMap) ?? creatorId,
          createdAt: dateOrNull(row.created_at) ?? new Date(),
          updatedAt: dateOrNull(row.updated_at) ?? dateOrNull(row.created_at) ?? new Date(),
        };
        return existing
          ? (await prisma.assetMaintenanceRecord.update({ where: { id: idOf(row) }, data }), "updated")
          : (await prisma.assetMaintenanceRecord.create({ data: { id: idOf(row), ...data } }), "created");
      });
    }

    for (const row of snapshot.anomalies ?? []) {
      await upsertById("anomaly", row, async () => {
        const existing = await prisma.assetAnomaly.findUnique({ where: { id: idOf(row) } });
        const data = {
          organizationId: options.targetOrganization,
          assetId: text(row.asset_id) || null,
          type: enumValue(text(row.type), { surplus: "SURPLUS", missing: "MISSING", location_mismatch: "LOCATION_MISMATCH", status_mismatch: "STATUS_MISMATCH", owner_mismatch: "OWNER_MISMATCH", damage: "DAMAGE", other: "OTHER" }, "OTHER"),
          severity: enumValue(text(row.severity), { low: "LOW", medium: "MEDIUM", high: "HIGH", critical: "CRITICAL" }, "MEDIUM"),
          status: enumValue(text(row.status), { open: "OPEN", resolved: "RESOLVED" }, "OPEN"),
          sourceType: text(row.source_type) || null,
          sourceId: text(row.source_id) || null,
          description: text(row.description, "历史资产异常"),
          assignedToId: mapUserId(text(row.assigned_to), userMap),
          resolution: text(row.resolution) || null,
          createdAt: dateOrNull(row.created_at) ?? new Date(),
          closedAt: dateOrNull(row.closed_at),
        };
        return existing
          ? (await prisma.assetAnomaly.update({ where: { id: idOf(row) }, data }), "updated")
          : (await prisma.assetAnomaly.create({ data: { id: idOf(row), ...data } }), "created");
      });
    }

    for (const row of snapshot.asset_exit_requests ?? []) {
      await upsertById("asset_exit", row, async () => {
        const existing = await prisma.assetExitRequest.findUnique({ where: { id: idOf(row) } });
        const data = {
          organizationId: options.targetOrganization,
          assetId: referenceId(row, "asset_id"),
          applicantId: mapUserId(text(row.applicant_id), userMap) ?? creatorId,
          approvalId: null,
          exitType: enumValue(text(row.exit_type), { scrapped: "SCRAPPED", lost: "LOST", sold: "SOLD", transferred: "TRANSFERRED", donated: "DONATED", cross_company_transfer: "CROSS_COMPANY_TRANSFER" }, "SCRAPPED"),
          reason: text(row.reason, "历史资产退出申请"),
          status: enumValue(text(row.status), { pending: "PENDING", approved: "APPROVED", rejected: "REJECTED", cancelled: "CANCELLED" }, "CANCELLED"),
          resourceStatusBefore: text(row.resource_status_before) || null,
          createdAt: dateOrNull(row.created_at) ?? new Date(),
          completedAt: dateOrNull(row.completed_at),
        };
        return existing
          ? (await prisma.assetExitRequest.update({ where: { id: idOf(row) }, data }), "updated")
          : (await prisma.assetExitRequest.create({ data: { id: idOf(row), ...data } }), "created");
      });
    }

    const approvalTypeMap = {
      asset_intake: "ASSET_INTAKE",
      borrow: "ASSET_BORROW",
      asset_borrow: "ASSET_BORROW",
      reservation: "ASSET_RESERVATION",
      asset_reservation: "ASSET_RESERVATION",
      transfer: "ASSET_TRANSFER",
      asset_transfer: "ASSET_TRANSFER",
      asset_exit: "ASSET_EXIT",
      exit: "ASSET_EXIT",
    };
    const approvalIdMap = new Map();
    for (const row of snapshot.approvals ?? []) {
      const sourceType = text(row.biz_type).toLowerCase();
      const businessType = approvalTypeMap[sourceType];
      if (!businessType) {
        continue;
      }
      await upsertById("approval", row, async () => {
        const existing = await prisma.approval.findUnique({ where: { id: idOf(row) } });
        const data = {
          organizationId: options.targetOrganization,
          businessType,
          businessId: text(row.biz_id, idOf(row)),
          applicantId: mapUserId(text(row.applicant_id), userMap) ?? creatorId,
          assignedToId: mapUserId(text(row.assigned_to), userMap),
          currentNode: text(row.current_node, "ADMIN_REVIEW"),
          status: enumValue(text(row.status), { pending: "PENDING", approved: "APPROVED", rejected: "REJECTED", cancelled: "CANCELLED" }, "CANCELLED"),
          comment: text(row.comment) || null,
          createdAt: dateOrNull(row.created_at) ?? new Date(),
          completedAt: dateOrNull(row.completed_at),
        };
        const result = existing
          ? (await prisma.approval.update({ where: { id: idOf(row) }, data }), "updated")
          : (await prisma.approval.create({ data: { id: idOf(row), ...data } }), "created");
        approvalIdMap.set(idOf(row), idOf(row));
        return result;
      });
    }

    for (const row of snapshot.approval_actions ?? []) {
      await upsertById("approval_action", row, async () => {
        const approvalId = approvalIdMap.get(text(row.approval_id)) ?? text(row.approval_id);
        if (!approvalIdMap.has(text(row.approval_id))) {
          throw new Error("对应审批类型未迁移，无法迁移审批动作");
        }
        const actorId = mapUserId(text(row.actor_id), userMap) ?? creatorId;
        const existing = await prisma.approvalAction.findUnique({ where: { id: idOf(row) } });
        const data = {
          approvalId,
          actorId,
          action: enumValue(text(row.action), { submit: "SUBMIT", approve: "APPROVE", reject: "REJECT", cancel: "CANCEL" }, "SUBMIT"),
          comment: text(row.comment) || null,
          createdAt: dateOrNull(row.created_at) ?? new Date(),
        };
        return existing
          ? (await prisma.approvalAction.update({ where: { id: idOf(row) }, data }), "updated")
          : (await prisma.approvalAction.create({ data: { id: idOf(row), ...data } }), "created");
      });
    }

    for (const row of snapshot.asset_events ?? []) {
      await upsertById("asset_event", row, async () => {
        const existing = await prisma.assetEvent.findUnique({ where: { id: idOf(row) } });
        const data = {
          organizationId: options.targetOrganization,
          assetId: referenceId(row, "asset_id"),
          actorId: mapUserId(text(row.actor_id), userMap),
          eventType: text(row.event_type, "legacy_event"),
          summary: `历史资产记录：${text(row.event_type, "未命名事件")}`,
          metadata: parseJson(row.payload, {}),
          createdAt: dateOrNull(row.created_at) ?? new Date(),
        };
        return existing
          ? (await prisma.assetEvent.update({ where: { id: idOf(row) }, data }), "updated")
          : (await prisma.assetEvent.create({ data: { id: idOf(row), ...data } }), "created");
      });
    }

    for (const row of snapshot.notifications ?? []) {
      await upsertById("notification", row, async () => {
        const existing = await prisma.notification.findUnique({ where: { id: idOf(row) } });
        const data = {
          organizationId: options.targetOrganization,
          recipientId: mapUserId(text(row.user_id), userMap) ?? creatorId,
          type: text(row.type, "legacy"),
          title: text(row.title, "历史通知"),
          message: text(row.content, "从旧资产系统迁移的通知"),
          entityType: text(row.type, "legacy"),
          entityId: idOf(row),
          dedupeKey: `legacy:${idOf(row)}`,
          metadata: { sourceSystem: SOURCE_SYSTEM },
          readAt: dateOrNull(row.read_at),
          createdAt: dateOrNull(row.created_at) ?? new Date(),
          expiresAt: null,
        };
        return existing
          ? (await prisma.notification.update({ where: { id: idOf(row) }, data }), "updated")
          : (await prisma.notification.create({ data: { id: idOf(row), ...data } }), "created");
      });
    }

    for (const row of snapshot.audit_logs ?? []) {
      await upsertById("audit_log", row, async () => {
        const existing = await prisma.auditLog.findUnique({ where: { id: idOf(row) } });
        const data = {
          organizationId: options.targetOrganization,
          actorId: mapUserId(text(row.actor_id), userMap),
          action: text(row.action, "legacy.event"),
          targetType: text(row.target_type, "legacy"),
          targetId: text(row.target_id, idOf(row)),
          beforeValue: parseJson(row.before_value, text(row.before_value) || null),
          afterValue: parseJson(row.after_value, text(row.after_value) || null),
          result: "SUCCESS",
          requestId: text(row.request_id) || null,
          ipAddress: text(row.ip_address) || null,
          createdAt: dateOrNull(row.created_at) ?? new Date(),
        };
        return existing
          ? (await prisma.auditLog.update({ where: { id: idOf(row) }, data }), "updated")
          : (await prisma.auditLog.create({ data: { id: idOf(row), ...data } }), "created");
      });
    }

    const fileById = new Map(report.files.map((file) => [file.sourceId, file]));
    if (options.copyFiles && (snapshot.asset_files ?? []).length) {
      const category = await prisma.category.findFirst({ where: { code: "ZC", level: 1, deletedAt: null } });
      if (!category) throw new Error("找不到资产设备一级分类（ZC），无法导入附件");
      for (const row of snapshot.asset_files ?? []) {
        const sourceId = idOf(row);
        await upsertById("asset_file", row, async () => {
          const file = fileById.get(sourceId);
          const copied = file ? await copyVerifiedFile(file, options.targetStorage) : null;
          if (!copied) throw new Error("附件未通过源文件校验，未复制");
          if (!copied.reused) copiedStorageKeys.push(copied.key);
          const creator = mapUserId(text(row.uploaded_by), userMap) ?? creatorId;
          const existingDocument = await prisma.document.findUnique({ where: { id: sourceId } });
          const documentData = { title: text(row.file_name, `历史资产附件 ${sourceId}`), documentNo: documentNoForLegacyFile(sourceId), categoryId: category.id, subcategoryId: null, departmentId: null, status: "NORMAL", creatorId: creator, remark: "从旧资产系统迁移", createdAt: dateOrNull(row.created_at) ?? new Date(), updatedAt: dateOrNull(row.created_at) ?? new Date() };
          if (existingDocument && existingDocument.documentNo !== documentData.documentNo) throw new Error("附件对应文档 ID 已存在但编号不同");
          if (existingDocument) {
            await prisma.document.update({ where: { id: sourceId }, data: documentData });
            await prisma.documentVersion.upsert({ where: { id: sourceId }, update: { storageKey: copied.key, fileSize: file.size ?? 0, checksum: file.sha256 ?? "", originalFileName: documentData.title, mimeType: text(row.mime_type, "application/octet-stream"), fileExt: fileExt(documentData.title) }, create: { id: sourceId, documentId: sourceId, versionNo: "V1.0", versionLabel: "迁移版本 V1.0", originalFileName: documentData.title, storageKey: copied.key, fileSize: file.size ?? 0, mimeType: text(row.mime_type, "application/octet-stream"), fileExt: fileExt(documentData.title), checksum: file.sha256 ?? "", uploadUserId: creator, changeNote: "从旧资产系统迁移", createdAt: dateOrNull(row.created_at) ?? new Date() } });
            await prisma.document.update({ where: { id: sourceId }, data: { currentVersionId: sourceId } });
            return "updated";
          }
          await prisma.document.create({ data: { id: sourceId, ...documentData, currentVersion: { create: { id: sourceId, versionNo: "V1.0", versionLabel: "迁移版本 V1.0", originalFileName: documentData.title, storageKey: copied.key, fileSize: file.size ?? 0, mimeType: text(row.mime_type, "application/octet-stream"), fileExt: fileExt(documentData.title), checksum: file.sha256 ?? "", uploadUserId: creator, changeNote: "从旧资产系统迁移", createdAt: dateOrNull(row.created_at) ?? new Date() } } } });
          const assetId = text(row.asset_id);
          if (assetId) await prisma.assetDocument.upsert({ where: { assetId_documentId: { assetId, documentId: sourceId } }, update: {}, create: { organizationId: options.targetOrganization, assetId, documentId: sourceId } });
          return "created";
        });
      }
    } else if ((snapshot.asset_files ?? []).length) {
      for (const row of snapshot.asset_files) addIssue(report, "asset_file", idOf(row), "COPY_FILES_NOT_ENABLED", "存在附件记录；本次未指定 --copy-files，因此只生成校验报告");
    }

      report.import = importReport;
    });
    return importReport;
  } catch (error) {
    report.import = {
      ...importReport,
      applied: false,
      failed: true,
      error: error instanceof Error ? error.message : String(error),
    };
    for (const key of copiedStorageKeys) {
      const destination = safeStoragePath(options.targetStorage, key);
      if (destination && existsSync(destination)) {
        unlinkSync(destination);
      }
    }
    throw error;
  } finally {
    await rootPrisma.$disconnect();
  }
}

async function writeReports(options, report) {
  mkdirSync(options.reportDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[.:]/g, "-");
  const jsonPath = join(options.reportDir, `legacy-assets-${stamp}.json`);
  const csvPath = join(options.reportDir, `legacy-assets-${stamp}.csv`);
  const { writeFileSync } = await import("node:fs");
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(csvPath, reportToCsv(report), "utf8");
  return { jsonPath, csvPath };
}

export async function runMigration(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    printUsage();
    return { options, report: null };
  }
  const snapshot = readLegacySnapshot(options.sourceDb);
  const report = await buildMigrationReport(options, snapshot);
  const blockingIssues = getMigrationBlockingIssues(report, { allowUnsupported: options.allowUnsupported });
  if (options.apply && blockingIssues.length > 0) {
    report.import = {
      applied: false,
      blocked: true,
      errors: blockingIssues.map((issue) => ({ entity: issue.entity, sourceId: issue.sourceId, code: issue.code, message: issue.message })),
    };
    const paths = await writeReports(options, report);
    const preview = blockingIssues.slice(0, 3).map((issue) => `${issue.code}: ${issue.message}`).join("；");
    throw new Error(`迁移预检未通过，已拒绝执行 apply。请先处理异常，或明确指定 --allow-unsupported。报告：${paths.jsonPath}。${preview}`);
  }
  if (options.apply) {
    try {
      await applyMigration(options, snapshot, report);
    } catch (error) {
      const paths = await writeReports(options, report);
      throw new Error(`迁移执行失败，数据库事务已回滚（如已建立）。报告：${paths.jsonPath}。${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const paths = await writeReports(options, report);
  console.log(JSON.stringify({ mode: report.mode, summary: report.summary, issues: report.issues.length, report: paths }, null, 2));
  return { options, report, paths };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runMigration().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
