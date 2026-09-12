import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import {
  buildMigrationReport,
  getMigrationBlockingIssues,
  orderTreeRows,
  parseArgs,
  referenceId,
  readLegacySnapshot,
  reportToCsv,
} from "./migrate-legacy-assets.mjs";

test("parseArgs defaults to a read-only dry-run", () => {
  const sourceDb = resolve("fixtures", "data", "legacy.sqlite");
  const options = parseArgs(["--source-db", sourceDb]);

  assert.equal(options.apply, false);
  assert.equal(options.copyFiles, false);
  assert.equal(options.batchSize, 100);
  assert.equal(options.sourceDb, sourceDb);
  assert.equal(options.sourceStorage, resolve("fixtures", "storage"));
});

test("readLegacySnapshot opens SQLite without changing the source", () => {
  const root = mkdtempSync(join(tmpdir(), "admin-docs-legacy-snapshot-"));
  const sourceDb = join(root, "legacy.sqlite");
  const db = new DatabaseSync(sourceDb);
  db.exec("CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, email TEXT); INSERT INTO users VALUES ('u-1', 'Test User', 'test@example.com');");
  db.close();

  const before = createHash("sha256").update(readFileSync(sourceDb)).digest("hex");
  const snapshot = readLegacySnapshot(sourceDb);
  const afterDb = new DatabaseSync(sourceDb, { readOnly: true });
  const rows = afterDb.prepare("SELECT * FROM users").all();
  afterDb.close();

  assert.equal(snapshot.users.length, 1);
  assert.deepEqual(rows.map((row) => ({ ...row })), [{ id: "u-1", name: "Test User", email: "test@example.com" }]);
  assert.equal(createHash("sha256").update(readFileSync(sourceDb)).digest("hex"), before);
});

test("buildMigrationReport verifies registered files and reports unreferenced files", async () => {
  const root = mkdtempSync(join(tmpdir(), "admin-docs-legacy-files-"));
  const storage = join(root, "storage");
  mkdirSync(join(storage, "org"), { recursive: true });
  mkdirSync(join(storage, "empty"), { recursive: true });
  const bytes = Buffer.from("verified legacy attachment", "utf8");
  writeFileSync(join(storage, "org", "invoice.pdf"), bytes);
  writeFileSync(join(storage, "empty", ".gitkeep"), "", "utf8");
  writeFileSync(join(storage, "orphan.txt"), "orphan", "utf8");
  const snapshot = {
    roles: [],
    user_roles: [],
    users: [],
    organizations: [],
    departments: [],
    locations: [],
    asset_types: [],
    projects: [],
    project_resource_requirements: [],
    assets: [],
    asset_identifiers: [],
    asset_relations: [],
    pending_assets: [],
    reservations: [],
    borrow_records: [],
    handover_records: [],
    transfers: [],
    inventory_tasks: [],
    inventory_records: [],
    asset_files: [{ id: "file-1", file_name: "invoice.pdf", storage_key: "org/invoice.pdf" }],
    file_text_chunks: [],
    ai_conversations: [],
    ai_messages: [],
    approvals: [],
    approval_actions: [],
    approval_signers: [],
    asset_maintenance_records: [],
    anomalies: [],
    asset_exit_requests: [],
    asset_events: [],
    audit_logs: [],
    notifications: [],
  };

  const report = await buildMigrationReport({
    apply: false,
    copyFiles: false,
    sourceDb: join(root, "legacy.sqlite"),
    sourceStorage: storage,
    targetOrganization: "org-target",
    targetStorage: join(root, "target-storage"),
    reportDir: join(root, "reports"),
    batchSize: 100,
  }, snapshot);

  const verified = report.files.find((file) => file.sourceId === "file-1");
  assert.equal(verified.status, "verified");
  assert.equal(verified.size, bytes.length);
  assert.equal(verified.sha256, createHash("sha256").update(bytes).digest("hex"));
  assert.ok(report.issues.some((issue) => issue.code === "UNREFERENCED_FILE" && issue.sourceId === "orphan.txt"));
  assert.ok(!report.issues.some((issue) => issue.sourceId === "empty/.gitkeep"));
  assert.match(reportToCsv(report), /asset_file,file-1,file-1,ready,verified/);
});

test("buildMigrationReport blocks unsafe storage keys", async () => {
  const root = mkdtempSync(join(tmpdir(), "admin-docs-legacy-unsafe-"));
  const report = await buildMigrationReport({
    apply: false,
    copyFiles: false,
    sourceDb: join(root, "legacy.sqlite"),
    sourceStorage: root,
    targetOrganization: "org-target",
    targetStorage: join(root, "target-storage"),
    reportDir: join(root, "reports"),
    batchSize: 100,
  }, {
    roles: [], user_roles: [], users: [], organizations: [], departments: [], locations: [], asset_types: [], projects: [],
    project_resource_requirements: [], assets: [], asset_identifiers: [], asset_relations: [], pending_assets: [], reservations: [],
    borrow_records: [], handover_records: [], transfers: [], inventory_tasks: [], inventory_records: [],
    asset_files: [{ id: "file-unsafe", file_name: "secret.txt", storage_key: "../secret.txt" }],
    file_text_chunks: [], ai_conversations: [], ai_messages: [], approvals: [], approval_actions: [], approval_signers: [],
    asset_maintenance_records: [], anomalies: [], asset_exit_requests: [], asset_events: [], audit_logs: [], notifications: [],
  });

  assert.ok(report.issues.some((issue) => issue.code === "UNSAFE_STORAGE_KEY"));
  assert.ok(report.plan.some((row) => row.sourceId === "file-unsafe" && row.status === "blocked"));
});

test("orderTreeRows writes every parent before its child and rejects cycles", () => {
  const rows = [
    { id: "child", parent_id: "parent", name: "子位置" },
    { id: "parent", parent_id: null, name: "父位置" },
  ];

  assert.deepEqual(orderTreeRows(rows, "parent_id", "位置").map((row) => row.id), ["parent", "child"]);
  assert.throws(
    () => orderTreeRows([
      { id: "a", parent_id: "b" },
      { id: "b", parent_id: "a" },
    ], "parent_id", "位置"),
    /循环/,
  );
});

test("referenceId reads scalar foreign-key columns without treating them as row objects", () => {
  assert.equal(referenceId({ asset_id: "asset-1" }, "asset_id"), "asset-1");
  assert.equal(referenceId({ asset_id: null }, "asset_id"), "");
});

test("migration preflight requires explicit acknowledgement for unsupported data", () => {
  const report = {
    issues: [
      { code: "UNSUPPORTED_AI_HISTORY", entity: "ai_message", sourceId: "message-1" },
      { code: "MISSING_FILE", entity: "asset_file", sourceId: "file-1" },
    ],
  };

  assert.equal(getMigrationBlockingIssues(report).length, 2);
  assert.deepEqual(getMigrationBlockingIssues(report, { allowUnsupported: true }).map((issue) => issue.code), ["MISSING_FILE"]);
});

test("buildMigrationReport blocks assets with missing required type references", async () => {
  const report = await buildMigrationReport({
    apply: false,
    allowUnsupported: false,
    copyFiles: false,
    sourceDb: "legacy.sqlite",
    sourceStorage: "storage",
    targetOrganization: "org-target",
    targetStorage: "target-storage",
    reportDir: "reports",
    batchSize: 100,
  }, {
    roles: [], user_roles: [], users: [], organizations: [], departments: [], locations: [],
    asset_types: [{ id: "type-1", parent_id: null }],
    projects: [], project_resource_requirements: [],
    assets: [{ id: "asset-1", asset_type_id: "missing-type" }],
    asset_identifiers: [], asset_relations: [], pending_assets: [], reservations: [], borrow_records: [],
    handover_records: [], transfers: [], inventory_tasks: [], inventory_records: [], asset_files: [],
    file_text_chunks: [], ai_conversations: [], ai_messages: [], approvals: [], approval_actions: [],
    approval_signers: [], asset_maintenance_records: [], anomalies: [], asset_exit_requests: [],
    asset_events: [], audit_logs: [], notifications: [],
  });

  assert.ok(report.issues.some((issue) => issue.code === "MISSING_REQUIRED_REFERENCE" && issue.sourceId === "asset-1"));
  assert.equal(report.summary.migrationBlockingCount, 1);
});
