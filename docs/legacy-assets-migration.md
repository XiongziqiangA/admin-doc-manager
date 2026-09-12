# 旧资产系统迁移说明

## 范围

`scripts/migrate-legacy-assets.mjs` 用于把旧资产设备系统的 SQLite 数据迁移到合并系统 PostgreSQL。旧系统目录和 SQLite 默认只读，工具不会修改旧库。

可迁移的主要数据包括用户、部门、位置、资产类型、资产、资产识别码、借用、预约、调拨、交接、盘点、维修、异常、退出、审批历史、通知、事件和审计日志。旧 AI 会话/消息没有对应的新模型，工具只在报告中列出，不会假装迁移成功。

## 推荐流程

### 1. 只读 dry-run

```powershell
node scripts/migrate-legacy-assets.mjs `
  --source-db "C:\path\to\asset-management.sqlite" `
  --source-storage "C:\path\to\storage" `
  --report-dir ".\migration-reports"
```

报告包含 JSON 和 CSV 两份文件，至少检查：

- `MISSING_FILE`：数据库登记但源 storage 中不存在，必须修复。
- `UNSAFE_STORAGE_KEY`：路径穿越或不在 storage 根目录内，必须修复。
- `INVALID_HIERARCHY`：树形父子关系循环、重复 ID 或父级缺失，必须修复。
- `MISSING_REQUIRED_REFERENCE`：资产或业务记录引用的必需对象不存在，必须修复。
- `UNSUPPORTED_*`：新系统没有等价模型，需要决定是否接受跳过。
- `UNREFERENCED_FILE`：storage 中有未登记文件，需要决定是否单独保留或清理。

### 2. 迁移附件前的检查

只有指定 `--copy-files` 时，登记在旧库中的附件才会复制到新系统的 `data/storage/legacy-assets/`。复制前会校验源文件 SHA-256，复制后再次校验。目标位置已有相同校验和的文件会复用，不会重复复制。

### 3. apply 前置条件

`--apply` 默认拒绝所有异常。只有明确确认可以跳过的历史数据，才可以增加 `--allow-unsupported`。危险路径、缺失文件、层级错误和必需外键错误即使增加该参数也不会放行。

```powershell
$env:MIGRATION_DEFAULT_PASSWORD = "一次性强密码"
node scripts/migrate-legacy-assets.mjs `
  --source-db "C:\path\to\asset-management.sqlite" `
  --source-storage "C:\path\to\storage" `
  --apply --copy-files --allow-unsupported
```

`MIGRATION_DEFAULT_PASSWORD` 至少 12 个字符，仅用于没有匹配到现有账号的迁移用户；不会写入 JSON、CSV、日志或代码。旧 bcrypt 哈希不会直接复用，新账号使用合并系统的 scrypt 格式。

## 回滚边界

- 所有 PostgreSQL 写入在一个事务中执行，任一数据库写入失败会回滚。
- 新复制的附件在事务失败时会清理；已存在且校验和一致的目标文件不会删除。
- 迁移前仍必须备份目标 PostgreSQL 和 `data/storage`，因为备份是恢复整个系统的最终手段。
- 迁移工具不会删除旧 SQLite、旧 storage 或目标系统已有的正常数据。

## 当前真实源库 dry-run 结果

2026-09-11 对旧资产系统 `data/asset-management.sqlite` 做过只读检查：识别到 2 个组织、5 个用户、2 个资产、3 条借用、1 个盘点任务、2 条审批和 395 条审计日志；没有旧附件记录，也没有发现 storage 中未登记文件。19 条提示全部为旧系统 AI 会话/消息历史无对应迁移模型。

未对目标 PostgreSQL 执行 `--apply`，也未修改旧系统。
