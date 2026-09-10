import {
  CheckOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  FileAddOutlined,
  FileTextOutlined,
  PaperClipOutlined,
  PlusOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import {
  Button,
  Cascader,
  Descriptions,
  Empty,
  Form,
  Input,
  InputNumber,
  List,
  Modal,
  Progress,
  Segmented,
  Select,
  Space,
  Spin,
  Statistic,
  Table,
  Tabs,
  Tag,
  Timeline,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useState } from "react";

import {
  attachBusinessFinanceDocuments,
  attachBusinessFollowUpDocuments,
  attachBusinessTaskDocuments,
  createBusinessFollowUp,
  createBusinessFinanceRecord,
  createBusinessTask,
  deleteBusinessContract,
  deleteBusinessFinanceRecord,
  deleteBusinessTask,
  detachBusinessFollowUpDocument,
  detachBusinessFinanceDocument,
  detachBusinessTaskDocument,
  formatApiError,
  getBusinessContract,
  getBusinessResponsibilityReport,
  getBusinessWorkflowOverview,
  listBusinessActivities,
  listBusinessFinanceRecords,
  listBusinessFollowUps,
  listBusinessReminders,
  listBusinessTasks,
  listDocuments,
  updateBusinessFinanceRecord,
  updateBusinessTask,
  uploadDocument,
  exportBusinessResponsibilityReport,
  upsertBusinessContract,
} from "./api";
import type {
  BusinessActivityRecord,
  BusinessFinanceDocumentLink,
  BusinessContractRecord,
  BusinessContractStatus,
  BusinessFollowUpMethod,
  BusinessFollowUpRecord,
  BusinessFinanceKind,
  BusinessFinanceRecord,
  BusinessFinanceStatus,
  BusinessMatterDetail,
  BusinessProjectPlan,
  BusinessReminder,
  BusinessResponsibilityReport,
  BusinessResponsibilityReportItem,
  BusinessTaskPriority,
  BusinessTaskRecord,
  BusinessTaskStatus,
  BusinessWorkflowOverview,
  BusinessWorkflowDocumentLink,
  CategoryNode,
  DocumentRecord,
  PublicUser,
  UserRecord,
} from "./types";

const taskStatusLabels: Record<BusinessTaskStatus, string> = {
  TODO: "待处理",
  IN_PROGRESS: "进行中",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
};

const taskStatusColors: Record<BusinessTaskStatus, string> = {
  TODO: "default",
  IN_PROGRESS: "processing",
  COMPLETED: "success",
  CANCELLED: "default",
};

const priorityLabels: Record<BusinessTaskPriority, string> = {
  LOW: "低",
  NORMAL: "普通",
  HIGH: "高",
  URGENT: "紧急",
};

const priorityColors: Record<BusinessTaskPriority, string> = {
  LOW: "default",
  NORMAL: "blue",
  HIGH: "orange",
  URGENT: "red",
};

const followUpMethodLabels: Record<BusinessFollowUpMethod, string> = {
  CALL: "电话",
  WECHAT: "微信",
  EMAIL: "邮件",
  MEETING: "会议",
  ONSITE: "现场",
  OTHER: "其他",
};

const financeKindLabels: Record<BusinessFinanceKind, string> = {
  LOAN: "借款",
  REIMBURSEMENT: "报销",
};

const financeStatusLabels: Record<BusinessFinanceStatus, string> = {
  DRAFT: "草稿",
  PENDING: "待处理",
  APPROVED: "已批准",
  PAID: "已支付",
  SETTLED: "已结清",
  REJECTED: "已拒绝",
  CANCELLED: "已取消",
};

const contractStatusLabels: Record<BusinessContractStatus, string> = {
  DRAFT: "草稿",
  ACTIVE: "生效中",
  EXPIRED: "已到期",
  TERMINATED: "已终止",
};

interface TaskFormValues {
  title: string;
  description?: string;
  status: BusinessTaskStatus;
  priority: BusinessTaskPriority;
  progress?: number;
  dueDate?: string;
  assigneeId?: string;
  assigneeName?: string;
  completionNote?: string;
  cancellationReason?: string;
  stageId?: string;
  milestoneId?: string;
}

interface FollowUpFormValues {
  method: BusinessFollowUpMethod;
  content: string;
  result?: string;
  nextAction?: string;
  nextAssigneeId?: string;
  nextAssigneeName?: string;
  nextDueAt?: string;
}

interface FinanceFormValues {
  kind: BusinessFinanceKind;
  title: string;
  recordNo?: string;
  amount: number;
  currency: string;
  status: BusinessFinanceStatus;
  applicantId?: string;
  applicantName?: string;
  handlerId?: string;
  handlerName?: string;
  approverId?: string;
  approverName?: string;
  payerId?: string;
  payerName?: string;
  settlementOwnerId?: string;
  settlementOwnerName?: string;
  occurredAt?: string;
  counterparty?: string;
  dueDate?: string;
  settledAt?: string;
  rejectionReason?: string;
  settlementNote?: string;
  remark?: string;
}

type TaskView = "all" | "mine" | "unassigned" | "overdue";

interface ContractFormValues {
  contractNo?: string;
  partyName: string;
  signedAt?: string;
  effectiveAt?: string;
  expiresAt?: string;
  renewalNoticeDays: number;
  amount?: number;
  status: BusinessContractStatus;
  remark?: string;
}

type ReferenceInputMode = "master" | "custom";
type FinancePersonField = "applicant" | "handler" | "approver" | "payer" | "settlementOwner";
type FinancePersonIdField = "applicantId" | "handlerId" | "approverId" | "payerId" | "settlementOwnerId";
type FinancePersonNameField = "applicantName" | "handlerName" | "approverName" | "payerName" | "settlementOwnerName";
type AttachmentTarget =
  | { kind: "TASK"; id: string; title: string; documents: BusinessWorkflowDocumentLink[] }
  | { kind: "FOLLOW_UP"; id: string; title: string; documents: BusinessWorkflowDocumentLink[] }
  | { kind: "FINANCE"; id: string; title: string; documents: BusinessFinanceDocumentLink[] };

interface AttachmentPickerProps {
  categories: CategoryNode[];
  files: File[];
  categoryPath: string[];
  onFilesChange: (files: File[]) => void;
  onCategoryChange: (path: string[]) => void;
}

function AttachmentPicker({
  categories,
  files,
  categoryPath,
  onFilesChange,
  onCategoryChange,
}: AttachmentPickerProps) {
  const attachmentCategoryOptions = toBusinessCategoryOptions(categories);
  return (
    <div className="business-workflow-inline-attachments">
      <Typography.Text strong>附件（可选，可多选）</Typography.Text>
      <Typography.Text type="secondary">选择分类后，可一次选择多个文件，保存记录时会自动上传并关联。</Typography.Text>
      <Cascader
        className="full-width-control"
        options={attachmentCategoryOptions}
        value={categoryPath}
        onChange={(value) => onCategoryChange(value as string[])}
        placeholder="选择附件所属分类"
        changeOnSelect
      />
      <label className="business-workflow-file-picker">
        <PaperClipOutlined />
        <span>{files.length ? `已选择 ${files.length} 份附件，可继续重新选择` : "选择附件文件（可多选）"}</span>
        <input
          type="file"
          multiple
          onChange={(event) => {
            onFilesChange(Array.from(event.target.files ?? []));
            event.currentTarget.value = "";
          }}
        />
      </label>
      {files.length ? (
        <List
          size="small"
          bordered
          dataSource={files}
          renderItem={(file) => <List.Item>{file.name}<Typography.Text type="secondary">{formatFileSize(file.size)}</Typography.Text></List.Item>}
        />
      ) : null}
    </div>
  );
}

const financePersonFields: Array<{ key: FinancePersonField; label: string; idField: FinancePersonIdField; nameField: FinancePersonNameField }> = [
  { key: "applicant", label: "申请人", idField: "applicantId", nameField: "applicantName" },
  { key: "handler", label: "经办负责人", idField: "handlerId", nameField: "handlerName" },
  { key: "approver", label: "审批负责人", idField: "approverId", nameField: "approverName" },
  { key: "payer", label: "付款负责人", idField: "payerId", nameField: "payerName" },
  { key: "settlementOwner", label: "结算负责人", idField: "settlementOwnerId", nameField: "settlementOwnerName" },
];

export function BusinessWorkflowOverviewPanel({ revision = 0 }: { revision?: number }) {
  const [overview, setOverview] = useState<BusinessWorkflowOverview | null>(null);
  const [reminders, setReminders] = useState<BusinessReminder[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async (showSuccess = false) => {
    setLoading(true);
    try {
      const [overviewResult, reminderResult] = await Promise.all([
        getBusinessWorkflowOverview(),
        listBusinessReminders(),
      ]);
      setOverview(overviewResult);
      setReminders(reminderResult.items);
      if (showSuccess) {
        message.success("业务工作台已刷新");
      }
    } catch (error) {
      message.error(`业务概览加载失败：${formatApiError(error)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [revision]);

  return (
    <section className="page-band business-workflow-overview">
      <div className="business-matter-section-heading">
        <Typography.Title level={4}>业务工作台</Typography.Title>
        <Button type="text" icon={<ReloadOutlined />} title="刷新业务工作台" aria-label="刷新业务工作台" loading={loading} onClick={() => void load(true)} />
      </div>
      {overview ? (
        <div className="business-workflow-stat-grid">
          <Statistic title="全部事项" value={overview.matters.total} suffix="项" />
          <Statistic title="进行中事项" value={overview.matters.inProgress} suffix="项" />
          <Statistic title="我的待办" value={overview.tasks.pending} suffix="项" />
          <Statistic title="已逾期" value={overview.tasks.overdue} suffix="项" valueStyle={overview.tasks.overdue ? { color: "#cf1322" } : undefined} />
          <Statistic title="7 天内到期" value={overview.tasks.dueSoon} suffix="项" />
          <Statistic title="待跟进" value={overview.followUps.pending} suffix="项" />
          <Statistic title="逾期跟进" value={overview.followUps.overdue} suffix="项" valueStyle={overview.followUps.overdue ? { color: "#cf1322" } : undefined} />
          <Statistic title="7 天内跟进" value={overview.followUps.dueSoon} suffix="项" />
          <Statistic title="合同提醒" value={overview.contracts.dueSoon} suffix="项" />
          <Statistic title="借款记录" value={overview.finance.loanCount} suffix="笔" />
          <Statistic title="借款金额" value={Number(overview.finance.loanAmount)} precision={2} suffix="元" />
          <Statistic title="报销记录" value={overview.finance.reimbursementCount} suffix="笔" />
          <Statistic title="报销金额" value={Number(overview.finance.reimbursementAmount)} precision={2} suffix="元" />
        </div>
      ) : loading ? (
        <div className="loading-state"><Spin /></div>
      ) : null}
      <div className="business-workflow-reminders">
        <Typography.Text strong>近期提醒</Typography.Text>
        {reminders.length ? (
          <List
            size="small"
            dataSource={reminders.slice(0, 8)}
            renderItem={(item) => (
              <List.Item>
                <div className="business-workflow-reminder-row">
                  <Space wrap size={6}>
                    <Tag color={item.overdue ? "red" : item.kind === "CONTRACT" ? "gold" : item.kind === "FOLLOW_UP" ? "cyan" : "blue"}>
                      {item.overdue ? "已逾期" : item.kind === "CONTRACT" ? "合同" : item.kind === "FOLLOW_UP" ? "跟进" : "待办"}
                    </Tag>
                    <Typography.Text strong>{item.title}</Typography.Text>
                    <Typography.Text type="secondary">{item.matter.title}</Typography.Text>
                  </Space>
                  <Typography.Text type={item.overdue ? "danger" : "secondary"}>{formatDateOnly(item.dueAt)}</Typography.Text>
                </div>
              </List.Item>
            )}
          />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无近期提醒" />
        )}
      </div>
    </section>
  );
}

interface BusinessResponsibilityReportPanelProps {
  currentUser: PublicUser;
  users: UserRecord[];
}

export function BusinessResponsibilityReportPanel({ currentUser, users }: BusinessResponsibilityReportPanelProps) {
  const [report, setReport] = useState<BusinessResponsibilityReport | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [userId, setUserId] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const params = { dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, userId };
  const load = async () => {
    setLoading(true);
    try {
      setReport(await getBusinessResponsibilityReport(params));
    } catch (error) {
      message.error(`责任统计加载失败：${formatApiError(error)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser.role === "ADMIN") void load();
  }, [currentUser.role]);

  if (currentUser.role !== "ADMIN") return null;

  const downloadReport = async () => {
    setExporting(true);
    try {
      const result = await exportBusinessResponsibilityReport(params);
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.fileName;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      message.error(`责任报表导出失败：${formatApiError(error)}`);
    } finally {
      setExporting(false);
    }
  };

  const columns: ColumnsType<BusinessResponsibilityReportItem> = [
    { title: "员工", dataIndex: "realName", width: 120, fixed: "left" },
    { title: "账号", dataIndex: "username", width: 140 },
    { title: "待处理任务", dataIndex: ["tasks", "pending"], width: 110 },
    { title: "已完成任务", dataIndex: ["tasks", "completed"], width: 110 },
    { title: "逾期任务", dataIndex: ["tasks", "overdue"], width: 100, render: (value: number) => <Typography.Text type={value ? "danger" : undefined}>{value}</Typography.Text> },
    { title: "借款经办", dataIndex: ["finance", "loansHandled"], width: 100 },
    { title: "报销经办", dataIndex: ["finance", "reimbursementsHandled"], width: 100 },
    { title: "审批数", dataIndex: ["finance", "approved"], width: 90 },
    { title: "付款数", dataIndex: ["finance", "paid"], width: 90 },
    { title: "结算数", dataIndex: ["finance", "settled"], width: 90 },
    { title: "人工跟进", dataIndex: ["followUps", "created"], width: 100 },
    { title: "逾期跟进", dataIndex: ["followUps", "overdue"], width: 100, render: (value: number) => <Typography.Text type={value ? "danger" : undefined}>{value}</Typography.Text> },
  ];

  return (
    <section className="page-band business-responsibility-report">
      <div className="business-matter-section-heading">
        <Typography.Title level={4}>责任统计</Typography.Title>
        <Space wrap>
          <Input type="date" aria-label="统计开始日期" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          <Input type="date" aria-label="统计结束日期" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="全部员工"
            value={userId}
            onChange={setUserId}
            options={users.map((item) => ({ value: item.id, label: `${item.realName}（${item.username}）` }))}
          />
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>查询</Button>
          <Button icon={<DownloadOutlined />} loading={exporting} onClick={() => void downloadReport()}>导出 CSV</Button>
        </Space>
      </div>
      <Table<BusinessResponsibilityReportItem>
        rowKey="userId"
        size="small"
        loading={loading}
        dataSource={report?.items ?? []}
        columns={columns}
        pagination={false}
        scroll={{ x: 1200 }}
        locale={{ emptyText: report ? "暂无统计数据" : "请选择条件后查询" }}
      />
    </section>
  );
}

interface BusinessWorkflowPanelProps {
  matter: BusinessMatterDetail;
  currentUser: PublicUser;
  users: UserRecord[];
  categories: CategoryNode[];
  onOpenDocument: (document: DocumentRecord) => void;
  projectPlan: BusinessProjectPlan | null;
  onChanged: () => void;
}

export function BusinessWorkflowPanel({
  matter,
  currentUser,
  users,
  categories,
  onOpenDocument,
  projectPlan,
  onChanged,
}: BusinessWorkflowPanelProps) {
  const [tasks, setTasks] = useState<BusinessTaskRecord[]>([]);
  const [followUps, setFollowUps] = useState<BusinessFollowUpRecord[]>([]);
  const [financeRecords, setFinanceRecords] = useState<BusinessFinanceRecord[]>([]);
  const [contract, setContract] = useState<BusinessContractRecord | null>(null);
  const [activities, setActivities] = useState<BusinessActivityRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<BusinessTaskRecord | null>(null);
  const [taskSubmitting, setTaskSubmitting] = useState(false);
  const [financeOpen, setFinanceOpen] = useState(false);
  const [editingFinance, setEditingFinance] = useState<BusinessFinanceRecord | null>(null);
  const [financeSubmitting, setFinanceSubmitting] = useState(false);
  const [financeDeleteTarget, setFinanceDeleteTarget] = useState<BusinessFinanceRecord | null>(null);
  const [financeDeleting, setFinanceDeleting] = useState(false);
  const [contractOpen, setContractOpen] = useState(false);
  const [contractSubmitting, setContractSubmitting] = useState(false);
  const [voucherTarget, setVoucherTarget] = useState<BusinessFinanceRecord | null>(null);
  const [voucherDocuments, setVoucherDocuments] = useState<DocumentRecord[]>([]);
  const [selectedVoucherIds, setSelectedVoucherIds] = useState<string[]>([]);
  const [voucherLoading, setVoucherLoading] = useState(false);
  const [voucherSubmitting, setVoucherSubmitting] = useState(false);
  const [attachmentTarget, setAttachmentTarget] = useState<AttachmentTarget | null>(null);
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [attachmentCategoryPath, setAttachmentCategoryPath] = useState<string[]>([]);
  const [attachmentSubmitting, setAttachmentSubmitting] = useState(false);
  const [formAttachmentFiles, setFormAttachmentFiles] = useState<File[]>([]);
  const [formAttachmentCategoryPath, setFormAttachmentCategoryPath] = useState<string[]>([]);
  const [taskView, setTaskView] = useState<TaskView>("all");
  const [taskAssigneeMode, setTaskAssigneeMode] = useState<ReferenceInputMode>("master");
  const [followUpAssigneeMode, setFollowUpAssigneeMode] = useState<ReferenceInputMode>("master");
  const [financePersonModes, setFinancePersonModes] = useState<Record<FinancePersonField, ReferenceInputMode>>({
    applicant: "master",
    handler: "master",
    approver: "master",
    payer: "master",
    settlementOwner: "master",
  });
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [followUpSubmitting, setFollowUpSubmitting] = useState(false);
  const [taskForm] = Form.useForm<TaskFormValues>();
  const [followUpForm] = Form.useForm<FollowUpFormValues>();
  const [financeForm] = Form.useForm<FinanceFormValues>();
  const [contractForm] = Form.useForm<ContractFormValues>();
  const taskStatusValue = Form.useWatch("status", taskForm);
  const taskStageIdValue = Form.useWatch("stageId", taskForm);
  const financeStatusValue = Form.useWatch("status", financeForm);

  const isAdmin = currentUser.role === "ADMIN";

  const loadWorkflow = async (showSuccess = false) => {
    setLoading(true);
    try {
      const [taskResult, followUpResult, financeResult, contractResult, activityResult] = await Promise.all([
        listBusinessTasks(matter.id, { pageSize: 100 }),
        listBusinessFollowUps(matter.id, { pageSize: 100 }),
        listBusinessFinanceRecords(matter.id, { pageSize: 100 }),
        getBusinessContract(matter.id),
        listBusinessActivities(matter.id, { pageSize: 100 }),
      ]);
      setTasks(taskResult.items);
      setFollowUps(followUpResult.items);
      setFinanceRecords(financeResult.items);
      setContract(contractResult);
      setActivities(activityResult.items);
      if (showSuccess) {
        message.success("业务数据已刷新");
      }
    } catch (error) {
      message.error(`业务详情加载失败：${formatApiError(error)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadWorkflow();
  }, [matter.id]);

  const refreshAfterChange = async () => {
    await loadWorkflow();
    onChanged();
  };

  const openFollowUpForm = () => {
    followUpForm.resetFields();
    followUpForm.setFieldsValue({ method: "CALL", nextAssigneeId: currentUser.id });
    setFollowUpAssigneeMode("master");
    setFormAttachmentFiles([]);
    setFormAttachmentCategoryPath([]);
    setFollowUpOpen(true);
  };

  const closeFollowUpForm = () => {
    if (followUpSubmitting) return;
    setFollowUpOpen(false);
    setFormAttachmentFiles([]);
    setFormAttachmentCategoryPath([]);
  };

  const submitFollowUp = async () => {
    try {
      const values = await followUpForm.validateFields();
      if (formAttachmentFiles.length && !formAttachmentCategoryPath.length) {
        message.warning("请先选择附件所属分类");
        return;
      }
      setFollowUpSubmitting(true);
      const savedFollowUp = await createBusinessFollowUp(matter.id, {
        method: values.method,
        content: values.content.trim(),
        result: values.result?.trim() || null,
        nextAction: values.nextAction?.trim() || null,
        nextAssigneeId: followUpAssigneeMode === "master" ? values.nextAssigneeId || null : null,
        nextAssigneeName: followUpAssigneeMode === "custom" ? values.nextAssigneeName?.trim() || null : null,
        nextDueAt: values.nextDueAt || null,
      });
      const attachmentCount = await uploadAndAttachFiles(
        { kind: "FOLLOW_UP", id: savedFollowUp.id, title: savedFollowUp.content.slice(0, 40), documents: [] },
        formAttachmentFiles,
        formAttachmentCategoryPath,
      );
      message.success("人工跟进已记录");
      if (attachmentCount) message.success(`已上传并关联 ${attachmentCount} 份跟进附件`);
      closeFollowUpForm();
      await refreshAfterChange();
    } catch (error) {
      if (error && typeof error === "object" && "errorFields" in error) return;
      message.error(`人工跟进保存失败：${formatApiError(error)}`);
    } finally {
      setFollowUpSubmitting(false);
    }
  };

  const openTaskForm = (task?: BusinessTaskRecord) => {
    setEditingTask(task ?? null);
    setFormAttachmentFiles([]);
    setFormAttachmentCategoryPath([]);
    taskForm.resetFields();
    setTaskAssigneeMode(task?.assigneeName ? "custom" : task || isAdmin ? "master" : "custom");
    taskForm.setFieldsValue(task ? {
      title: task.title,
      description: task.description ?? undefined,
      status: task.status,
      priority: task.priority,
      progress: task.progress,
      dueDate: task.dueDate?.slice(0, 10),
      assigneeId: task.assigneeId ?? undefined,
      assigneeName: task.assigneeName ?? undefined,
      stageId: task.stageId ?? undefined,
      milestoneId: task.milestoneId ?? undefined,
      completionNote: task.completionNote ?? undefined,
      cancellationReason: task.cancellationReason ?? undefined,
    } : { status: "TODO", priority: "NORMAL", assigneeId: matter.ownerId });
    setTaskOpen(true);
  };

  const closeTaskForm = () => {
    if (taskSubmitting) return;
    setTaskOpen(false);
    setFormAttachmentFiles([]);
    setFormAttachmentCategoryPath([]);
  };

  const submitTask = async () => {
    try {
      const values = await taskForm.validateFields();
      if (formAttachmentFiles.length && !formAttachmentCategoryPath.length) {
        message.warning("请先选择附件所属分类");
        return;
      }
      setTaskSubmitting(true);
      const payload = {
        title: values.title.trim(),
        description: values.description?.trim() || null,
        status: values.status,
        priority: values.priority,
        progress: values.progress ?? 0,
        dueDate: values.dueDate || null,
        completionNote: values.completionNote?.trim() || null,
        cancellationReason: values.cancellationReason?.trim() || null,
        stageId: values.stageId || null,
        milestoneId: values.milestoneId || null,
        ...(taskAssigneeMode === "custom"
          ? { assigneeId: null, assigneeName: values.assigneeName?.trim() || null }
          : isAdmin
            ? { assigneeId: values.assigneeId || null, assigneeName: null }
            : {}),
      };
      let savedTask: BusinessTaskRecord;
      if (editingTask) {
        savedTask = await updateBusinessTask(matter.id, editingTask.id, payload);
      } else {
        savedTask = await createBusinessTask(matter.id, payload);
      }
      const attachmentCount = await uploadAndAttachFiles(
        { kind: "TASK", id: savedTask.id, title: savedTask.title, documents: [] },
        formAttachmentFiles,
        formAttachmentCategoryPath,
      );
      message.success(editingTask ? "跟进任务已更新" : "跟进任务已创建");
      if (attachmentCount) message.success(`已上传并关联 ${attachmentCount} 份任务附件`);
      closeTaskForm();
      await refreshAfterChange();
    } catch (error) {
      if (error && typeof error === "object" && "errorFields" in error) return;
      message.error(`任务保存失败：${formatApiError(error)}`);
    } finally {
      setTaskSubmitting(false);
    }
  };

  const completeTask = async (task: BusinessTaskRecord) => {
    openTaskForm(task);
    taskForm.setFieldValue("status", "COMPLETED");
  };

  const startTask = async (task: BusinessTaskRecord) => {
    try {
      await updateBusinessTask(matter.id, task.id, { status: "IN_PROGRESS", progress: Math.max(task.progress, 1) });
      message.success("任务已开始");
      await refreshAfterChange();
    } catch (error) {
      message.error(`任务更新失败：${formatApiError(error)}`);
    }
  };

  const removeTask = (task: BusinessTaskRecord) => {
    Modal.confirm({
      title: "删除跟进任务",
      content: `确认删除“${task.title}”吗？`,
      okButtonProps: { danger: true },
      okText: "删除",
      cancelText: "取消",
      onOk: async () => {
        await deleteBusinessTask(matter.id, task.id);
        message.success("跟进任务已删除");
        await refreshAfterChange();
      },
    });
  };

  const openFinanceForm = (record?: BusinessFinanceRecord) => {
    setEditingFinance(record ?? null);
    setFormAttachmentFiles([]);
    setFormAttachmentCategoryPath([]);
    financeForm.resetFields();
    setFinancePersonModes(Object.fromEntries(
      financePersonFields.map(({ key, nameField }) => [key, record?.[nameField as keyof BusinessFinanceRecord] ? "custom" : "master"]),
    ) as Record<FinancePersonField, ReferenceInputMode>);
    financeForm.setFieldsValue(record ? {
      kind: record.kind,
      title: record.title,
      recordNo: record.recordNo,
      amount: Number(record.amount),
      currency: record.currency,
      status: record.status,
      applicantId: record.applicantId ?? undefined,
      applicantName: record.applicantName ?? undefined,
      handlerId: record.handlerId ?? undefined,
      handlerName: record.handlerName ?? undefined,
      approverId: record.approverId ?? undefined,
      approverName: record.approverName ?? undefined,
      payerId: record.payerId ?? undefined,
      payerName: record.payerName ?? undefined,
      settlementOwnerId: record.settlementOwnerId ?? undefined,
      settlementOwnerName: record.settlementOwnerName ?? undefined,
      occurredAt: record.occurredAt?.slice(0, 10),
      counterparty: record.counterparty ?? undefined,
      dueDate: record.dueDate?.slice(0, 10),
      settledAt: record.settledAt?.slice(0, 10),
      rejectionReason: record.rejectionReason ?? undefined,
      settlementNote: record.settlementNote ?? undefined,
      remark: record.remark ?? undefined,
    } : {
      kind: matter.type === "LOAN" ? "LOAN" : "REIMBURSEMENT",
      status: "DRAFT",
      currency: "CNY",
    });
    setFinanceOpen(true);
  };

  const closeFinanceForm = () => {
    if (financeSubmitting) return;
    setFinanceOpen(false);
    setFormAttachmentFiles([]);
    setFormAttachmentCategoryPath([]);
  };

  const submitFinance = async () => {
    try {
      const values = await financeForm.validateFields();
      if (formAttachmentFiles.length && !formAttachmentCategoryPath.length) {
        message.warning("请先选择附件所属分类");
        return;
      }
      setFinanceSubmitting(true);
      const payload = {
        kind: values.kind,
        title: values.title.trim(),
        amount: values.amount,
        currency: values.currency.trim().toUpperCase(),
        status: values.status,
        ...buildFinanceResponsibilityPayload(values, financePersonModes, isAdmin),
        occurredAt: values.occurredAt || null,
        counterparty: values.counterparty?.trim() || null,
        dueDate: values.dueDate || null,
        settledAt: values.settledAt || null,
        rejectionReason: values.rejectionReason?.trim() || null,
        settlementNote: values.settlementNote?.trim() || null,
        remark: values.remark?.trim() || null,
        ...(!editingFinance && values.recordNo ? { recordNo: values.recordNo.trim() } : {}),
      };
      const savedFinance = editingFinance
        ? await updateBusinessFinanceRecord(matter.id, editingFinance.id, payload)
        : await createBusinessFinanceRecord(matter.id, payload);
      const attachmentCount = await uploadAndAttachFiles(
        { kind: "FINANCE", id: savedFinance.id, title: savedFinance.title, documents: [] },
        formAttachmentFiles,
        formAttachmentCategoryPath,
      );
      message.success(editingFinance ? "财务记录已更新" : "财务记录已创建");
      if (attachmentCount) message.success(`已上传并关联 ${attachmentCount} 份财务附件`);
      closeFinanceForm();
      await refreshAfterChange();
    } catch (error) {
      if (error && typeof error === "object" && "errorFields" in error) return;
      message.error(`财务记录保存失败：${formatApiError(error)}`);
    } finally {
      setFinanceSubmitting(false);
    }
  };

  const removeFinance = (record: BusinessFinanceRecord) => {
    setFinanceDeleteTarget(record);
  };

  const confirmRemoveFinance = async () => {
    if (!financeDeleteTarget) return;
    const record = financeDeleteTarget;
    setFinanceDeleting(true);
    try {
      await deleteBusinessFinanceRecord(matter.id, record.id);
      setFinanceRecords((current) => current.filter((item) => item.id !== record.id));
      setFinanceDeleteTarget(null);
      message.success(`${financeKindLabels[record.kind]}记录已删除`);
      await refreshAfterChange();
    } catch (error) {
      message.error(`删除${financeKindLabels[record.kind]}记录失败：${formatApiError(error)}`);
    } finally {
      setFinanceDeleting(false);
    }
  };

  const openContractForm = () => {
    contractForm.resetFields();
    contractForm.setFieldsValue(contract ? {
      contractNo: contract.contractNo ?? undefined,
      partyName: contract.partyName,
      signedAt: contract.signedAt?.slice(0, 10),
      effectiveAt: contract.effectiveAt?.slice(0, 10),
      expiresAt: contract.expiresAt?.slice(0, 10),
      renewalNoticeDays: contract.renewalNoticeDays,
      amount: contract.amount === null ? undefined : Number(contract.amount),
      status: contract.status,
      remark: contract.remark ?? undefined,
    } : { status: "DRAFT", renewalNoticeDays: 30 });
    setContractOpen(true);
  };

  const submitContract = async () => {
    try {
      const values = await contractForm.validateFields();
      setContractSubmitting(true);
      await upsertBusinessContract(matter.id, {
        contractNo: values.contractNo?.trim() || null,
        partyName: values.partyName.trim(),
        signedAt: values.signedAt || null,
        effectiveAt: values.effectiveAt || null,
        expiresAt: values.expiresAt || null,
        renewalNoticeDays: values.renewalNoticeDays,
        amount: values.amount ?? null,
        status: values.status,
        remark: values.remark?.trim() || null,
      });
      message.success("合同信息已保存");
      setContractOpen(false);
      await refreshAfterChange();
    } catch (error) {
      if (error && typeof error === "object" && "errorFields" in error) return;
      message.error(`合同信息保存失败：${formatApiError(error)}`);
    } finally {
      setContractSubmitting(false);
    }
  };

  const removeContract = () => {
    Modal.confirm({
      title: "删除合同信息",
      content: "确认删除当前合同信息吗？事项和关联文件不会被删除。",
      okButtonProps: { danger: true },
      okText: "删除",
      cancelText: "取消",
      onOk: async () => {
        await deleteBusinessContract(matter.id);
        message.success("合同信息已删除");
        await refreshAfterChange();
      },
    });
  };

  const openVoucherModal = async (record: BusinessFinanceRecord) => {
    setVoucherTarget(record);
    setSelectedVoucherIds([]);
    setVoucherLoading(true);
    try {
      const items: DocumentRecord[] = [];
      let page = 1;
      let totalPages = 1;
      while (page <= totalPages) {
        const result = await listDocuments({ page, pageSize: 100, sortBy: "updatedAt", sortOrder: "desc" });
        items.push(...result.items);
        totalPages = result.pagination.totalPages || 1;
        page += 1;
      }
      setVoucherDocuments(items);
    } catch (error) {
      message.error(`文件列表加载失败：${formatApiError(error)}`);
    } finally {
      setVoucherLoading(false);
    }
  };

  const submitVouchers = async () => {
    if (!voucherTarget || !selectedVoucherIds.length) return;
    setVoucherSubmitting(true);
    try {
      await attachBusinessFinanceDocuments(matter.id, voucherTarget.id, { documentIds: selectedVoucherIds });
      message.success(`已关联 ${selectedVoucherIds.length} 份凭证`);
      setVoucherTarget(null);
      await refreshAfterChange();
    } catch (error) {
      message.error(`凭证关联失败：${formatApiError(error)}`);
    } finally {
      setVoucherSubmitting(false);
    }
  };

  const uploadAndAttachFiles = async (target: AttachmentTarget, files: File[], categoryPath: string[]) => {
    if (!files.length) return 0;
    if (!categoryPath.length) {
      throw new Error("请选择附件所属分类");
    }
    const categoryId = categoryPath[0];
    const subcategoryId = categoryPath.length > 1 ? categoryPath[categoryPath.length - 1] : undefined;
    const uploadedIds: string[] = [];
    for (const file of files) {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("categoryId", categoryId);
      if (subcategoryId) formData.append("subcategoryId", subcategoryId);
      const document = await uploadDocument(formData);
      uploadedIds.push(document.id);
    }
    if (target.kind === "TASK") {
      await attachBusinessTaskDocuments(matter.id, target.id, { documentIds: uploadedIds });
    } else if (target.kind === "FOLLOW_UP") {
      await attachBusinessFollowUpDocuments(matter.id, target.id, { documentIds: uploadedIds });
    } else {
      await attachBusinessFinanceDocuments(matter.id, target.id, { documentIds: uploadedIds, relationType: "ATTACHMENT" });
    }
    return uploadedIds.length;
  };

  const openAttachmentModal = (target: AttachmentTarget) => {
    setAttachmentTarget(target);
    setAttachmentFiles([]);
    setAttachmentCategoryPath([]);
  };

  const closeAttachmentModal = (force = false) => {
    if (attachmentSubmitting && !force) return;
    setAttachmentTarget(null);
    setAttachmentFiles([]);
    setAttachmentCategoryPath([]);
  };

  const submitAttachments = async () => {
    if (!attachmentTarget || !attachmentFiles.length) return;
    if (!attachmentCategoryPath.length) {
      message.warning("请先选择附件所属分类");
      return;
    }
    setAttachmentSubmitting(true);
    try {
      const uploadedCount = await uploadAndAttachFiles(attachmentTarget, attachmentFiles, attachmentCategoryPath);
      message.success(`已上传并关联 ${uploadedCount} 份附件`);
      closeAttachmentModal(true);
      await refreshAfterChange();
    } catch (error) {
      message.error(`附件上传或关联失败：${formatApiError(error)}`);
    } finally {
      setAttachmentSubmitting(false);
    }
  };

  const detachAttachment = async (target: AttachmentTarget, link: BusinessWorkflowDocumentLink | BusinessFinanceDocumentLink) => {
    try {
      if (target.kind === "TASK") {
        await detachBusinessTaskDocument(matter.id, target.id, link.documentId);
      } else if (target.kind === "FOLLOW_UP") {
        await detachBusinessFollowUpDocument(matter.id, target.id, link.documentId);
      } else {
        await detachBusinessFinanceDocument(matter.id, target.id, link.documentId);
      }
      message.success("附件关联已取消，文件中心源文件仍会保留");
      await refreshAfterChange();
      setAttachmentTarget((current) => current
        ? { ...current, documents: current.documents.filter((item) => item.documentId !== link.documentId) } as AttachmentTarget
        : current);
    } catch (error) {
      message.error(`取消附件关联失败：${formatApiError(error)}`);
    }
  };

  const detachVoucher = async (record: BusinessFinanceRecord, document: DocumentRecord) => {
    try {
      await detachBusinessFinanceDocument(matter.id, record.id, document.id);
      message.success("凭证关联已取消");
      await refreshAfterChange();
    } catch (error) {
      message.error(`取消凭证关联失败：${formatApiError(error)}`);
    }
  };

  const linkedVoucherIds = useMemo(
    () => new Set(voucherTarget?.documents.map((item) => item.documentId) ?? []),
    [voucherTarget],
  );
  const availableVoucherDocuments = voucherDocuments.filter((item) => !linkedVoucherIds.has(item.id));

  const voucherColumns: ColumnsType<DocumentRecord> = [
    {
      title: "文件名称",
      dataIndex: "title",
      render: (value: string, record) => (
        <Button type="link" className="business-matter-document-link" onClick={() => onOpenDocument(record)}>
          <FileTextOutlined /> {value}
        </Button>
      ),
    },
    { title: "文件编号", dataIndex: "documentNo", width: 160 },
  ];

  const visibleTasks = tasks.filter((task) => {
    if (taskView === "mine") return task.assigneeId === currentUser.id;
    if (taskView === "unassigned") return !task.assigneeId;
    if (taskView === "overdue") return Boolean(task.dueDate && new Date(task.dueDate) < new Date() && !["COMPLETED", "CANCELLED"].includes(task.status));
    return true;
  });

  const taskStatusOptions = (task?: BusinessTaskRecord) => {
    if (!task) {
      return ["TODO", "IN_PROGRESS"].map((value) => ({ value, label: taskStatusLabels[value as BusinessTaskStatus] }));
    }
    const transitions: Record<BusinessTaskStatus, BusinessTaskStatus[]> = {
      TODO: ["TODO", "IN_PROGRESS", "CANCELLED"],
      IN_PROGRESS: ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
      COMPLETED: ["COMPLETED"],
      CANCELLED: ["CANCELLED"],
    };
    return transitions[task.status].map((value) => ({ value, label: taskStatusLabels[value] }));
  };

  const financeStatusOptions = (record?: BusinessFinanceRecord) => {
    const transitions: Record<BusinessFinanceStatus, BusinessFinanceStatus[]> = {
      DRAFT: ["DRAFT", "PENDING", "CANCELLED"],
      PENDING: ["PENDING", "APPROVED", "REJECTED", "CANCELLED"],
      APPROVED: ["APPROVED", "PAID", "CANCELLED"],
      PAID: ["PAID", "SETTLED"],
      SETTLED: ["SETTLED"],
      REJECTED: ["REJECTED", "DRAFT"],
      CANCELLED: ["CANCELLED"],
    };
    const values: BusinessFinanceStatus[] = record ? transitions[record.status] : ["DRAFT", "PENDING"];
    return values.map((value) => ({ value, label: financeStatusLabels[value] }));
  };

  const taskTab = (
    <section className="business-workflow-tab-section">
      <div className="business-matter-section-heading">
        <Typography.Text strong>跟进任务</Typography.Text>
        <Space wrap>
          <Segmented
            size="small"
            value={taskView}
            onChange={(value) => setTaskView(value as TaskView)}
            options={[
              { label: "全部", value: "all" },
              { label: "我的", value: "mine" },
              { label: "未分配", value: "unassigned" },
              { label: "逾期", value: "overdue" },
            ]}
          />
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => openTaskForm()}>新建任务</Button>
        </Space>
      </div>
      {visibleTasks.length ? (
        <List
          dataSource={visibleTasks}
          renderItem={(task) => (
            <List.Item
              actions={[
                ...(task.status === "TODO" ? [
                  <Button key="start" type="link" onClick={() => void startTask(task)}>开始</Button>,
                ] : []),
                ...(task.status === "IN_PROGRESS" ? [
                  <Button key="complete" type="link" icon={<CheckOutlined />} onClick={() => void completeTask(task)}>完成</Button>,
                ] : []),
                <Button key="attachments" type="link" icon={<PaperClipOutlined />} onClick={() => openAttachmentModal({ kind: "TASK", id: task.id, title: task.title, documents: task.documents })}>附件 {task.documents.length || ""}</Button>,
                <Button key="edit" type="link" icon={<EditOutlined />} onClick={() => openTaskForm(task)}>编辑</Button>,
                <Button key="delete" type="link" danger icon={<DeleteOutlined />} onClick={() => removeTask(task)}>删除</Button>,
              ]}
            >
              <List.Item.Meta
                title={<Space wrap><Typography.Text strong>{task.title}</Typography.Text><Tag color={taskStatusColors[task.status]}>{taskStatusLabels[task.status]}</Tag><Tag color={priorityColors[task.priority]}>{priorityLabels[task.priority]}</Tag><Typography.Text type="secondary">进度 {task.progress}%</Typography.Text></Space>}
                description={
                  <Space direction="vertical" size={2}>
                    <Typography.Text type="secondary">负责人：{task.assigneeName || task.assignee?.realName || task.assignee?.username || "未指定"} · 截止：{formatDateOnly(task.dueDate)} · 完成：{task.completedBy?.realName || "-"}</Typography.Text>
                    <Progress percent={task.progress} size="small" status={task.status === "CANCELLED" ? "exception" : task.status === "COMPLETED" ? "success" : "active"} />
                    {task.description ? <Typography.Text>{task.description}</Typography.Text> : null}
                    {task.completionNote ? <Typography.Text type="success">完成说明：{task.completionNote}</Typography.Text> : null}
                    {task.cancellationReason ? <Typography.Text type="danger">取消原因：{task.cancellationReason} · 取消时间：{formatDateTime(task.cancelledAt)}</Typography.Text> : null}
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无跟进任务" />}
    </section>
  );

  const followUpTab = (
    <section className="business-workflow-tab-section">
      <div className="business-matter-section-heading">
        <Typography.Text strong>人工跟进</Typography.Text>
        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={openFollowUpForm}>记录跟进</Button>
      </div>
      {followUps.length ? (
          <List
            dataSource={followUps}
            renderItem={(followUp) => (
            <List.Item
              actions={[
                <Button key="attachments" type="link" icon={<PaperClipOutlined />} onClick={() => openAttachmentModal({ kind: "FOLLOW_UP", id: followUp.id, title: followUp.content.slice(0, 40), documents: followUp.documents })}>
                  附件 {followUp.documents.length || ""}
                </Button>,
              ]}
            >
              <List.Item.Meta
                title={
                  <Space wrap>
                    <Tag color="cyan">{followUpMethodLabels[followUp.method]}</Tag>
                    <Typography.Text strong>{followUp.createdBy?.realName || "未知跟进人"}</Typography.Text>
                    <Typography.Text type="secondary">{formatDateTime(followUp.createdAt)}</Typography.Text>
                    {followUp.nextDueAt && new Date(followUp.nextDueAt) < new Date() ? <Tag color="red">跟进已逾期</Tag> : null}
                  </Space>
                }
                description={
                  <Space direction="vertical" size={2}>
                    <Typography.Text>{followUp.content}</Typography.Text>
                    {followUp.result ? <Typography.Text type="secondary">结果：{followUp.result}</Typography.Text> : null}
                    {followUp.nextAction ? <Typography.Text>下一步：{followUp.nextAction}</Typography.Text> : null}
                    {followUp.nextDueAt ? (
                      <Typography.Text type="secondary">
                        下次跟进：{followUp.nextAssigneeName || followUp.nextAssignee?.realName || "未指定"} · {formatDateTime(followUp.nextDueAt)}
                      </Typography.Text>
                    ) : <Typography.Text type="secondary">暂未安排下一次跟进</Typography.Text>}
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无人工跟进记录" />}
    </section>
  );

  const financeTab = (
    <section className="business-workflow-tab-section">
      <div className="business-matter-section-heading">
        <Typography.Text strong>借款与报销</Typography.Text>
        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => openFinanceForm()}>新增记录</Button>
      </div>
      {financeRecords.length ? (
        <List
          dataSource={financeRecords}
          renderItem={(record) => (
            <List.Item
              className="business-finance-list-item"
              actions={[
                <Button key="voucher" type="link" icon={<FileAddOutlined />} onClick={() => void openVoucherModal(record)}>凭证</Button>,
                <Button key="attachments" type="link" icon={<PaperClipOutlined />} onClick={() => openAttachmentModal({ kind: "FINANCE", id: record.id, title: record.title, documents: record.documents })}>上传附件</Button>,
                <Button key="edit" type="link" icon={<EditOutlined />} onClick={() => openFinanceForm(record)}>编辑</Button>,
                <Button key="delete" type="link" danger icon={<DeleteOutlined />} disabled={financeDeleting} onClick={() => removeFinance(record)}>删除</Button>,
              ]}
            >
              <List.Item.Meta
                title={<Space wrap><Typography.Text strong>{record.title}</Typography.Text><Tag>{financeKindLabels[record.kind]}</Tag><Tag color={record.status === "SETTLED" ? "success" : "blue"}>{financeStatusLabels[record.status]}</Tag></Space>}
                description={
                  <div className="business-finance-content">
                    <Typography.Text type="secondary">{record.recordNo} · {formatAmount(record.amount, record.currency)} · {formatDateOnly(record.occurredAt)}</Typography.Text>
                    {record.counterparty ? <Typography.Text>往来对象：{record.counterparty}</Typography.Text> : null}
                    <Typography.Text type="secondary">
                      申请人：{record.applicantName || record.applicant?.realName || record.createdBy?.realName || "未指定"} · 经办：{record.handlerName || record.handler?.realName || "未指定"} · 审批：{record.approverName || record.approver?.realName || "未指定"} · 付款：{record.payerName || record.payer?.realName || "未指定"} · 结算：{record.settlementOwnerName || record.settlementOwner?.realName || "未指定"}
                    </Typography.Text>
                    {record.rejectionReason ? <Typography.Text type="danger">拒绝原因：{record.rejectionReason}</Typography.Text> : null}
                    {record.settlementNote ? <Typography.Text type="success">结算说明：{record.settlementNote}</Typography.Text> : null}
                    {record.documents.length ? (
                      <Space wrap size={4}>
                        {record.documents.map((link) => (
                            <span className="business-voucher-chip" key={link.documentId}>
                              <Button type="link" size="small" onClick={() => onOpenDocument(link.document)}>{link.document.title}</Button>
                            <Button type="text" danger size="small" icon={<DeleteOutlined />} title="取消凭证关联" aria-label="取消凭证关联" onClick={() => void detachVoucher(record, link.document)} />
                          </span>
                        ))}
                      </Space>
                    ) : <Typography.Text type="secondary">暂无关联凭证</Typography.Text>}
                  </div>
                }
              />
            </List.Item>
          )}
        />
      ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无借款或报销记录" />}
    </section>
  );

  const contractTab = (
    <section className="business-workflow-tab-section">
      <div className="business-matter-section-heading">
        <Typography.Text strong>合同信息</Typography.Text>
        <Space>
          {contract ? <Button size="small" danger icon={<DeleteOutlined />} onClick={removeContract}>删除</Button> : null}
          <Button type="primary" size="small" icon={contract ? <EditOutlined /> : <PlusOutlined />} onClick={openContractForm}>{contract ? "编辑" : "录入"}</Button>
        </Space>
      </div>
      {contract ? (
        <Descriptions bordered size="small" column={2}>
          <Descriptions.Item label="合同编号">{contract.contractNo || "-"}</Descriptions.Item>
          <Descriptions.Item label="合同相对方">{contract.partyName}</Descriptions.Item>
          <Descriptions.Item label="合同状态">{contractStatusLabels[contract.status]}</Descriptions.Item>
          <Descriptions.Item label="合同金额">{formatAmount(contract.amount, "CNY")}</Descriptions.Item>
          <Descriptions.Item label="签署日期">{formatDateOnly(contract.signedAt)}</Descriptions.Item>
          <Descriptions.Item label="生效日期">{formatDateOnly(contract.effectiveAt)}</Descriptions.Item>
          <Descriptions.Item label="到期日期">{formatDateOnly(contract.expiresAt)}</Descriptions.Item>
          <Descriptions.Item label="提前提醒">{contract.renewalNoticeDays} 天</Descriptions.Item>
          <Descriptions.Item label="备注" span={2}>{contract.remark || "-"}</Descriptions.Item>
        </Descriptions>
      ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无合同信息" />}
    </section>
  );

  const activityTab = activities.length ? (
    <Timeline
      items={activities.map((activity) => ({
        children: (
          <div>
            <Typography.Text>{activity.summary}</Typography.Text>
            <div><Typography.Text type="secondary">{activity.actor.realName || activity.actor.username} · {formatDateTime(activity.createdAt)}</Typography.Text></div>
            {activity.metadata ? (
              <details className="business-activity-details">
                <summary>查看操作详情</summary>
                <ActivityMetadataView metadata={activity.metadata} />
              </details>
            ) : null}
          </div>
        ),
      }))}
    />
  ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无业务操作记录" />;

  return (
    <section className="business-workflow-panel">
      <div className="business-matter-section-heading">
        <Typography.Title level={4}>业务跟踪</Typography.Title>
        <Button type="text" icon={<ReloadOutlined />} title="刷新业务数据" aria-label="刷新业务数据" loading={loading} onClick={() => void loadWorkflow(true)} />
      </div>
      <Tabs
        items={[
          { key: "tasks", label: `跟进任务 ${tasks.length}`, children: taskTab },
          { key: "follow-ups", label: `人工跟进 ${followUps.length}`, children: followUpTab },
          { key: "finance", label: `借款与报销 ${financeRecords.length}`, children: financeTab },
          ...(matter.type === "CONTRACT" ? [{ key: "contract", label: "合同信息", children: contractTab }] : []),
          { key: "activity", label: `操作记录 ${activities.length}`, children: activityTab },
        ]}
      />

      <Modal
        title={`删除${financeDeleteTarget ? financeKindLabels[financeDeleteTarget.kind] : "财务"}记录`}
        open={Boolean(financeDeleteTarget)}
        zIndex={2200}
        okText="确认删除"
        cancelText="取消"
        okButtonProps={{ danger: true }}
        cancelButtonProps={{ disabled: financeDeleting }}
        confirmLoading={financeDeleting}
        maskClosable={!financeDeleting}
        keyboard={!financeDeleting}
        onOk={() => void confirmRemoveFinance()}
        onCancel={() => {
          if (!financeDeleting) setFinanceDeleteTarget(null);
        }}
        destroyOnHidden
      >
        <Typography.Paragraph>
          确认删除“{financeDeleteTarget?.title}”吗？删除后不再参与借款与报销统计。
        </Typography.Paragraph>
        <Typography.Text type="secondary">关联凭证和文件中心中的源文件会继续保留。</Typography.Text>
      </Modal>

      <Modal title={editingTask ? "编辑跟进任务" : "新建跟进任务"} open={taskOpen} okText="保存" cancelText="取消" confirmLoading={taskSubmitting} onOk={() => void submitTask()} onCancel={closeTaskForm} destroyOnHidden>
        <Form form={taskForm} layout="vertical">
          <Form.Item name="title" label="任务标题" rules={[{ required: true, message: "请输入任务标题" }]}><Input maxLength={200} /></Form.Item>
          <div className="business-workflow-form-grid">
            <Form.Item name="status" label="状态" rules={[{ required: true }]}><Select options={taskStatusOptions(editingTask ?? undefined)} /></Form.Item>
            <Form.Item name="priority" label="优先级" rules={[{ required: true }]}><Select options={Object.entries(priorityLabels).map(([value, label]) => ({ value, label }))} /></Form.Item>
            <Form.Item name="dueDate" label="截止日期"><Input type="date" /></Form.Item>
            <Form.Item name="stageId" label="所属阶段"><Select allowClear options={(projectPlan?.stages ?? []).map((stage) => ({ value: stage.id, label: stage.name }))} /></Form.Item>
            <Form.Item name="milestoneId" label="所属里程碑"><Select allowClear options={(projectPlan?.milestones ?? []).filter((milestone) => !taskStageIdValue || !milestone.stageId || milestone.stageId === taskStageIdValue).map((milestone) => ({ value: milestone.id, label: milestone.title }))} /></Form.Item>
            <div className="business-workflow-reference-field">
              <Typography.Text strong>负责人</Typography.Text>
              <Segmented
                block
                size="small"
                value={taskAssigneeMode}
                options={[{ label: "系统账号", value: "master" }, { label: "自定义输入", value: "custom" }]}
                onChange={(value) => {
                  const next = value as ReferenceInputMode;
                  setTaskAssigneeMode(next);
                  taskForm.setFieldsValue(next === "custom" ? { assigneeId: undefined } : { assigneeName: undefined });
                }}
              />
              {taskAssigneeMode === "custom" ? (
                <Form.Item name="assigneeName" rules={[{ required: true, message: "请输入负责人名称" }]}>
                  <Input maxLength={200} placeholder="例如：外部项目负责人" />
                </Form.Item>
              ) : isAdmin ? (
                <Form.Item name="assigneeId"><Select allowClear showSearch optionFilterProp="label" options={users.map((item) => ({ value: item.id, label: `${item.realName}（${item.username}）` }))} /></Form.Item>
              ) : (
                <Input disabled value={editingTask?.assignee?.realName || editingTask?.assignee?.username || currentUser.realName} />
              )}
            </div>
            <Form.Item name="progress" label="进度（%）"><InputNumber min={0} max={100} precision={0} className="full-width-control" /></Form.Item>
          </div>
          {taskStatusValue === "COMPLETED" ? <Form.Item name="completionNote" label="完成说明" rules={[{ required: true, message: "请输入完成说明" }]}><Input.TextArea rows={3} maxLength={4000} /></Form.Item> : null}
          {taskStatusValue === "CANCELLED" ? <Form.Item name="cancellationReason" label="取消原因" rules={[{ required: true, message: "请输入取消原因" }]}><Input.TextArea rows={3} maxLength={4000} /></Form.Item> : null}
          <Form.Item name="description" label="说明"><Input.TextArea rows={3} maxLength={4000} /></Form.Item>
          <AttachmentPicker
            categories={categories}
            files={formAttachmentFiles}
            categoryPath={formAttachmentCategoryPath}
            onFilesChange={setFormAttachmentFiles}
            onCategoryChange={setFormAttachmentCategoryPath}
          />
        </Form>
      </Modal>

      <Modal title="记录人工跟进" open={followUpOpen} width={700} okText="保存" cancelText="取消" confirmLoading={followUpSubmitting} onOk={() => void submitFollowUp()} onCancel={closeFollowUpForm} destroyOnHidden>
        <Form form={followUpForm} layout="vertical">
          <div className="business-workflow-form-grid">
            <Form.Item name="method" label="跟进方式" rules={[{ required: true, message: "请选择跟进方式" }]}>
              <Select options={Object.entries(followUpMethodLabels).map(([value, label]) => ({ value, label }))} />
            </Form.Item>
            <Form.Item name="nextDueAt" label="下一次跟进日期">
              <Input type="date" />
            </Form.Item>
            <div className="business-workflow-reference-field">
              <Typography.Text strong>下一责任人</Typography.Text>
              <Segmented
                block
                size="small"
                value={followUpAssigneeMode}
                options={[{ label: "系统账号", value: "master" }, { label: "自定义输入", value: "custom" }]}
                onChange={(value) => {
                  const next = value as ReferenceInputMode;
                  setFollowUpAssigneeMode(next);
                  followUpForm.setFieldsValue(next === "custom" ? { nextAssigneeId: undefined } : { nextAssigneeName: undefined });
                }}
              />
              {followUpAssigneeMode === "custom" ? (
                <Form.Item name="nextAssigneeName" rules={[{ required: true, message: "请输入下一责任人" }]}>
                  <Input maxLength={200} placeholder="例如：代账公司李老师" />
                </Form.Item>
              ) : (
                <Form.Item name="nextAssigneeId">
                  <Select
                    allowClear={isAdmin}
                    disabled={!isAdmin}
                    options={users.map((item) => ({ value: item.id, label: `${item.realName}（${item.username}）` }))}
                  />
                </Form.Item>
              )}
            </div>
          </div>
          <Form.Item name="content" label="跟进内容" rules={[{ required: true, message: "请输入跟进内容" }]}>
            <Input.TextArea rows={4} maxLength={4000} />
          </Form.Item>
          <Form.Item name="result" label="跟进结果"><Input.TextArea rows={3} maxLength={4000} /></Form.Item>
          <Form.Item name="nextAction" label="下一步动作"><Input.TextArea rows={3} maxLength={4000} /></Form.Item>
          <AttachmentPicker
            categories={categories}
            files={formAttachmentFiles}
            categoryPath={formAttachmentCategoryPath}
            onFilesChange={setFormAttachmentFiles}
            onCategoryChange={setFormAttachmentCategoryPath}
          />
        </Form>
      </Modal>

      <Modal title={editingFinance ? "编辑财务记录" : "新增财务记录"} open={financeOpen} width={700} okText="保存" cancelText="取消" confirmLoading={financeSubmitting} onOk={() => void submitFinance()} onCancel={closeFinanceForm} destroyOnHidden>
        <Form form={financeForm} layout="vertical">
          <div className="business-workflow-form-grid">
            <Form.Item name="kind" label="记录类型" rules={[{ required: true }]}><Select options={Object.entries(financeKindLabels).map(([value, label]) => ({ value, label }))} /></Form.Item>
            <Form.Item name="status" label="状态" rules={[{ required: true }]}><Select options={financeStatusOptions(editingFinance ?? undefined)} /></Form.Item>
          </div>
          <Form.Item name="title" label="记录标题" rules={[{ required: true, message: "请输入记录标题" }]}><Input maxLength={200} /></Form.Item>
          {!editingFinance ? <Form.Item name="recordNo" label="业务单号"><Input maxLength={120} placeholder="留空时自动生成" /></Form.Item> : null}
          <div className="business-workflow-form-grid">
            {financePersonFields.map(({ key, label, idField, nameField }) => {
              const mode = financePersonModes[key];
              return (
                <div className="business-workflow-reference-field" key={key}>
                  <Typography.Text strong>{label}</Typography.Text>
                  <Segmented
                    block
                    size="small"
                    value={mode}
                    options={[{ label: "系统账号", value: "master" }, { label: "自定义输入", value: "custom" }]}
                    onChange={(value) => {
                      const next = value as ReferenceInputMode;
                      setFinancePersonModes((current) => ({ ...current, [key]: next }));
                      financeForm.setFieldsValue(next === "custom" ? { [idField]: undefined } : { [nameField]: undefined });
                    }}
                  />
                  {mode === "custom" ? (
                    <Form.Item name={nameField} rules={[{ required: true, message: `请输入${label}` }]}>
                      <Input maxLength={200} placeholder={`请输入${label}`} />
                    </Form.Item>
                  ) : isAdmin ? (
                    <Form.Item name={idField}>
                      <Select allowClear showSearch optionFilterProp="label" options={users.map((item) => ({ value: item.id, label: `${item.realName}（${item.username}）` }))} />
                    </Form.Item>
                  ) : (
                    <Input disabled value={key === "applicant" || key === "handler" ? currentUser.realName : "由管理员设置"} />
                  )}
                </div>
              );
            })}
          </div>
          <div className="business-workflow-form-grid">
            <Form.Item name="amount" label="金额" rules={[{ required: true, message: "请输入金额" }]}><InputNumber min={0} precision={2} className="full-width-control" /></Form.Item>
            <Form.Item name="currency" label="币种" rules={[{ required: true }]}><Input maxLength={12} /></Form.Item>
            <Form.Item name="occurredAt" label="发生日期"><Input type="date" /></Form.Item>
            <Form.Item name="dueDate" label="应结日期"><Input type="date" /></Form.Item>
            <Form.Item name="settledAt" label="结清日期"><Input type="date" /></Form.Item>
            <Form.Item name="counterparty" label="往来对象"><Input maxLength={200} /></Form.Item>
          </div>
          {financeStatusValue === "REJECTED" ? <Form.Item name="rejectionReason" label="拒绝原因" rules={[{ required: true, message: "请输入拒绝原因" }]}><Input.TextArea rows={3} maxLength={4000} /></Form.Item> : null}
          {financeStatusValue === "SETTLED" ? <Form.Item name="settlementNote" label="结算说明" rules={[{ required: true, message: "请输入结算说明" }]}><Input.TextArea rows={3} maxLength={4000} /></Form.Item> : null}
          <Form.Item name="remark" label="备注"><Input.TextArea rows={3} maxLength={4000} /></Form.Item>
          <AttachmentPicker
            categories={categories}
            files={formAttachmentFiles}
            categoryPath={formAttachmentCategoryPath}
            onFilesChange={setFormAttachmentFiles}
            onCategoryChange={setFormAttachmentCategoryPath}
          />
        </Form>
      </Modal>

      <Modal title="合同信息" open={contractOpen} width={700} okText="保存" cancelText="取消" confirmLoading={contractSubmitting} onOk={() => void submitContract()} onCancel={() => setContractOpen(false)} destroyOnHidden>
        <Form form={contractForm} layout="vertical">
          <div className="business-workflow-form-grid">
            <Form.Item name="contractNo" label="合同编号"><Input maxLength={120} /></Form.Item>
            <Form.Item name="partyName" label="合同相对方" rules={[{ required: true, message: "请输入合同相对方" }]}><Input maxLength={200} /></Form.Item>
            <Form.Item name="status" label="合同状态" rules={[{ required: true }]}><Select options={Object.entries(contractStatusLabels).map(([value, label]) => ({ value, label }))} /></Form.Item>
            <Form.Item name="amount" label="合同金额"><InputNumber min={0} precision={2} className="full-width-control" /></Form.Item>
            <Form.Item name="signedAt" label="签署日期"><Input type="date" /></Form.Item>
            <Form.Item name="effectiveAt" label="生效日期"><Input type="date" /></Form.Item>
            <Form.Item name="expiresAt" label="到期日期"><Input type="date" /></Form.Item>
            <Form.Item name="renewalNoticeDays" label="提前提醒天数" rules={[{ required: true }]}><InputNumber min={0} max={3650} className="full-width-control" /></Form.Item>
          </div>
          <Form.Item name="remark" label="备注"><Input.TextArea rows={3} maxLength={4000} /></Form.Item>
        </Form>
      </Modal>

      <Modal title={voucherTarget ? `关联凭证 · ${voucherTarget.title}` : "关联凭证"} open={Boolean(voucherTarget)} width={800} okText={`关联 ${selectedVoucherIds.length || ""} 份凭证`} cancelText="取消" confirmLoading={voucherSubmitting} okButtonProps={{ disabled: !selectedVoucherIds.length }} onOk={() => void submitVouchers()} onCancel={() => setVoucherTarget(null)} destroyOnHidden>
        <Table
          rowKey="id"
          size="small"
          loading={voucherLoading}
          dataSource={availableVoucherDocuments}
          columns={voucherColumns}
          rowSelection={{ selectedRowKeys: selectedVoucherIds, onChange: (keys) => setSelectedVoucherIds(keys.map(String)) }}
          pagination={{ pageSize: 8, showSizeChanger: false }}
          scroll={{ y: 420 }}
          locale={{ emptyText: <Empty description="暂无可关联文件" /> }}
        />
      </Modal>

      <Modal
        title={attachmentTarget ? `业务附件 · ${attachmentTarget.title}` : "业务附件"}
        open={Boolean(attachmentTarget)}
        width={760}
        okText={`上传并关联 ${attachmentFiles.length || ""} 份文件`}
        cancelText="关闭"
        confirmLoading={attachmentSubmitting}
        okButtonProps={{ disabled: !attachmentFiles.length || !attachmentCategoryPath.length }}
        onOk={() => void submitAttachments()}
        onCancel={() => closeAttachmentModal()}
        destroyOnHidden
      >
        <Space direction="vertical" size={14} className="full-width-control">
          <Typography.Text type="secondary">上传的文件会进入文件中心，并保留当前分类；取消业务关联不会删除文件中心源文件。</Typography.Text>
          <Cascader
            className="full-width-control"
            options={toBusinessCategoryOptions(categories)}
            value={attachmentCategoryPath}
            onChange={(value) => setAttachmentCategoryPath(value as string[])}
            placeholder="选择附件所属分类"
            changeOnSelect
          />
          <label className="business-workflow-file-picker">
            <PaperClipOutlined />
            <span>选择附件文件（可多选）</span>
            <input
              type="file"
              multiple
              onChange={(event) => {
                setAttachmentFiles(Array.from(event.target.files ?? []));
                event.currentTarget.value = "";
              }}
            />
          </label>
          {attachmentFiles.length ? (
            <List
              size="small"
              bordered
              dataSource={attachmentFiles}
              renderItem={(file) => <List.Item>{file.name}<Typography.Text type="secondary">{formatFileSize(file.size)}</Typography.Text></List.Item>}
            />
          ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚未选择新附件" />}
          <Typography.Text strong>已关联附件</Typography.Text>
          {attachmentTarget?.documents.length ? (
            <List
              size="small"
              bordered
              dataSource={attachmentTarget.documents}
              renderItem={(link) => (
                <List.Item
                  actions={[
                    <Button key="view" type="link" onClick={() => onOpenDocument(link.document)}>查看</Button>,
                    <Button key="detach" type="link" danger onClick={() => void detachAttachment(attachmentTarget, link)}>取消关联</Button>,
                  ]}
                >
                  <List.Item.Meta
                    avatar={<FileTextOutlined />}
                    title={link.document.title}
                    description={`来源：${getBusinessDocumentCategoryPathText(link.document)} · ${link.document.currentVersion?.versionLabel ?? "无版本信息"}`}
                  />
                </List.Item>
              )}
            />
          ) : <Typography.Text type="secondary">暂无已关联附件</Typography.Text>}
        </Space>
      </Modal>
    </section>
  );
}

function buildFinanceResponsibilityPayload(
  values: FinanceFormValues,
  modes: Record<FinancePersonField, ReferenceInputMode>,
  isAdmin: boolean,
) {
  const payload: Record<string, string | null> = {};
  for (const { key, idField, nameField } of financePersonFields) {
    if (modes[key] === "custom") {
      payload[nameField] = values[nameField]?.trim() || null;
      payload[idField] = null;
    } else if (isAdmin) {
      payload[idField] = values[idField] || null;
      payload[nameField] = null;
    }
  }
  return payload;
}

interface BusinessWorkflowCategoryOption {
  value: string;
  label: string;
  children?: BusinessWorkflowCategoryOption[];
}

function toBusinessCategoryOptions(nodes: CategoryNode[]): BusinessWorkflowCategoryOption[] {
  return nodes.map((node) => ({
    value: node.id,
    label: node.name,
    children: node.children?.length ? toBusinessCategoryOptions(node.children) : undefined,
  }));
}

function getBusinessDocumentCategoryPathText(document: DocumentRecord) {
  if (document.category?.name && document.subcategory?.name) {
    return `${document.category.name} / ${document.subcategory.name}`;
  }
  return document.category?.name || document.subcategory?.name || "未分类";
}

function formatFileSize(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateOnly(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(new Date(value));
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatAmount(value?: string | null, currency = "CNY") {
  if (value === null || value === undefined || value === "") return "-";
  return `${Number(value).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

const activityFieldLabels: Record<string, string> = {
  matterNo: "事项编号",
  recordNo: "记录编号",
  contractNo: "合同编号",
  partyName: "合同相对方",
  title: "标题",
  name: "名称",
  kind: "类型",
  type: "类型",
  status: "状态",
  priority: "优先级",
  severity: "严重程度",
  method: "跟进方式",
  amount: "金额",
  currency: "币种",
  progress: "进度",
  dueDate: "截止日期",
  occurredAt: "发生日期",
  signedAt: "签署日期",
  effectiveAt: "生效日期",
  expiresAt: "到期日期",
  settledAt: "结清日期",
  nextDueAt: "下次跟进日期",
  renewalNoticeDays: "提前提醒",
  applicantName: "申请人",
  handlerName: "经办负责人",
  approverName: "审批负责人",
  payerName: "付款负责人",
  settlementOwnerName: "结算负责人",
  ownerName: "负责人",
  assigneeName: "负责人",
  nextAssigneeName: "下次跟进负责人",
  remark: "备注",
  rejectionReason: "拒绝原因",
  settlementNote: "结算说明",
  completionNote: "完成说明",
  cancellationReason: "取消原因",
  resolution: "解决方案",
  documentCount: "关联文件数",
};

const activityEnumLabels: Record<string, Record<string, string>> = {
  kind: { LOAN: "借款", REIMBURSEMENT: "报销", RISK: "风险", ISSUE: "问题" },
  type: { PROJECT: "项目", CONTRACT: "合同", REIMBURSEMENT: "报销", LOAN: "借款", PROCUREMENT: "采购", RISK: "风险", ISSUE: "问题", OTHER: "其他" },
  status: {
    PLANNING: "规划中",
    TODO: "待处理",
    OPEN: "待处理",
    DRAFT: "草稿",
    PENDING: "待处理",
    IN_PROGRESS: "进行中",
    ACTIVE: "生效中",
    APPROVED: "已批准",
    PAID: "已支付",
    SETTLED: "已结清",
    COMPLETED: "已完成",
    RESOLVED: "已解决",
    EXPIRED: "已到期",
    REJECTED: "已拒绝",
    TERMINATED: "已终止",
    CANCELLED: "已取消",
  },
  priority: { LOW: "低", NORMAL: "普通", HIGH: "高", URGENT: "紧急" },
  severity: { LOW: "低", MEDIUM: "中", HIGH: "高", CRITICAL: "紧急" },
  method: { CALL: "电话", WECHAT: "微信", EMAIL: "邮件", MEETING: "会议", ONSITE: "现场", OTHER: "其他" },
};

const activityEnumFieldAliases: Record<string, string> = {
  "记录类型": "kind",
  "类型": "type",
  "状态": "status",
  "优先级": "priority",
  "严重程度": "severity",
  "跟进方式": "method",
};

function ActivityMetadataView({ metadata }: { metadata: Record<string, unknown> }) {
  const changes = Array.isArray(metadata.changes) ? metadata.changes : [];
  const snapshot = metadata.snapshot && typeof metadata.snapshot === "object" ? metadata.snapshot as Record<string, unknown> : null;
  const related = metadata.related && typeof metadata.related === "object" ? metadata.related as Record<string, unknown> : null;
  const snapshotEntries = snapshot ? getVisibleActivityEntries(snapshot) : [];
  const relatedEntries = related ? getVisibleActivityEntries(related) : [];
  return (
    <div className="business-activity-metadata">
      {changes.length ? (
        <div>
          <Typography.Text strong>变更内容</Typography.Text>
          <List
            size="small"
            dataSource={changes}
            renderItem={(change) => {
              const item = change as { field?: unknown; before?: unknown; after?: unknown };
              const field = String(item.field ?? "内容");
              return (
                <List.Item>
                  <div className="business-activity-change">
                    <Typography.Text strong>{field}</Typography.Text>
                    <Typography.Text type="secondary">{formatActivityValue(item.before, field)}</Typography.Text>
                    <Typography.Text type="secondary">→</Typography.Text>
                    <Typography.Text>{formatActivityValue(item.after, field)}</Typography.Text>
                  </div>
                </List.Item>
              );
            }}
          />
        </div>
      ) : null}
      {snapshotEntries.length ? (
        <div>
          <Typography.Text strong>当时内容</Typography.Text>
          <Descriptions bordered size="small" column={1}>
            {snapshotEntries.map(([key, value]) => (
              <Descriptions.Item key={key} label={getActivityFieldLabel(key)}>
                {formatActivityValue(value, key, snapshot?.currency)}
              </Descriptions.Item>
            ))}
          </Descriptions>
        </div>
      ) : null}
      {relatedEntries.length ? (
        <div>
          <Typography.Text strong>关联信息</Typography.Text>
          <Descriptions bordered size="small" column={1}>
            {relatedEntries.map(([key, value]) => (
              <Descriptions.Item key={key} label={getActivityFieldLabel(key)}>
                {formatActivityValue(value, key)}
              </Descriptions.Item>
            ))}
          </Descriptions>
        </div>
      ) : null}
    </div>
  );
}

function getVisibleActivityEntries(value: Record<string, unknown>) {
  return Object.entries(value).filter(([key, item]) => {
    if (isTechnicalActivityField(key)) return false;
    return item !== null && item !== undefined && item !== "";
  });
}

function isTechnicalActivityField(key: string) {
  return key === "objectType" || key === "objectId" || key.endsWith("Id") || key === "versionId";
}

function getActivityFieldLabel(key: string) {
  return activityFieldLabels[key] ?? key;
}

function formatActivityValue(value: unknown, field?: string, currency?: unknown) {
  if (value === null || value === undefined || value === "") return "未设置";
  const enumField = field ? activityEnumFieldAliases[field] ?? field : undefined;
  if (enumField && activityEnumLabels[enumField]?.[String(value)]) return activityEnumLabels[enumField][String(value)];
  if (field === "amount" || field === "金额") return formatAmount(String(value), String(currency ?? "CNY"));
  if (field === "progress" || field === "进度") return `${value}%`;
  if (field && (field.endsWith("At") || field.endsWith("Date") || field.includes("日期") || field.includes("时间"))) {
    return formatDateTime(String(value));
  }
  if (isPersonActivityField(field) && isTechnicalIdentifier(value)) return "已指定";
  if (isTechnicalIdentifier(value)) return "已设置";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function isPersonActivityField(field?: string) {
  return Boolean(field && /负责人|申请人|经办|审批|付款|结算|完成人|解决人|跟进人/.test(field));
}

function isTechnicalIdentifier(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value);
}
