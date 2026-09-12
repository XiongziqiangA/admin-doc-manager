# 企业行政资料管理系统

企业内部行政资料管理系统，面向单个企业的 PC 端使用场景。系统集中管理行政、合同、财务、人员、供应商等资料，支持文件版本、标签、分类、搜索、回收站、批量导出，以及按月份整理财务资料并生成交付压缩包。

## 当前状态

- 单企业部署，管理员和员工共同使用。
- PC Web 端和 Electron 桌面端均可用。
- 默认生产访问地址：`http://localhost:8080`。
- 数据库和真实文件通过 Docker Compose 持久化保存。
- 财务归集支持本地规则推荐，以及可选的 OpenAI 兼容中转站智能识别；AI 只生成建议，加入交付包前必须人工确认。
- “项目与事项”用于把项目、合同、借款、报销和采购等业务事项与文件建立关联。

## 技术架构

```text
浏览器 / Electron 桌面端
            |
       Nginx 前端容器 :8080
            |
       NestJS 后端容器 :3000
            |
       Prisma ORM
            |
    PostgreSQL 17 数据库

真实文件：data/storage
数据库文件：data/postgres
```

### 前端

- React 19 + TypeScript
- Vite
- Ant Design 5
- Axios
- Nginx 静态资源服务和 `/api` 反向代理

### 后端

- NestJS 11 + TypeScript
- Prisma 6
- PostgreSQL 17
- JWT 登录认证
- `class-validator` 请求参数校验
- Helmet 安全响应头
- Swagger API 文档
- PDF、DOCX、XLSX 等内容索引解析
- ZIP 导出、UTF-8 中文文件名处理

### 桌面端

- Electron 38
- Electron Builder
- 本机模式启动时检查 Docker Desktop 和后端健康状态
- 服务器模式通过 HTTPS 连接已部署的服务器，不启动本机 Docker
- 支持托盘、桌面文件选择、批量上传、拖放上传、文件打开和打印
- 桌面状态页和系统托盘支持启动、停止、重启本项目 Docker 服务
- 桌面端是本地 Web 系统的入口，不替代 PostgreSQL、Docker 或文件存储

## 主要功能

### 文件中心

- 单个或批量上传办公、行政、财务常见格式，包括 PDF、OFD、Office、图片、压缩包、邮件、CAD 和常见音视频格式。
- 文件名重复时提示已有文件，并允许查看后选择不变更或上传新版本。
- 编辑文件名称、一级分类、树形子分类、部门、标签和备注。
- 保存历史版本，版本显示版本号和日期。
- 新版本上传后可在详情中查看历史版本，并可下载指定版本。
- 支持文件详情、预览或打开、下载、打印、移动分类和删除。
- 支持按文件名、分类、标签和已建立的正文索引进行检索；搜索结果支持不完整名称匹配。

### 分类和标签

- 系统提供固定一级行政分类。
- 管理员可以维护树形分类，继续增加多级子分类。
- 分类管理页面可以查看对应分类内的文件。
- 文件卡片直接显示关键标签，避免横向滚动。
- 员工可以添加标签，管理员可以统一修改标签。

### 回收站

- 普通删除先进入回收站，不立即删除真实文件。
- 可恢复文件。
- 永久删除时同时清理数据库记录和对应存储文件。
- 财务归集任务只保存文件关联关系，删除任务或移除条目不会删除源文件。

### 财务月度归集

财务归集独立于正式行政分类树，用于每月交给代账公司的整理工作。

- 新建月度任务，设置任务名称、归属月份、交付总目录名称。
- 支持复制已有任务的交付目录结构。
- 支持任意多级交付目录，例如“人员/报销事项/发票与清单”。
- 根据归集月份、文件日期、文件名、财务关键词、正式分类、标签和正文匹配推荐候选文件。
- 支持按不完整关键词检索候选文件，批量加入指定目录。
- 支持修改材料类型、导出文件名、备注和目录位置。
- 文件加入任务时锁定具体版本；原文件产生新版本后，会提示任务是否切换到最新版本。
- 未分组文件直接放在交付总目录。
- 同一目录中的重名文件自动添加 `(2)`、`(3)` 等后缀。
- 默认保留嵌套 ZIP 原样，不解包、不重组。
- 可选生成 `文件清单.xlsx`，包含来源文件、最终路径、材料类型、版本、大小和 SHA-256。
- 导出为中文目录结构的 ZIP 文件。
- 可选启用“智能识别归集”：后端将文件元数据和已解析正文发送到配置的 OpenAI 兼容中转站，生成材料类型、事项目录和文件名建议；默认关闭，且不会自动修改源文件、正式分类或标签。

管理员登录后，可从左侧“AI 接口配置”进入配置页面，填写中转站基础地址、模型名称和 API Key，保存后立即生效，并可在页面测试连接。API Key 只在后端加密保存，查询接口不会返回原文；员工账号不能访问该配置模块。

### 项目与事项

- 统一维护项目、合同、报销、借款、采购和其他事项，事项编号由系统自动生成。
- 支持事项建立上下级关系，例如“项目”下面挂合同、项目借款和员工报销。
- 支持按名称、编号、备注、类型和状态分页检索事项。
- 支持记录负责人、部门、合作单位、起止日期、金额和备注等业务信息；负责人、部门和合作单位既可以选择标准主数据，也可以为当前事项填写自定义名称。
- 一个事项可以关联多个文件；文件仍保留在文件中心，一个文件也可以关联多个事项。
- 事项详情可查看上下级关系和关联文件，并可直接打开文件详情。
- 员工可以创建和维护自己创建或负责的事项，管理员可以维护全部事项。
- 删除事项采用软删除，只移除事项展示，不删除源文件、文件版本或文件中心记录。
- 事项详情支持跟进任务：负责人、优先级、截止日期、完成状态和操作记录。
- 合同类型事项支持合同编号、相对方、生效/到期日期、续签提醒窗口、金额和状态。
- 事项下支持借款与报销业务记录，可记录金额、往来对象、结算状态和备注。
- 借款与报销记录可以关联文件中心中的凭证文件，并锁定关联时的当前文件版本。
- 项目与事项页面提供待办、逾期、7 天内到期、合同提醒及借款/报销金额概览。

上述业务记录用于日常跟进和资料串联，不等同于审批流或完整会计核算；审批、还款明细、报销核销和自动外部通知仍不在当前范围内。

## 数据保存方式

生产 Docker Compose 使用以下目录挂载：

| 路径 | 内容 | 是否重要 |
| --- | --- | --- |
| `data/postgres` | PostgreSQL 数据库、分类、标签、文件记录、版本和用户 | 必须备份 |
| `data/storage` | 上传文件的真实二进制内容 | 必须备份 |
| `backups` | 数据库 dump 和文件归档 | 建议异地保存 |
| `.env.production` | 数据库密码、JWT 密钥、管理员配置 | 不要外发 |

如果是把已有项目迁移到当前合并版本，可在 `.env.production` 中使用 `POSTGRES_DATA_DIR` 和 `STORAGE_DATA_DIR` 指向原项目的两个数据目录；不要把数据库文件复制到一个新的空目录后再启动。

数据库和 `data/storage` 必须同时保留。只有数据库会导致文件记录存在但无法下载；只有文件目录则无法恢复分类、版本和标签关系。

## 快速启动

### 生产运行

首次使用：

1. 安装并启动 Docker Desktop。
2. 复制 `.env.production.example` 为 `.env.production`。
3. 修改所有 `REPLACE_WITH_*` 配置，尤其是数据库密码、JWT 密钥和管理员密码。
4. 在项目根目录执行：

```powershell
.\scripts\start-prod.ps1 -Build
```

日常启动：

```powershell
.\scripts\start-prod.ps1
```

也可以双击项目根目录的 `start-admin-docs(启动系统）.bat`。

检查服务：

```powershell
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

三个服务均应为 `healthy` 或 `Up`。浏览器打开 `http://localhost:8080`。

### 停止和重启

```powershell
docker compose --env-file .env.production -f docker-compose.prod.yml down
docker compose --env-file .env.production -f docker-compose.prod.yml restart
```

`down` 只停止容器，不会删除 `data/postgres` 和 `data/storage`。

### 桌面应用

桌面端发布文件位于 `desktop/release`。本机模式使用便携版或安装版前，需保留项目目录、`.env.production`、Docker Desktop 和数据目录；首次启动会引导选择项目目录并保存到当前用户配置，项目路径改变后可在托盘“连接设置”重新选择。服务器模式只需配置可访问的 HTTPS 地址。

本机模式启动流程：

1. 检查 Docker Desktop。
2. 启动 Compose 服务。
3. 等待 `/api/health` 正常。
4. 自动打开系统窗口。

服务器模式启动流程：

1. 在桌面端的“连接设置”中选择服务器模式。
2. 填写完整的 HTTPS 服务器地址。
3. 桌面端等待服务器 `/api/health` 正常。
4. 自动打开远程系统窗口；本机不需要 PostgreSQL、Docker 或数据目录。

详细说明见 `docs/desktop-electron.md`。

### 旧资产系统迁移

迁移工具默认只读旧 SQLite 并生成 JSON/CSV 报告：

```powershell
node scripts/migrate-legacy-assets.mjs `
  --source-db "C:\path\to\asset-management.sqlite" `
  --source-storage "C:\path\to\storage"
```

真正写入前必须先检查 dry-run 报告。`--apply` 会在预检通过后使用单个 PostgreSQL 事务执行；缺失文件、危险路径、层级循环和必需外键缺失会直接拒绝执行。旧 AI 历史、未登记文件等可确认跳过的数据，必须显式增加 `--allow-unsupported`；附件迁移还必须增加 `--copy-files`。初始密码通过环境变量 `MIGRATION_DEFAULT_PASSWORD` 提供，不会写入报告：

```powershell
$env:MIGRATION_DEFAULT_PASSWORD = "一次性强密码"
node scripts/migrate-legacy-assets.mjs `
  --source-db "C:\path\to\asset-management.sqlite" `
  --source-storage "C:\path\to\storage" `
  --apply --copy-files
```

迁移前请备份目标数据库和 `data/storage`；未得到明确确认前不要对真实目标库执行 `--apply`。详细边界见 `docs/legacy-assets-migration.md`。

## 备份和恢复

创建备份：

```powershell
.\scripts\backup-prod.ps1
```

备份目录包含 PostgreSQL `database.dump`、文件 `storage.zip` 和清单文件。恢复前请使用明确的备份路径：

```powershell
.\scripts\restore-prod.ps1 -BackupDir "C:\path\to\admin-docs-yyyyMMdd-HHmmss" -ConfirmRestore
```

恢复会替换数据库，恢复前应先做当前备份。详细流程见 `docs/deployment-private.md` 和 `docs/压缩包使用流程.md`。

## 开发和验证

项目使用 pnpm workspace：

```powershell
pnpm install
pnpm typecheck
pnpm -r build
pnpm --filter backend test
pnpm --filter backend prisma:validate
```

常用开发命令：

```powershell
pnpm dev:backend
pnpm dev:frontend
pnpm dev:desktop
```

数据库迁移文件位于 `backend/prisma/migrations`。生产容器启动时会先执行迁移和基础数据 seed，再启动后端。

## 配置说明

关键生产配置：

- `FRONTEND_PORT`：宿主机访问端口，默认 `8080`。
- `DATABASE_URL`：后端连接 PostgreSQL 的地址。
- `JWT_SECRET`：JWT 签名密钥，应使用至少 32 位随机字符串。
- `ADMIN_USERNAME`、`ADMIN_PASSWORD`：初始管理员配置。
- `ALLOWED_ORIGINS`：允许访问的前端来源；本机可使用 HTTP，局域网或公网生产访问必须使用 HTTPS 来源。
- `MAX_UPLOAD_SIZE`：上传大小限制，当前可按部署需要配置。
- `AI_SEARCH_ENABLED`：默认 `false`；当前系统可使用本地正文索引，语义检索需单独配置 API Key。
- `FINANCE_AI_ENABLED`：默认 `false`；启用财务智能识别时还需配置 `OPENAI_API_KEY`、`OPENAI_BASE_URL` 和 `OPENAI_MODEL`。完整配置和隐私边界见 `docs/财务智能识别与中转站配置.md`。
- 管理员通过“AI 接口配置”保存后，数据库配置优先于以上环境变量；删除数据库配置记录后才会回退到环境变量。

初始管理员账号由 `.env.production` 中的 `ADMIN_USERNAME` 和 `ADMIN_PASSWORD` 设置。多人使用前必须配置独立强密码，并妥善保管 `.env.production`。

## 局域网使用

正式多人使用时，应在部署电脑前增加 HTTPS 反向代理（例如 IIS、Caddy 或 Nginx），由代理提供证书并转发到 Compose 暴露的前端端口。生产启动脚本会拒绝非本机的 HTTP 来源，因此不能直接把 `http://192.168.x.x:8080` 作为多人生产入口。

例如代理对外提供 `https://admin.example.internal`，在 `.env.production` 中配置：

```text
ALLOWED_ORIGINS=http://localhost:8080,http://127.0.0.1:8080,https://admin.example.internal
```

然后重启服务并在 Windows 防火墙中只放行代理使用的 HTTPS 端口。其他电脑访问 `https://admin.example.internal`。如果尚未配置 HTTPS，只建议在部署电脑本机使用，不要把生产端口直接暴露给局域网。

## 相关文档

- `docs/财务月度归集与交付中心规格.md`：财务归集功能规格、API 和验收标准。
- `docs/项目与事项中心规格.md`：项目与事项中心的数据模型、API、权限和验收标准。
- `docs/第二第三阶段实施方案与验收标准.md`：业务闭环、协同概览、提醒和日志的实施边界与验收标准。
- `docs/deployment-private.md`：本地私有化部署、备份、恢复和硬化说明。
- `docs/desktop-electron.md`：桌面应用启动和打包说明。
- `docs/压缩包使用流程.md`：完整项目备份包的迁移和恢复流程。
- `docs/验收报告_2026-08-27.md`：前一阶段功能验收记录。
