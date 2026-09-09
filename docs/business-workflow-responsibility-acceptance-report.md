# 项目与事项责任闭环验收报告

## 1. 验收结论

本次“责任到人和过程细化”改造已完成，阶段一、阶段二、阶段三均已落地。系统现在能够围绕一个事项记录：

- 谁创建、谁负责、谁跟进；
- 当前状态、进度、截止时间和逾期情况；
- 谁审批、谁付款、谁结算；
- 下一步由谁在什么时间继续跟进；
- 哪些人员在什么时间做过哪些修改。

当前仍是单企业、单数据空间模式，管理员和员工共享同一企业数据；本次没有引入多租户、完整审批流、消息推送或移动端专用界面。

## 2. 功能交付清单

### 2.1 跟进任务

- 支持标题、说明、负责人、优先级、进度、状态和截止日期。
- 支持待处理、进行中、已完成、已取消的受控状态流转。
- 完成任务必须填写完成说明；取消任务必须填写取消原因。
- 系统保存开始时间、完成时间、完成人、取消时间和取消人。
- 普通员工只能结束自己负责的任务，管理员可以处理全部任务。
- 事项详情支持“全部、我的、未分配、逾期”筛选。

### 2.2 借款与报销

- 支持申请人、经办负责人、审批负责人、付款负责人和结算负责人。
- 新建记录默认把当前用户写入申请人和经办负责人。
- 状态流转由服务端限制：草稿、待处理、已批准、已支付、已结清、已拒绝、已取消。
- 审批、付款、拒绝、结算必须由对应责任人或管理员执行。
- 审批、付款、拒绝和结算会保存实际执行人及时间；拒绝必须填写原因，结清必须填写结算说明。
- 财务记录可以关联文件作为凭证，关联关系不复制、不移动、不删除文件中心源文件。

### 2.3 人工跟进

- 支持电话、微信、邮件、会议、现场和其他跟进方式。
- 每条记录保存跟进人、跟进内容、跟进结果和下一步动作。
- 填写下一次跟进日期时必须同时指定下一责任人。
- 普通员工只能把后续责任指定给自己，管理员可以指定任意启用员工。
- 工作台提供待跟进、逾期跟进和 7 天内跟进统计及提醒。

### 2.4 操作记录

- 事项、任务、合同、借款、报销、凭证关联和人工跟进的关键操作会记录到事项操作记录。
- 每条记录包含操作人、操作时间、动作、摘要、对象类型、对象 ID 和关联事项。
- 修改类操作记录修改前后字段差异；创建或关联类操作记录业务快照和关联信息。
- 前端默认显示摘要，可展开“查看详细变化”。
- 当前没有业务界面可以修改或删除操作记录。

### 2.5 责任统计

- 管理员可在“项目与事项”页面查看责任统计。
- 支持按员工、统计开始日期和统计结束日期筛选。
- 统计任务待处理、已完成、逾期，借款经办、报销经办，审批、付款、结算，人工跟进和逾期跟进。
- 支持导出 UTF-8 CSV，便于留档或交付。
- 责任统计接口和导出接口仅管理员可访问。

## 3. 权限规则

| 场景 | 普通员工 | 管理员 |
| --- | --- | --- |
| 创建任务 | 可以，默认归属事项负责人/当前用户 | 可以指定任意启用员工 |
| 修改任务负责人 | 不允许 | 允许 |
| 完成或取消任务 | 仅任务负责人 | 全部任务 |
| 创建借款/报销 | 可以，申请人和经办默认为自己 | 可以指定全部责任角色 |
| 调整财务责任人 | 不允许 | 允许 |
| 审批、付款、拒绝、结算 | 仅对应责任人 | 可以处理全部记录 |
| 指定下一次跟进责任人 | 只能指定自己 | 可以指定任意启用员工 |
| 查看责任统计 | 不允许 | 允许 |
| 修改/删除操作记录 | 不允许 | 不提供业务修改/删除入口 |

所有关键限制在后端服务层再次校验，前端隐藏控件不作为安全边界。

## 4. API 与数据变更

新增或扩展的接口包括：

```text
GET    /api/business-workflow/overview
GET    /api/business-workflow/reminders
GET    /api/business-workflow/responsibility-report
GET    /api/business-workflow/responsibility-report/export

GET    /api/business-matters/:matterId/tasks
POST   /api/business-matters/:matterId/tasks
PATCH  /api/business-matters/:matterId/tasks/:taskId
DELETE /api/business-matters/:matterId/tasks/:taskId

GET    /api/business-matters/:matterId/follow-ups
POST   /api/business-matters/:matterId/follow-ups

GET    /api/business-matters/:matterId/finance-records
POST   /api/business-matters/:matterId/finance-records
PATCH  /api/business-matters/:matterId/finance-records/:recordId
DELETE /api/business-matters/:matterId/finance-records/:recordId
POST   /api/business-matters/:matterId/finance-records/:recordId/documents
DELETE /api/business-matters/:matterId/finance-records/:recordId/documents/:documentId

GET    /api/business-matters/:matterId/activities
```

数据库迁移：

- `20260909150000_add_business_responsibility_fields`：任务和财务责任字段、实际执行人及时间字段。
- `20260909160000_add_business_follow_ups`：人工跟进表、跟进方式枚举、责任索引。
- `20260909170000_add_task_cancellation_timestamp`：任务取消时间字段，并用既有 `updated_at` 为历史已取消任务做兼容回填。
- 操作记录复用 `business_matter_activities`，通过 JSON `metadata` 保存差异、快照和关联信息。

当前 Docker 数据库已应用 17 个迁移，`prisma migrate status` 返回 `Database schema is up to date`。

## 5. 验证证据

### 自动化验证

- 后端测试：27 个测试文件，126 个测试全部通过。
- 后端 TypeScript 类型检查通过。
- 前端 TypeScript 类型检查通过。
- 桌面端 TypeScript 类型检查通过。
- 后端生产构建通过。
- 前端生产构建通过；Vite 仅提示主 JS chunk 大于 500 KB 的性能建议，不影响构建结果。
- 桌面端构建通过。
- Prisma schema 校验通过。
- `git diff --check` 通过。

### Docker 验证

- `admin-docs-prod-postgres`：healthy。
- `admin-docs-prod-backend`：healthy，映射 `localhost:51120`。
- `admin-docs-prod-frontend`：healthy，访问地址 `http://localhost:8080`。
- 未删除或重建 `data/postgres`、`data/storage`，已有业务数据和文件保持不变。

### 真实接口烟测

使用管理员账号完成登录并调用最新容器接口，结果如下：

```json
{
  "Login": true,
  "Overview": true,
  "ReminderCount": 0,
  "ReportItems": 1,
  "CsvStatus": 200,
  "CancellationTaskStatus": "CANCELLED",
  "CancellationTimestampPresent": true,
  "CancellationActorPresent": true,
  "ActivityContainsCancellationChange": true
}
```

另已验证：缺少下一责任人的非法人工跟进请求返回 HTTP 400；普通员工把后续跟进指定给其他员工会被服务端拒绝；取消任务会返回取消状态、取消时间和取消人，操作记录包含“取消时间”变化；责任统计报表返回管理员数据。

### 浏览器界面验证

在 `http://localhost:8080` 完成管理员登录后：

- “项目与事项”页面能够加载业务工作台、提醒列表和责任统计区域；
- 责任统计表展示员工、账号、待处理任务、已完成任务、逾期任务、财务责任和跟进责任列；
- 当前页面显示已有事项和管理员责任统计数据；
- 页面提供“查询”和“导出 CSV”入口；
- 事项详情代码路径提供“跟进任务、人工跟进、借款与报销、合同信息、操作记录”页签，并在操作记录中展开查看详细变化。

## 6. 验收步骤

1. 打开 `http://localhost:8080`，使用管理员账号登录。
2. 进入“项目与事项”，确认业务工作台显示事项、任务、财务和跟进统计。
3. 打开一个事项，在“跟进任务”中新建任务，确认负责人和截止日期可见；尝试完成任务时确认必须填写完成说明。
4. 在“人工跟进”中填写跟进内容、下一步动作和下一次跟进日期，确认必须选择下一责任人。
5. 在“借款与报销”中新建或编辑记录，确认申请人、经办、审批、付款和结算负责人可显示，并验证状态流转限制。
6. 打开“操作记录”，展开一条记录，确认可以看到操作人、时间及字段变化或快照。
7. 在“责任统计”中按员工或日期查询，确认数据更新；点击“导出 CSV”确认文件可下载。
8. 使用普通员工账号回归权限：不能访问责任统计，不能改派他人任务或下一次跟进，不能越权执行财务状态动作。

## 7. 已知限制与后续建议

- 当前责任统计是业务责任数量统计，不是完整绩效考核或工时统计。
- 人工跟进目前只提供页面提醒，不发送邮件、短信或企业微信消息。
- 操作记录当前保存字段差异和业务快照；尚未做独立的归档、签名或防篡改存证服务。
- 财务模块目前是借款/报销过程跟踪，不替代会计核算、税务申报和银行支付系统。
- 多企业部署前仍需补充租户 ID、租户级数据隔离、成员邀请、组织权限和审计运维策略。

## 8. 版本信息

- 工作分支：`codex/business-matters-phase1`
- 责任基础版提交：`7076b17`
- 人工跟进提交：`24fe276`
- 审计统计提交：`556e04f`
