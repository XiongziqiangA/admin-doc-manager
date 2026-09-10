import {
  DeleteOutlined,
  EditOutlined,
  FileTextOutlined,
  PaperClipOutlined,
  PlusOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import {
  Button,
  Cascader,
  Empty,
  Form,
  Input,
  List,
  Modal,
  Select,
  Segmented,
  Space,
  Spin,
  Statistic,
  Tag,
  Typography,
  message,
} from "antd";
import { useEffect, useMemo, useState } from "react";

import {
  attachBusinessIssueDocuments,
  createBusinessIssue,
  deleteBusinessIssue,
  detachBusinessIssueDocument,
  formatApiError,
  listBusinessIssues,
  updateBusinessIssue,
  uploadDocument,
} from "./api";
import type {
  BusinessIssueKind,
  BusinessIssueRecord,
  BusinessIssueSeverity,
  BusinessIssueStatus,
  BusinessMatterDetail,
  CategoryNode,
  DocumentRecord,
  PublicUser,
  UserRecord,
} from "./types";

const kindLabels: Record<BusinessIssueKind, string> = { RISK: "风险", ISSUE: "问题" };
const severityLabels: Record<BusinessIssueSeverity, string> = { LOW: "低", MEDIUM: "中", HIGH: "高", CRITICAL: "紧急" };
const statusLabels: Record<BusinessIssueStatus, string> = { OPEN: "待处理", IN_PROGRESS: "处理中", RESOLVED: "已解决", CANCELLED: "已取消" };
const severityColors: Record<BusinessIssueSeverity, string> = { LOW: "default", MEDIUM: "blue", HIGH: "orange", CRITICAL: "red" };
const statusColors: Record<BusinessIssueStatus, string> = { OPEN: "gold", IN_PROGRESS: "processing", RESOLVED: "success", CANCELLED: "default" };

interface IssueFormValues {
  kind: BusinessIssueKind;
  title: string;
  description?: string;
  severity: BusinessIssueSeverity;
  status: BusinessIssueStatus;
  ownerId?: string;
  ownerName?: string;
  dueDate?: string;
  resolution?: string;
}

type OwnerMode = "master" | "custom";

interface BusinessIssuesPanelProps {
  matter: BusinessMatterDetail;
  currentUser: PublicUser;
  users: UserRecord[];
  categories: CategoryNode[];
  onOpenDocument: (document: DocumentRecord) => void;
  onChanged: () => void;
}

export function BusinessIssuesPanel({
  matter,
  currentUser,
  users,
  categories,
  onOpenDocument,
  onChanged,
}: BusinessIssuesPanelProps) {
  const [issues, setIssues] = useState<BusinessIssueRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<BusinessIssueRecord | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [kindFilter, setKindFilter] = useState<BusinessIssueKind>();
  const [statusFilter, setStatusFilter] = useState<BusinessIssueStatus>();
  const [severityFilter, setSeverityFilter] = useState<BusinessIssueSeverity>();
  const [ownerMode, setOwnerMode] = useState<OwnerMode>("master");
  const [attachmentTarget, setAttachmentTarget] = useState<BusinessIssueRecord | null>(null);
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [attachmentCategoryPath, setAttachmentCategoryPath] = useState<string[]>([]);
  const [attachmentSubmitting, setAttachmentSubmitting] = useState(false);
  const [form] = Form.useForm<IssueFormValues>();
  const statusValue = Form.useWatch("status", form);
  const isAdmin = currentUser.role === "ADMIN";

  const load = async () => {
    setLoading(true);
    try {
      const items: BusinessIssueRecord[] = [];
      let page = 1;
      let totalPages = 1;
      while (page <= totalPages) {
        const result = await listBusinessIssues(matter.id, { page, pageSize: 100 });
        items.push(...result.items);
        totalPages = result.pagination.totalPages || 1;
        page += 1;
      }
      setIssues(items);
    } catch (error) {
      message.error(`风险与问题加载失败：${formatApiError(error)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [matter.id]);

  const visibleIssues = useMemo(
    () => issues.filter((item) => (!kindFilter || item.kind === kindFilter)
      && (!statusFilter || item.status === statusFilter)
      && (!severityFilter || item.severity === severityFilter)),
    [issues, kindFilter, statusFilter, severityFilter],
  );

  const unresolved = issues.filter((item) => item.status === "OPEN" || item.status === "IN_PROGRESS");
  const overdue = unresolved.filter((item) => item.dueDate && new Date(item.dueDate) < new Date());
  const critical = unresolved.filter((item) => item.severity === "HIGH" || item.severity === "CRITICAL");

  const resetForm = () => {
    form.resetFields();
    setEditing(null);
    setOwnerMode("master");
    setFormOpen(false);
  };

  const openCreate = () => {
    setEditing(null);
    setOwnerMode("master");
    form.resetFields();
    form.setFieldsValue({ kind: "ISSUE", severity: "MEDIUM", status: "OPEN", ownerId: currentUser.id });
    setFormOpen(true);
  };

  const openEdit = (issue: BusinessIssueRecord) => {
    setEditing(issue);
    setOwnerMode(issue.ownerName ? "custom" : "master");
    form.setFieldsValue({
      kind: issue.kind,
      title: issue.title,
      description: issue.description ?? undefined,
      severity: issue.severity,
      status: issue.status,
      ownerId: issue.ownerId ?? undefined,
      ownerName: issue.ownerName ?? undefined,
      dueDate: issue.dueDate?.slice(0, 10),
      resolution: issue.resolution ?? undefined,
    });
    setFormOpen(true);
  };

  const closeForm = () => {
    if (submitting) return;
    resetForm();
  };

  const submit = async () => {
    try {
      const values = await form.validateFields();
      if (values.status === "RESOLVED" && !values.resolution?.trim()) {
        message.warning("解决风险或问题时必须填写解决方案或处理结果");
        return;
      }
      setSubmitting(true);
      const payload = {
        kind: values.kind,
        title: values.title.trim(),
        description: values.description?.trim() || null,
        severity: values.severity,
        status: values.status,
        ownerId: ownerMode === "master" ? values.ownerId || null : null,
        ownerName: ownerMode === "custom" ? values.ownerName?.trim() || null : null,
        dueDate: values.dueDate || null,
        resolution: values.resolution?.trim() || null,
      };
      if (editing) {
        await updateBusinessIssue(matter.id, editing.id, payload);
      } else {
        await createBusinessIssue(matter.id, payload);
      }
      message.success(editing ? "风险或问题已更新" : "风险或问题已登记");
      resetForm();
      await load();
      onChanged();
    } catch (error) {
      if (error && typeof error === "object" && "errorFields" in error) return;
      message.error(`风险或问题保存失败：${formatApiError(error)}`);
    } finally {
      setSubmitting(false);
    }
  };

  const remove = (issue: BusinessIssueRecord) => {
    Modal.confirm({
      title: `删除${kindLabels[issue.kind]}`,
      content: `确认删除“${issue.title}”吗？操作记录会保留，附件和源文件不会被删除。`,
      okText: "删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        await deleteBusinessIssue(matter.id, issue.id);
        message.success("风险或问题已删除");
        await load();
        onChanged();
      },
    });
  };

  const openAttachments = (issue: BusinessIssueRecord) => {
    setAttachmentTarget(issue);
    setAttachmentFiles([]);
    setAttachmentCategoryPath([]);
  };

  const closeAttachments = () => {
    if (attachmentSubmitting) return;
    setAttachmentTarget(null);
    setAttachmentFiles([]);
    setAttachmentCategoryPath([]);
  };

  const uploadAndAttach = async () => {
    if (!attachmentTarget || !attachmentFiles.length || !attachmentCategoryPath.length) return;
    setAttachmentSubmitting(true);
    try {
      const categoryId = attachmentCategoryPath[0];
      const subcategoryId = attachmentCategoryPath.length > 1 ? attachmentCategoryPath[attachmentCategoryPath.length - 1] : undefined;
      const documentIds: string[] = [];
      for (const file of attachmentFiles) {
        const data = new FormData();
        data.append("file", file);
        data.append("categoryId", categoryId);
        if (subcategoryId) data.append("subcategoryId", subcategoryId);
        documentIds.push((await uploadDocument(data)).id);
      }
      await attachBusinessIssueDocuments(matter.id, attachmentTarget.id, { documentIds });
      message.success(`已上传并关联 ${documentIds.length} 份附件`);
      closeAttachments();
      await load();
      onChanged();
    } catch (error) {
      message.error(`风险/问题附件处理失败：${formatApiError(error)}`);
    } finally {
      setAttachmentSubmitting(false);
    }
  };

  const detachDocument = async (issue: BusinessIssueRecord, documentId: string) => {
    try {
      await detachBusinessIssueDocument(matter.id, issue.id, documentId);
      message.success("附件关联已取消，文件中心源文件仍保留");
      await load();
      onChanged();
    } catch (error) {
      message.error(`取消附件关联失败：${formatApiError(error)}`);
    }
  };

  return (
    <section className="business-issues-panel">
      <div className="business-matter-section-heading">
        <div>
          <Typography.Title level={4}>风险与问题</Typography.Title>
          <Typography.Text type="secondary">记录影响项目进度的风险、问题和处理结果，相关文件可直接挂在记录下。</Typography.Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} aria-label="刷新风险与问题" title="刷新风险与问题" loading={loading} onClick={() => void load()} />
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>登记风险/问题</Button>
        </Space>
      </div>

      <div className="business-issue-stat-grid">
        <Statistic title="未解决" value={unresolved.length} suffix="项" />
        <Statistic title="风险" value={unresolved.filter((item) => item.kind === "RISK").length} suffix="项" />
        <Statistic title="问题" value={unresolved.filter((item) => item.kind === "ISSUE").length} suffix="项" />
        <Statistic title="高危/紧急" value={critical.length} suffix="项" valueStyle={critical.length ? { color: "#cf1322" } : undefined} />
        <Statistic title="已逾期" value={overdue.length} suffix="项" valueStyle={overdue.length ? { color: "#cf1322" } : undefined} />
      </div>

      <Space wrap className="business-issue-filters">
        <Select allowClear placeholder="全部类型" value={kindFilter} onChange={setKindFilter} options={Object.entries(kindLabels).map(([value, label]) => ({ value, label }))} />
        <Select allowClear placeholder="全部状态" value={statusFilter} onChange={setStatusFilter} options={Object.entries(statusLabels).map(([value, label]) => ({ value, label }))} />
        <Select allowClear placeholder="全部严重程度" value={severityFilter} onChange={setSeverityFilter} options={Object.entries(severityLabels).map(([value, label]) => ({ value, label }))} />
        <Typography.Text type="secondary">显示 {visibleIssues.length} / {issues.length} 项</Typography.Text>
      </Space>

      {loading && !issues.length ? <div className="loading-state"><Spin /></div> : visibleIssues.length ? (
        <List
          className="business-issue-list"
          dataSource={visibleIssues}
          rowKey="id"
          renderItem={(issue) => (
            <List.Item
              actions={[
                <Button key="edit" type="link" icon={<EditOutlined />} onClick={() => openEdit(issue)}>编辑</Button>,
                <Button key="delete" type="link" danger icon={<DeleteOutlined />} onClick={() => remove(issue)}>删除</Button>,
              ]}
            >
              <div className="business-issue-item">
                <div className="business-issue-item-heading">
                  <Space wrap size={6}>
                    <Tag color={issue.kind === "RISK" ? "purple" : "cyan"}>{kindLabels[issue.kind]}</Tag>
                    <Tag color={severityColors[issue.severity]}>{severityLabels[issue.severity]}</Tag>
                    <Tag color={statusColors[issue.status]}>{statusLabels[issue.status]}</Tag>
                    <Typography.Text strong>{issue.title}</Typography.Text>
                  </Space>
                  <Typography.Text type={isOverdue(issue) ? "danger" : "secondary"}>
                    截止：{formatDateOnly(issue.dueDate)}
                  </Typography.Text>
                </div>
                <Typography.Paragraph ellipsis={{ rows: 2 }} className="business-issue-description">
                  {issue.description || "暂无描述"}
                </Typography.Paragraph>
                <Space wrap size={[12, 4]}>
                  <Typography.Text type="secondary">责任人：{issue.ownerName || issue.owner?.realName || issue.owner?.username || "未指定"}</Typography.Text>
                  <Typography.Text type="secondary">登记人：{issue.createdBy?.realName || "-"}</Typography.Text>
                  {issue.resolvedAt ? <Typography.Text type="success">解决：{formatDateOnly(issue.resolvedAt)} · {issue.resolvedBy?.realName || "-"}</Typography.Text> : null}
                </Space>
                {issue.resolution ? <Typography.Text type="success">处理结果：{issue.resolution}</Typography.Text> : null}
                <div className="business-issue-attachments">
                  <Space wrap size={4}>
                    <Button size="small" icon={<PaperClipOutlined />} onClick={() => openAttachments(issue)}>附件 {issue.documents.length}</Button>
                    {issue.documents.map((link) => (
                      <span className="business-voucher-chip" key={link.documentId}>
                        <Button type="link" size="small" icon={<FileTextOutlined />} onClick={() => onOpenDocument(link.document)}>{link.document.title}</Button>
                        <Button type="text" danger size="small" onClick={() => void detachDocument(issue, link.documentId)} aria-label={`取消关联${link.document.title}`} title="取消关联">×</Button>
                      </span>
                    ))}
                  </Space>
                </div>
              </div>
            </List.Item>
          )}
        />
      ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无风险或问题记录" />}

      <Modal
        title={editing ? `编辑${kindLabels[editing.kind]}` : "登记风险/问题"}
        open={formOpen}
        width={700}
        okText="保存"
        cancelText="取消"
        confirmLoading={submitting}
        onOk={() => void submit()}
        onCancel={closeForm}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <div className="business-workflow-form-grid">
            <Form.Item name="kind" label="类型" rules={[{ required: true, message: "请选择类型" }]}><Select options={Object.entries(kindLabels).map(([value, label]) => ({ value, label }))} /></Form.Item>
            <Form.Item name="severity" label="严重程度" rules={[{ required: true, message: "请选择严重程度" }]}><Select options={Object.entries(severityLabels).map(([value, label]) => ({ value, label }))} /></Form.Item>
            <Form.Item name="status" label="状态" rules={[{ required: true, message: "请选择状态" }]}><Select options={issueStatusOptions(editing)} /></Form.Item>
            <Form.Item name="dueDate" label="处理截止日期"><Input type="date" /></Form.Item>
          </div>
          <Form.Item name="title" label="标题" rules={[{ required: true, message: "请输入标题" }]}><Input maxLength={200} /></Form.Item>
          <div className="business-workflow-reference-field">
            <Typography.Text strong>责任人</Typography.Text>
            <Segmented
              block
              value={ownerMode}
              options={[{ label: "系统账号", value: "master" }, { label: "自定义输入", value: "custom" }]}
              onChange={(value) => {
                const next = value as OwnerMode;
                setOwnerMode(next);
                form.setFieldsValue(next === "custom" ? { ownerId: undefined } : { ownerName: undefined });
              }}
            />
            {ownerMode === "custom" ? (
              <Form.Item name="ownerName" rules={[{ required: true, message: "请输入责任人名称" }]}><Input maxLength={200} placeholder="例如：供应商项目经理" /></Form.Item>
            ) : isAdmin ? (
              <Form.Item name="ownerId"><Select allowClear showSearch optionFilterProp="label" options={users.map((item) => ({ value: item.id, label: `${item.realName}（${item.username}）` }))} /></Form.Item>
            ) : <Input disabled value={editing?.owner?.realName || currentUser.realName} />}
          </div>
          <Form.Item name="description" label="描述"><Input.TextArea rows={4} maxLength={4000} /></Form.Item>
          {statusValue === "RESOLVED" ? <Form.Item name="resolution" label="解决方案/处理结果" rules={[{ required: true, message: "请输入解决方案或处理结果" }]}><Input.TextArea rows={4} maxLength={4000} /></Form.Item> : <Form.Item name="resolution" label="当前处理记录"><Input.TextArea rows={3} maxLength={4000} /></Form.Item>}
        </Form>
      </Modal>

      <Modal
        title={attachmentTarget ? `附件 · ${attachmentTarget.title}` : "附件"}
        open={Boolean(attachmentTarget)}
        width={700}
        okText={`上传并关联 ${attachmentFiles.length || ""} 份文件`}
        cancelText="关闭"
        confirmLoading={attachmentSubmitting}
        okButtonProps={{ disabled: !attachmentFiles.length || !attachmentCategoryPath.length }}
        onOk={() => void uploadAndAttach()}
        onCancel={closeAttachments}
        destroyOnHidden
      >
        <Space direction="vertical" size={12} className="full-width-control">
          <Typography.Text type="secondary">附件会进入文件中心；取消关联不会删除源文件。</Typography.Text>
          <Cascader className="full-width-control" options={toCategoryOptions(categories)} value={attachmentCategoryPath} onChange={(value) => setAttachmentCategoryPath(value as string[])} placeholder="选择附件所属分类" changeOnSelect />
          <label className="business-workflow-file-picker">
            <PaperClipOutlined />
            <span>{attachmentFiles.length ? `已选择 ${attachmentFiles.length} 份附件` : "选择附件文件（可多选）"}</span>
            <input type="file" multiple onChange={(event) => { setAttachmentFiles(Array.from(event.target.files ?? [])); event.currentTarget.value = ""; }} />
          </label>
          {attachmentFiles.length ? <List size="small" bordered dataSource={attachmentFiles} renderItem={(file) => <List.Item>{file.name}<Typography.Text type="secondary">{formatFileSize(file.size)}</Typography.Text></List.Item>} /> : null}
        </Space>
      </Modal>
    </section>
  );
}

function issueStatusOptions(issue: BusinessIssueRecord | null) {
  const values: BusinessIssueStatus[] = issue
    ? ({ OPEN: ["OPEN", "IN_PROGRESS", "RESOLVED", "CANCELLED"], IN_PROGRESS: ["IN_PROGRESS", "OPEN", "RESOLVED", "CANCELLED"], RESOLVED: ["RESOLVED", "OPEN", "IN_PROGRESS"], CANCELLED: ["CANCELLED", "OPEN"] } as Record<BusinessIssueStatus, BusinessIssueStatus[]>)[issue.status]
    : ["OPEN", "IN_PROGRESS"];
  return values.map((value) => ({ value, label: statusLabels[value] }));
}

function isOverdue(issue: BusinessIssueRecord) {
  return Boolean(issue.dueDate && ["OPEN", "IN_PROGRESS"].includes(issue.status) && new Date(issue.dueDate) < new Date());
}

function toCategoryOptions(nodes: CategoryNode[]): Array<{ value: string; label: string; children?: Array<{ value: string; label: string }> }> {
  return nodes.map((node) => ({ value: node.id, label: node.name, children: node.children?.length ? toCategoryOptions(node.children) : undefined }));
}

function formatDateOnly(value?: string | null) {
  if (!value) return "未设置";
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(new Date(value));
}

function formatFileSize(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
