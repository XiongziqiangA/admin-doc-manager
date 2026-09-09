import {
  CheckOutlined,
  DeleteOutlined,
  EditOutlined,
  FileAddOutlined,
  FileTextOutlined,
  PlusOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import {
  Button,
  Descriptions,
  Empty,
  Form,
  Input,
  InputNumber,
  List,
  Modal,
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
  createBusinessFinanceRecord,
  createBusinessTask,
  deleteBusinessContract,
  deleteBusinessFinanceRecord,
  deleteBusinessTask,
  detachBusinessFinanceDocument,
  formatApiError,
  getBusinessContract,
  getBusinessWorkflowOverview,
  listBusinessActivities,
  listBusinessFinanceRecords,
  listBusinessReminders,
  listBusinessTasks,
  listDocuments,
  updateBusinessFinanceRecord,
  updateBusinessTask,
  upsertBusinessContract,
} from "./api";
import type {
  BusinessActivityRecord,
  BusinessContractRecord,
  BusinessContractStatus,
  BusinessFinanceKind,
  BusinessFinanceRecord,
  BusinessFinanceStatus,
  BusinessMatterDetail,
  BusinessReminder,
  BusinessTaskPriority,
  BusinessTaskRecord,
  BusinessTaskStatus,
  BusinessWorkflowOverview,
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
  dueDate?: string;
  assigneeId?: string;
}

interface FinanceFormValues {
  kind: BusinessFinanceKind;
  title: string;
  recordNo?: string;
  amount: number;
  currency: string;
  status: BusinessFinanceStatus;
  occurredAt?: string;
  counterparty?: string;
  dueDate?: string;
  settledAt?: string;
  remark?: string;
}

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

export function BusinessWorkflowOverviewPanel({ revision = 0 }: { revision?: number }) {
  const [overview, setOverview] = useState<BusinessWorkflowOverview | null>(null);
  const [reminders, setReminders] = useState<BusinessReminder[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [overviewResult, reminderResult] = await Promise.all([
        getBusinessWorkflowOverview(),
        listBusinessReminders(),
      ]);
      setOverview(overviewResult);
      setReminders(reminderResult.items);
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
        <Button type="text" icon={<ReloadOutlined />} title="刷新业务工作台" aria-label="刷新业务工作台" loading={loading} onClick={() => void load()} />
      </div>
      {overview ? (
        <div className="business-workflow-stat-grid">
          <Statistic title="全部事项" value={overview.matters.total} suffix="项" />
          <Statistic title="进行中事项" value={overview.matters.inProgress} suffix="项" />
          <Statistic title="我的待办" value={overview.tasks.pending} suffix="项" />
          <Statistic title="已逾期" value={overview.tasks.overdue} suffix="项" valueStyle={overview.tasks.overdue ? { color: "#cf1322" } : undefined} />
          <Statistic title="7 天内到期" value={overview.tasks.dueSoon} suffix="项" />
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
                    <Tag color={item.overdue ? "red" : item.kind === "CONTRACT" ? "gold" : "blue"}>
                      {item.overdue ? "已逾期" : item.kind === "CONTRACT" ? "合同" : "待办"}
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

interface BusinessWorkflowPanelProps {
  matter: BusinessMatterDetail;
  currentUser: PublicUser;
  users: UserRecord[];
  onOpenDocument: (document: DocumentRecord) => void;
  onChanged: () => void;
}

export function BusinessWorkflowPanel({
  matter,
  currentUser,
  users,
  onOpenDocument,
  onChanged,
}: BusinessWorkflowPanelProps) {
  const [tasks, setTasks] = useState<BusinessTaskRecord[]>([]);
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
  const [contractOpen, setContractOpen] = useState(false);
  const [contractSubmitting, setContractSubmitting] = useState(false);
  const [voucherTarget, setVoucherTarget] = useState<BusinessFinanceRecord | null>(null);
  const [voucherDocuments, setVoucherDocuments] = useState<DocumentRecord[]>([]);
  const [selectedVoucherIds, setSelectedVoucherIds] = useState<string[]>([]);
  const [voucherLoading, setVoucherLoading] = useState(false);
  const [voucherSubmitting, setVoucherSubmitting] = useState(false);
  const [taskForm] = Form.useForm<TaskFormValues>();
  const [financeForm] = Form.useForm<FinanceFormValues>();
  const [contractForm] = Form.useForm<ContractFormValues>();

  const isAdmin = currentUser.role === "ADMIN";

  const loadWorkflow = async () => {
    setLoading(true);
    try {
      const [taskResult, financeResult, contractResult, activityResult] = await Promise.all([
        listBusinessTasks(matter.id, { pageSize: 100 }),
        listBusinessFinanceRecords(matter.id, { pageSize: 100 }),
        getBusinessContract(matter.id),
        listBusinessActivities(matter.id, { pageSize: 100 }),
      ]);
      setTasks(taskResult.items);
      setFinanceRecords(financeResult.items);
      setContract(contractResult);
      setActivities(activityResult.items);
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

  const openTaskForm = (task?: BusinessTaskRecord) => {
    setEditingTask(task ?? null);
    taskForm.resetFields();
    taskForm.setFieldsValue(task ? {
      title: task.title,
      description: task.description ?? undefined,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate?.slice(0, 10),
      assigneeId: task.assigneeId ?? undefined,
    } : { status: "TODO", priority: "NORMAL", assigneeId: matter.ownerId });
    setTaskOpen(true);
  };

  const submitTask = async () => {
    try {
      const values = await taskForm.validateFields();
      setTaskSubmitting(true);
      const payload = {
        title: values.title.trim(),
        description: values.description?.trim() || null,
        status: values.status,
        priority: values.priority,
        dueDate: values.dueDate || null,
        ...(isAdmin ? { assigneeId: values.assigneeId || null } : {}),
      };
      if (editingTask) {
        await updateBusinessTask(matter.id, editingTask.id, payload);
      } else {
        await createBusinessTask(matter.id, payload);
      }
      message.success(editingTask ? "跟进任务已更新" : "跟进任务已创建");
      setTaskOpen(false);
      await refreshAfterChange();
    } catch (error) {
      if (error && typeof error === "object" && "errorFields" in error) return;
      message.error(`任务保存失败：${formatApiError(error)}`);
    } finally {
      setTaskSubmitting(false);
    }
  };

  const completeTask = async (task: BusinessTaskRecord) => {
    try {
      await updateBusinessTask(matter.id, task.id, { status: "COMPLETED" });
      message.success("任务已完成");
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
    financeForm.resetFields();
    financeForm.setFieldsValue(record ? {
      kind: record.kind,
      title: record.title,
      recordNo: record.recordNo,
      amount: Number(record.amount),
      currency: record.currency,
      status: record.status,
      occurredAt: record.occurredAt?.slice(0, 10),
      counterparty: record.counterparty ?? undefined,
      dueDate: record.dueDate?.slice(0, 10),
      settledAt: record.settledAt?.slice(0, 10),
      remark: record.remark ?? undefined,
    } : {
      kind: matter.type === "LOAN" ? "LOAN" : "REIMBURSEMENT",
      status: "DRAFT",
      currency: "CNY",
    });
    setFinanceOpen(true);
  };

  const submitFinance = async () => {
    try {
      const values = await financeForm.validateFields();
      setFinanceSubmitting(true);
      const payload = {
        kind: values.kind,
        title: values.title.trim(),
        amount: values.amount,
        currency: values.currency.trim().toUpperCase(),
        status: values.status,
        occurredAt: values.occurredAt || null,
        counterparty: values.counterparty?.trim() || null,
        dueDate: values.dueDate || null,
        settledAt: values.settledAt || null,
        remark: values.remark?.trim() || null,
        ...(!editingFinance && values.recordNo ? { recordNo: values.recordNo.trim() } : {}),
      };
      if (editingFinance) {
        await updateBusinessFinanceRecord(matter.id, editingFinance.id, payload);
      } else {
        await createBusinessFinanceRecord(matter.id, payload);
      }
      message.success(editingFinance ? "财务记录已更新" : "财务记录已创建");
      setFinanceOpen(false);
      await refreshAfterChange();
    } catch (error) {
      if (error && typeof error === "object" && "errorFields" in error) return;
      message.error(`财务记录保存失败：${formatApiError(error)}`);
    } finally {
      setFinanceSubmitting(false);
    }
  };

  const removeFinance = (record: BusinessFinanceRecord) => {
    Modal.confirm({
      title: "删除财务记录",
      content: `确认删除“${record.title}”吗？关联凭证和源文件不会被删除。`,
      okButtonProps: { danger: true },
      okText: "删除",
      cancelText: "取消",
      onOk: async () => {
        await deleteBusinessFinanceRecord(matter.id, record.id);
        message.success("财务记录已删除");
        await refreshAfterChange();
      },
    });
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

  const taskTab = (
    <section className="business-workflow-tab-section">
      <div className="business-matter-section-heading">
        <Typography.Text strong>跟进任务</Typography.Text>
        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => openTaskForm()}>新建任务</Button>
      </div>
      {tasks.length ? (
        <List
          dataSource={tasks}
          renderItem={(task) => (
            <List.Item
              actions={[
                ...(task.status !== "COMPLETED" && task.status !== "CANCELLED" ? [
                  <Button key="complete" type="link" icon={<CheckOutlined />} onClick={() => void completeTask(task)}>完成</Button>,
                ] : []),
                <Button key="edit" type="link" icon={<EditOutlined />} onClick={() => openTaskForm(task)}>编辑</Button>,
                <Button key="delete" type="link" danger icon={<DeleteOutlined />} onClick={() => removeTask(task)}>删除</Button>,
              ]}
            >
              <List.Item.Meta
                title={<Space wrap><Typography.Text strong>{task.title}</Typography.Text><Tag color={taskStatusColors[task.status]}>{taskStatusLabels[task.status]}</Tag><Tag color={priorityColors[task.priority]}>{priorityLabels[task.priority]}</Tag></Space>}
                description={
                  <Space direction="vertical" size={2}>
                    <Typography.Text type="secondary">负责人：{task.assignee?.realName || task.assignee?.username || "未指定"} · 截止：{formatDateOnly(task.dueDate)}</Typography.Text>
                    {task.description ? <Typography.Text>{task.description}</Typography.Text> : null}
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无跟进任务" />}
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
                <Button key="edit" type="link" icon={<EditOutlined />} onClick={() => openFinanceForm(record)}>编辑</Button>,
                <Button key="delete" type="link" danger icon={<DeleteOutlined />} onClick={() => removeFinance(record)}>删除</Button>,
              ]}
            >
              <List.Item.Meta
                title={<Space wrap><Typography.Text strong>{record.title}</Typography.Text><Tag>{financeKindLabels[record.kind]}</Tag><Tag color={record.status === "SETTLED" ? "success" : "blue"}>{financeStatusLabels[record.status]}</Tag></Space>}
                description={
                  <div className="business-finance-content">
                    <Typography.Text type="secondary">{record.recordNo} · {formatAmount(record.amount, record.currency)} · {formatDateOnly(record.occurredAt)}</Typography.Text>
                    {record.counterparty ? <Typography.Text>往来对象：{record.counterparty}</Typography.Text> : null}
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
          </div>
        ),
      }))}
    />
  ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无业务操作记录" />;

  return (
    <section className="business-workflow-panel">
      <div className="business-matter-section-heading">
        <Typography.Title level={4}>业务跟踪</Typography.Title>
        <Button type="text" icon={<ReloadOutlined />} title="刷新业务数据" aria-label="刷新业务数据" loading={loading} onClick={() => void loadWorkflow()} />
      </div>
      <Tabs
        items={[
          { key: "tasks", label: `跟进任务 ${tasks.length}`, children: taskTab },
          { key: "finance", label: `借款与报销 ${financeRecords.length}`, children: financeTab },
          ...(matter.type === "CONTRACT" ? [{ key: "contract", label: "合同信息", children: contractTab }] : []),
          { key: "activity", label: `操作记录 ${activities.length}`, children: activityTab },
        ]}
      />

      <Modal title={editingTask ? "编辑跟进任务" : "新建跟进任务"} open={taskOpen} okText="保存" cancelText="取消" confirmLoading={taskSubmitting} onOk={() => void submitTask()} onCancel={() => setTaskOpen(false)} destroyOnHidden>
        <Form form={taskForm} layout="vertical">
          <Form.Item name="title" label="任务标题" rules={[{ required: true, message: "请输入任务标题" }]}><Input maxLength={200} /></Form.Item>
          <div className="business-workflow-form-grid">
            <Form.Item name="status" label="状态" rules={[{ required: true }]}><Select options={Object.entries(taskStatusLabels).map(([value, label]) => ({ value, label }))} /></Form.Item>
            <Form.Item name="priority" label="优先级" rules={[{ required: true }]}><Select options={Object.entries(priorityLabels).map(([value, label]) => ({ value, label }))} /></Form.Item>
            <Form.Item name="dueDate" label="截止日期"><Input type="date" /></Form.Item>
            {isAdmin ? <Form.Item name="assigneeId" label="负责人"><Select allowClear showSearch optionFilterProp="label" options={users.map((item) => ({ value: item.id, label: `${item.realName}（${item.username}）` }))} /></Form.Item> : null}
          </div>
          <Form.Item name="description" label="说明"><Input.TextArea rows={3} maxLength={4000} /></Form.Item>
        </Form>
      </Modal>

      <Modal title={editingFinance ? "编辑财务记录" : "新增财务记录"} open={financeOpen} width={700} okText="保存" cancelText="取消" confirmLoading={financeSubmitting} onOk={() => void submitFinance()} onCancel={() => setFinanceOpen(false)} destroyOnHidden>
        <Form form={financeForm} layout="vertical">
          <div className="business-workflow-form-grid">
            <Form.Item name="kind" label="记录类型" rules={[{ required: true }]}><Select options={Object.entries(financeKindLabels).map(([value, label]) => ({ value, label }))} /></Form.Item>
            <Form.Item name="status" label="状态" rules={[{ required: true }]}><Select options={Object.entries(financeStatusLabels).map(([value, label]) => ({ value, label }))} /></Form.Item>
          </div>
          <Form.Item name="title" label="记录标题" rules={[{ required: true, message: "请输入记录标题" }]}><Input maxLength={200} /></Form.Item>
          {!editingFinance ? <Form.Item name="recordNo" label="业务单号"><Input maxLength={120} placeholder="留空时自动生成" /></Form.Item> : null}
          <div className="business-workflow-form-grid">
            <Form.Item name="amount" label="金额" rules={[{ required: true, message: "请输入金额" }]}><InputNumber min={0} precision={2} className="full-width-control" /></Form.Item>
            <Form.Item name="currency" label="币种" rules={[{ required: true }]}><Input maxLength={12} /></Form.Item>
            <Form.Item name="occurredAt" label="发生日期"><Input type="date" /></Form.Item>
            <Form.Item name="dueDate" label="应结日期"><Input type="date" /></Form.Item>
            <Form.Item name="settledAt" label="结清日期"><Input type="date" /></Form.Item>
            <Form.Item name="counterparty" label="往来对象"><Input maxLength={200} /></Form.Item>
          </div>
          <Form.Item name="remark" label="备注"><Input.TextArea rows={3} maxLength={4000} /></Form.Item>
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
    </section>
  );
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
