import {
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  FileTextOutlined,
  LinkOutlined,
  PlusOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import {
  Button,
  Cascader,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  List,
  Modal,
  Progress,
  Select,
  Segmented,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useState } from "react";

import {
  attachBusinessMatterDocuments,
  createBusinessMatter,
  deleteBusinessMatter,
  detachBusinessMatterDocument,
  formatApiError,
  getBusinessMatter,
  getBusinessProjectPlan,
  listBusinessMatters,
  listDocuments,
  listUsers,
  updateBusinessMatter,
} from "./api";
import type {
  BusinessMatterDetail,
  BusinessMatterRecord,
  BusinessMatterStatus,
  BusinessMatterType,
  BusinessProjectHealth,
  CategoryNode,
  DepartmentRecord,
  DocumentRecord,
  PartnerRecord,
  PublicUser,
  UserRecord,
  BusinessProjectPlan,
} from "./types";
import { BusinessProjectPlanPanel } from "./business-project-plan-panel";
import { BusinessIssuesPanel } from "./business-issues-panel";
import { BusinessResponsibilityReportPanel, BusinessWorkflowOverviewPanel, BusinessWorkflowPanel } from "./business-workflow-panel";

const typeLabels: Record<BusinessMatterType, string> = {
  PROJECT: "项目",
  CONTRACT: "合同",
  REIMBURSEMENT: "报销",
  LOAN: "借款",
  PROCUREMENT: "采购",
  OTHER: "其他事项",
};

const statusLabels: Record<BusinessMatterStatus, string> = {
  PLANNING: "筹备中",
  IN_PROGRESS: "进行中",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
};

const statusColors: Record<BusinessMatterStatus, string> = {
  PLANNING: "blue",
  IN_PROGRESS: "processing",
  COMPLETED: "success",
  CANCELLED: "default",
};

const healthLabels: Record<BusinessProjectHealth, string> = {
  HEALTHY: "正常",
  AT_RISK: "需关注",
  DELAYED: "已延期",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
  NO_PLAN: "暂无计划",
};

const healthColors: Record<BusinessProjectHealth, string> = {
  HEALTHY: "green",
  AT_RISK: "gold",
  DELAYED: "red",
  COMPLETED: "success",
  CANCELLED: "default",
  NO_PLAN: "default",
};

type ReferenceInputMode = "master" | "custom";

interface BusinessMatterFormValues {
  title: string;
  type: BusinessMatterType;
  status: BusinessMatterStatus;
  parentId?: string;
  ownerId?: string;
  ownerName?: string;
  departmentId?: string;
  departmentName?: string;
  partnerId?: string;
  partnerName?: string;
  startDate?: string;
  endDate?: string;
  amount?: number;
  remark?: string;
}

interface BusinessMattersPageProps {
  currentUser: PublicUser;
  departments: DepartmentRecord[];
  partners: PartnerRecord[];
  categories: CategoryNode[];
  onOpenDocument: (document: DocumentRecord) => void;
}

export function BusinessMattersPage({
  currentUser,
  departments,
  partners,
  categories,
  onOpenDocument,
}: BusinessMattersPageProps) {
  const [records, setRecords] = useState<BusinessMatterRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [keyword, setKeyword] = useState("");
  const [type, setType] = useState<BusinessMatterType>();
  const [status, setStatus] = useState<BusinessMatterStatus>();
  const [selectedMatter, setSelectedMatter] = useState<BusinessMatterDetail | null>(null);
  const [selectedProjectPlan, setSelectedProjectPlan] = useState<BusinessProjectPlan | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deletingMatter, setDeletingMatter] = useState<BusinessMatterRecord | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingMatter, setEditingMatter] = useState<BusinessMatterRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [allMatters, setAllMatters] = useState<BusinessMatterRecord[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [attachOpen, setAttachOpen] = useState(false);
  const [attachLoading, setAttachLoading] = useState(false);
  const [attachSubmitting, setAttachSubmitting] = useState(false);
  const [attachKeyword, setAttachKeyword] = useState("");
  const [attachCategoryPath, setAttachCategoryPath] = useState<string[]>([]);
  const [availableDocuments, setAvailableDocuments] = useState<DocumentRecord[]>([]);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [detachingDocument, setDetachingDocument] = useState<DocumentRecord | null>(null);
  const [detachSubmitting, setDetachSubmitting] = useState(false);
  const [ownerInputMode, setOwnerInputMode] = useState<ReferenceInputMode>("master");
  const [departmentInputMode, setDepartmentInputMode] = useState<ReferenceInputMode>("master");
  const [partnerInputMode, setPartnerInputMode] = useState<ReferenceInputMode>("master");
  const [workflowRevision, setWorkflowRevision] = useState(0);
  const [form] = Form.useForm<BusinessMatterFormValues>();

  const isAdmin = currentUser.role === "ADMIN";

  const loadMatters = async () => {
    setLoading(true);
    try {
      const result = await listBusinessMatters({
        page,
        pageSize: 20,
        keyword: keyword.trim() || undefined,
        type,
        status,
        sortBy: "updatedAt",
        sortOrder: "desc",
      });
      setRecords(result.items);
      setTotal(result.pagination.totalItems);
    } catch (error) {
      message.error(`事项列表加载失败：${formatApiError(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const loadAllMatters = async () => {
    const items: BusinessMatterRecord[] = [];
    let currentPage = 1;
    let totalPages = 1;
    while (currentPage <= totalPages) {
      const result = await listBusinessMatters({ page: currentPage, pageSize: 100, sortBy: "title", sortOrder: "asc" });
      items.push(...result.items);
      totalPages = result.pagination.totalPages || 1;
      currentPage += 1;
    }
    setAllMatters(items);
  };

  const loadUsers = async () => {
    if (!isAdmin || users.length) {
      return;
    }
    try {
      const result = await listUsers();
      setUsers(result.items.filter((item) => item.status === "ACTIVE"));
    } catch (error) {
      message.error(`负责人列表加载失败：${formatApiError(error)}`);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => void loadMatters(), 250);
    return () => window.clearTimeout(timer);
  }, [keyword, type, status, page]);

  useEffect(() => {
    if (modalOpen) {
      void loadAllMatters();
      void loadUsers();
    }
  }, [modalOpen]);

  const openDetail = async (record: BusinessMatterRecord) => {
    setDetailLoading(true);
    void loadUsers();
    try {
      const [matter, projectPlan] = await Promise.all([getBusinessMatter(record.id), getBusinessProjectPlan(record.id)]);
      setSelectedMatter(matter);
      setSelectedProjectPlan(projectPlan);
    } catch (error) {
      message.error(`事项详情加载失败：${formatApiError(error)}`);
    } finally {
      setDetailLoading(false);
    }
  };

  const refreshSelectedProject = async () => {
    if (!selectedMatter) return;
    try {
      const [matter, projectPlan] = await Promise.all([
        getBusinessMatter(selectedMatter.id),
        getBusinessProjectPlan(selectedMatter.id),
      ]);
      setSelectedMatter(matter);
      setSelectedProjectPlan(projectPlan);
      setWorkflowRevision((value) => value + 1);
    } catch (error) {
      message.error(`项目进度刷新失败：${formatApiError(error)}`);
    }
  };

  const resetModal = () => {
    form.resetFields();
    setEditingMatter(null);
    setOwnerInputMode("master");
    setDepartmentInputMode("master");
    setPartnerInputMode("master");
    setModalOpen(false);
  };

  const openCreate = () => {
    setEditingMatter(null);
    form.resetFields();
    setOwnerInputMode("master");
    setDepartmentInputMode("master");
    setPartnerInputMode("master");
    form.setFieldsValue({ type: "PROJECT", status: "PLANNING", ownerId: isAdmin ? currentUser.id : undefined });
    setModalOpen(true);
  };

  const openEdit = (record: BusinessMatterRecord) => {
    setEditingMatter(record);
    setOwnerInputMode(record.ownerName ? "custom" : "master");
    setDepartmentInputMode(record.departmentName ? "custom" : "master");
    setPartnerInputMode(record.partnerName ? "custom" : "master");
    form.setFieldsValue({
      title: record.title,
      type: record.type,
      status: record.status,
      parentId: record.parentId ?? undefined,
      ownerId: record.ownerId,
      ownerName: record.ownerName ?? undefined,
      departmentId: record.departmentId ?? undefined,
      departmentName: record.departmentName ?? undefined,
      partnerId: record.partnerId ?? undefined,
      partnerName: record.partnerName ?? undefined,
      startDate: record.startDate?.slice(0, 10) ?? undefined,
      endDate: record.endDate?.slice(0, 10) ?? undefined,
      amount: record.amount === null ? undefined : Number(record.amount),
      remark: record.remark ?? undefined,
    });
    setModalOpen(true);
  };

  const submitMatter = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const payload = {
        title: values.title.trim(),
        type: values.type,
        status: values.status,
        parentId: values.parentId || null,
        ...(ownerInputMode === "master"
          ? isAdmin && values.ownerId
            ? { ownerId: values.ownerId, ownerName: null }
            : { ownerName: null }
          : { ownerName: values.ownerName?.trim() || null }),
        departmentId: departmentInputMode === "master" ? values.departmentId || null : null,
        departmentName: departmentInputMode === "custom" ? values.departmentName?.trim() || null : null,
        partnerId: partnerInputMode === "master" ? values.partnerId || null : null,
        partnerName: partnerInputMode === "custom" ? values.partnerName?.trim() || null : null,
        startDate: values.startDate || null,
        endDate: values.endDate || null,
        amount: values.amount ?? null,
        remark: values.remark?.trim() || null,
      };
      const saved = editingMatter
        ? await updateBusinessMatter(editingMatter.id, payload)
        : await createBusinessMatter(payload);
      message.success(editingMatter ? "事项已更新" : "事项已创建");
      resetModal();
      await loadMatters();
      await openDetail(saved);
    } catch (error) {
      if (error && typeof error === "object" && "errorFields" in error) {
        return;
      }
      message.error(`事项保存失败：${formatApiError(error)}`);
    } finally {
      setSubmitting(false);
    }
  };

  const removeMatter = (record: BusinessMatterRecord) => {
    setDeletingMatter(record);
  };

  const confirmRemoveMatter = async () => {
    if (!deletingMatter) {
      return;
    }
    setDeleteSubmitting(true);
    try {
      await deleteBusinessMatter(deletingMatter.id);
      if (selectedMatter?.id === deletingMatter.id) {
        setSelectedMatter(null);
      }
      setAllMatters((items) => items.filter((item) => item.id !== deletingMatter.id));
      setDeletingMatter(null);
      message.success("事项已删除");
      await loadMatters();
      setWorkflowRevision((value) => value + 1);
    } catch (error) {
      message.error(`事项删除失败：${formatApiError(error)}`);
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const loadAvailableDocuments = async () => {
    setAttachLoading(true);
    try {
      const items: DocumentRecord[] = [];
      let currentPage = 1;
      let totalPages = 1;
      while (currentPage <= totalPages) {
        const result = await listDocuments({
          page: currentPage,
          pageSize: 100,
          sortBy: "updatedAt",
          sortOrder: "desc",
        });
        items.push(...result.items);
        totalPages = result.pagination.totalPages || 1;
        currentPage += 1;
      }
      setAvailableDocuments(items);
    } catch (error) {
      message.error(`文件列表加载失败：${formatApiError(error)}`);
    } finally {
      setAttachLoading(false);
    }
  };

  const openAttach = () => {
    if (!selectedMatter) {
      return;
    }
    setAttachKeyword("");
    setAttachCategoryPath([]);
    setSelectedDocumentIds([]);
    setAttachOpen(true);
    void loadAvailableDocuments();
  };

  const submitAttach = async () => {
    if (!selectedMatter || !selectedDocumentIds.length) {
      return;
    }
    setAttachSubmitting(true);
    try {
      await attachBusinessMatterDocuments(selectedMatter.id, { documentIds: selectedDocumentIds });
      message.success(`已关联 ${selectedDocumentIds.length} 份文件`);
      setAttachOpen(false);
      setSelectedMatter(await getBusinessMatter(selectedMatter.id));
    } catch (error) {
      message.error(`文件关联失败：${formatApiError(error)}`);
    } finally {
      setAttachSubmitting(false);
    }
  };

  const detachDocument = (document: DocumentRecord) => {
    if (!selectedMatter) {
      return;
    }
    setDetachingDocument(document);
  };

  const confirmDetachDocument = async () => {
    if (!selectedMatter || !detachingDocument) {
      return;
    }
    const matterId = selectedMatter.id;
    setDetachSubmitting(true);
    try {
      await detachBusinessMatterDocument(matterId, detachingDocument.id);
      setSelectedMatter(await getBusinessMatter(matterId));
      setDetachingDocument(null);
      message.success("文件关联已取消");
    } catch (error) {
      message.error(`取消关联失败：${formatApiError(error)}`);
    } finally {
      setDetachSubmitting(false);
    }
  };

  const parentOptions = useMemo(
    () =>
      allMatters
        .filter((item) => item.id !== editingMatter?.id)
        .map((item) => ({ label: `${item.title}（${item.matterNo}）`, value: item.id })),
    [allMatters, editingMatter],
  );

  const linkedDocumentIds = new Set(selectedMatter?.documents.map((item) => item.documentId) ?? []);
  const filteredDocuments = availableDocuments.filter((document) => {
    if (linkedDocumentIds.has(document.id)) {
      return false;
    }
    const query = attachKeyword.trim().toLocaleLowerCase("zh-CN");
    if (!query) {
      return matchesDocumentCategory(document, attachCategoryPath);
    }
    return matchesDocumentCategory(document, attachCategoryPath) && [document.title, document.documentNo, document.currentVersion?.originalFileName ?? ""]
      .join(" ")
      .toLocaleLowerCase("zh-CN")
      .includes(query);
  });

  const columns: ColumnsType<BusinessMatterRecord> = [
    {
      title: "事项名称",
      dataIndex: "title",
      render: (value: string, record) => (
        <div className="business-matter-title-cell">
          <Typography.Text strong ellipsis={{ tooltip: value }}>
            {value}
          </Typography.Text>
          <Typography.Text type="secondary">{record.matterNo}</Typography.Text>
        </div>
      ),
    },
    { title: "类型", dataIndex: "type", width: 92, render: (value: BusinessMatterType) => <Tag>{typeLabels[value]}</Tag> },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (value: BusinessMatterStatus) => <Tag color={statusColors[value]}>{statusLabels[value]}</Tag>,
    },
    {
      title: "进度",
      width: 150,
      render: (_, record) => record.progressSummary ? (
        <Space direction="vertical" size={2} className="full-width-control">
          <Progress percent={record.progressSummary.progress} size="small" status={record.progressSummary.health === "DELAYED" ? "exception" : record.progressSummary.health === "COMPLETED" ? "success" : "active"} />
          <Typography.Text type="secondary">{record.progressSummary.progress}%</Typography.Text>
        </Space>
      ) : <Typography.Text type="secondary">-</Typography.Text>,
    },
    {
      title: "健康度",
      width: 100,
      render: (_, record) => record.progressSummary ? <Tag color={healthColors[record.progressSummary.health]}>{healthLabels[record.progressSummary.health]}</Tag> : "-",
    },
    {
      title: "负责人",
      dataIndex: "owner",
      width: 120,
      render: (_owner: BusinessMatterRecord["owner"], record) => record.ownerName || record.owner?.realName || record.owner?.username || "-",
    },
    {
      title: "关联文件",
      dataIndex: "_count",
      width: 100,
      render: (count: BusinessMatterRecord["_count"]) => `${count?.documents ?? 0} 份`,
    },
    {
      title: "最近更新",
      dataIndex: "updatedAt",
      width: 160,
      render: (value: string) => formatDate(value),
    },
    {
      title: "操作",
      width: 180,
      render: (_, record) => (
        <Space size={4}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => void openDetail(record)}>
            查看
          </Button>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
            编辑
          </Button>
          <Button
            size="small"
            danger
            title="删除事项"
            aria-label="删除事项"
            icon={<DeleteOutlined />}
            onClick={() => removeMatter(record)}
          />
        </Space>
      ),
    },
  ];

  const documentColumns: ColumnsType<DocumentRecord> = [
    {
      title: "文件名称",
      dataIndex: "title",
      render: (value: string, record) => (
        <Button type="link" className="business-matter-document-link" onClick={() => onOpenDocument(record)}>
          <FileTextOutlined /> {value}
        </Button>
      ),
    },
    { title: "文件编号", dataIndex: "documentNo", width: 150 },
    {
      title: "当前版本",
      width: 120,
      render: (_, record) => record.currentVersion?.versionLabel ?? "-",
    },
    {
      title: "来源分类",
      width: 180,
      render: (_, record) => getDocumentCategoryPathText(record),
    },
  ];

  return (
    <div className="page-stack business-matters-page">
      <section className="page-band">
        <div className="page-band-header">
          <div>
            <Typography.Title level={2} className="page-title">
              项目与事项
            </Typography.Title>
            <Typography.Paragraph className="page-lead">
              把项目、合同、借款和报销与文件放在同一个业务事项下，文件分类和业务关联彼此独立。
            </Typography.Paragraph>
          </div>
          <Space wrap>
            <Button icon={<ReloadOutlined />} onClick={() => void loadMatters()}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              新建事项
            </Button>
          </Space>
        </div>
        <Space wrap className="business-matter-filters">
          <Input.Search
            allowClear
            className="business-matter-search"
            placeholder="搜索事项名称、编号或备注"
            value={keyword}
            onChange={(event) => {
              setKeyword(event.target.value);
              setPage(1);
            }}
          />
          <Select
            allowClear
            className="filter-select"
            placeholder="全部类型"
            value={type}
            onChange={(value) => {
              setType(value);
              setPage(1);
            }}
            options={Object.entries(typeLabels).map(([value, label]) => ({ value, label }))}
          />
          <Select
            allowClear
            className="filter-select"
            placeholder="全部状态"
            value={status}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
            options={Object.entries(statusLabels).map(([value, label]) => ({ value, label }))}
          />
          <Typography.Text type="secondary">共 {total} 个事项</Typography.Text>
        </Space>
      </section>

      <BusinessWorkflowOverviewPanel revision={workflowRevision} />
      <BusinessResponsibilityReportPanel currentUser={currentUser} users={users} />

      <section className="page-band">
        <Table
          rowKey="id"
          loading={loading}
          dataSource={records}
          columns={columns}
          pagination={{
            current: page,
            pageSize: 20,
            total,
            showSizeChanger: false,
            onChange: (nextPage) => setPage(nextPage),
          }}
          locale={{ emptyText: <Empty description="暂无项目或事项" /> }}
        />
      </section>

      <Modal
        title={editingMatter ? "编辑事项" : "新建事项"}
        open={modalOpen}
        width={720}
        confirmLoading={submitting}
        okText="保存"
        cancelText="取消"
        onOk={() => void submitMatter()}
        onCancel={resetModal}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="事项名称" rules={[{ required: true, message: "请输入事项名称" }]}>
            <Input maxLength={200} placeholder="例如：2026 年市场推广项目" />
          </Form.Item>
          <div className="business-matter-form-grid">
            <Form.Item name="type" label="事项类型" rules={[{ required: true, message: "请选择事项类型" }]}>
              <Select options={Object.entries(typeLabels).map(([value, label]) => ({ value, label }))} />
            </Form.Item>
            <Form.Item name="status" label="状态" rules={[{ required: true, message: "请选择状态" }]}>
              <Select options={Object.entries(statusLabels).map(([value, label]) => ({ value, label }))} />
            </Form.Item>
          </div>
          <Form.Item name="parentId" label="上级事项">
            <Select allowClear showSearch optionFilterProp="label" options={parentOptions} placeholder="可选，不填表示顶级事项" />
          </Form.Item>
          <div className="business-matter-reference-grid">
            <div className="business-matter-reference-cell">
              <Typography.Text strong>负责人</Typography.Text>
              <Segmented
                block
                value={ownerInputMode}
                options={[{ label: "系统用户", value: "master" }, { label: "自定义输入", value: "custom" }]}
                onChange={(value) => {
                  const next = value as ReferenceInputMode;
                  setOwnerInputMode(next);
                  form.setFieldsValue(next === "custom" ? { ownerId: undefined } : { ownerName: undefined });
                }}
              />
              {ownerInputMode === "custom" ? (
                <Form.Item name="ownerName" rules={[{ required: true, message: "请输入负责人名称" }]}>
                  <Input maxLength={200} placeholder="例如：张三或外部项目负责人" />
                </Form.Item>
              ) : isAdmin ? (
                <Form.Item name="ownerId">
                  <Select
                    showSearch
                    optionFilterProp="label"
                    options={users.map((item) => ({ label: `${item.realName}（${item.username}）`, value: item.id }))}
                  />
                </Form.Item>
              ) : (
                <Input disabled value={editingMatter?.owner?.realName || currentUser.realName} />
              )}
              <Typography.Text type="secondary">自定义负责人只改变业务展示名称，系统权限仍按内部账号判断。</Typography.Text>
            </div>
            <div className="business-matter-reference-cell">
              <Typography.Text strong>所属部门</Typography.Text>
              <Segmented
                block
                value={departmentInputMode}
                options={[{ label: "标准部门", value: "master" }, { label: "自定义输入", value: "custom" }]}
                onChange={(value) => {
                  const next = value as ReferenceInputMode;
                  setDepartmentInputMode(next);
                  form.setFieldsValue(next === "custom" ? { departmentId: undefined } : { departmentName: undefined });
                }}
              />
              {departmentInputMode === "custom" ? (
                <Form.Item name="departmentName" rules={[{ required: true, message: "请输入部门名称" }]}>
                  <Input maxLength={200} placeholder="例如：临时项目组" />
                </Form.Item>
              ) : (
                <Form.Item name="departmentId">
                  <Select allowClear showSearch optionFilterProp="label" options={departments.map((item) => ({ label: item.name, value: item.id }))} />
                </Form.Item>
              )}
              <Typography.Text type="secondary">自定义名称仅记录在当前事项，不会修改部门主数据。</Typography.Text>
            </div>
            <div className="business-matter-reference-cell">
              <Typography.Text strong>合作单位</Typography.Text>
              <Segmented
                block
                value={partnerInputMode}
                options={[{ label: "标准单位", value: "master" }, { label: "自定义输入", value: "custom" }]}
                onChange={(value) => {
                  const next = value as ReferenceInputMode;
                  setPartnerInputMode(next);
                  form.setFieldsValue(next === "custom" ? { partnerId: undefined } : { partnerName: undefined });
                }}
              />
              {partnerInputMode === "custom" ? (
                <Form.Item name="partnerName" rules={[{ required: true, message: "请输入合作单位名称" }]}>
                  <Input maxLength={200} placeholder="例如：某某供应商或待定单位" />
                </Form.Item>
              ) : (
                <Form.Item name="partnerId">
                  <Select allowClear showSearch optionFilterProp="label" options={partners.map((item) => ({ label: item.companyName, value: item.id }))} />
                </Form.Item>
              )}
              <Typography.Text type="secondary">自定义名称仅记录在当前事项，不会新增合作单位主数据。</Typography.Text>
            </div>
          </div>
          <div className="business-matter-form-grid">
            <Form.Item name="startDate" label="开始日期">
              <Input type="date" />
            </Form.Item>
            <Form.Item name="endDate" label="结束日期">
              <Input type="date" />
            </Form.Item>
            <Form.Item name="amount" label="事项金额">
              <InputNumber min={0} precision={2} className="full-width-control" addonAfter="元" />
            </Form.Item>
          </div>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={3} maxLength={2000} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="删除事项"
        open={Boolean(deletingMatter)}
        okText="删除事项"
        cancelText="取消"
        okButtonProps={{ danger: true }}
        cancelButtonProps={{ disabled: deleteSubmitting }}
        confirmLoading={deleteSubmitting}
        onOk={() => void confirmRemoveMatter()}
        onCancel={() => {
          if (!deleteSubmitting) {
            setDeletingMatter(null);
          }
        }}
        destroyOnHidden
      >
        <Typography.Paragraph>
          确认将“{deletingMatter?.title}”移入回收状态吗？关联文件和文件历史版本不会被删除。
        </Typography.Paragraph>
      </Modal>

      <Modal
        title="取消文件关联"
        open={Boolean(detachingDocument)}
        okText="取消关联"
        cancelText="保留关联"
        confirmLoading={detachSubmitting}
        cancelButtonProps={{ disabled: detachSubmitting }}
        onOk={() => void confirmDetachDocument()}
        onCancel={() => {
          if (!detachSubmitting) {
            setDetachingDocument(null);
          }
        }}
        destroyOnHidden
      >
        <Typography.Paragraph>
          确认取消“{detachingDocument?.title}”与当前事项的关联吗？源文件不会被删除。
        </Typography.Paragraph>
      </Modal>

      <Drawer
        title={selectedMatter ? `${selectedMatter.title} · 事项详情` : "事项详情"}
        open={Boolean(selectedMatter)}
        width={760}
        onClose={() => setSelectedMatter(null)}
      >
        {detailLoading || !selectedMatter ? (
          <div className="loading-state">
            <Spin />
          </div>
        ) : (
          <div className="business-matter-detail-stack">
            <div className="business-matter-detail-actions">
              <Space>
                <Button icon={<EditOutlined />} onClick={() => openEdit(selectedMatter)}>
                  编辑事项
                </Button>
                <Button type="primary" icon={<LinkOutlined />} onClick={openAttach}>
                  关联文件
                </Button>
              </Space>
            </div>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="事项编号">{selectedMatter.matterNo}</Descriptions.Item>
              <Descriptions.Item label="事项类型">{typeLabels[selectedMatter.type]}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={statusColors[selectedMatter.status]}>{statusLabels[selectedMatter.status]}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="负责人">
                {selectedMatter.ownerName || selectedMatter.owner?.realName || selectedMatter.owner?.username || "-"}
              </Descriptions.Item>
              <Descriptions.Item label="所属部门">{selectedMatter.departmentName || selectedMatter.department?.name || "-"}</Descriptions.Item>
              <Descriptions.Item label="合作单位">{selectedMatter.partnerName || selectedMatter.partner?.companyName || "-"}</Descriptions.Item>
              <Descriptions.Item label="开始日期">{formatDateOnly(selectedMatter.startDate)}</Descriptions.Item>
              <Descriptions.Item label="结束日期">{formatDateOnly(selectedMatter.endDate)}</Descriptions.Item>
              <Descriptions.Item label="事项金额">{formatAmount(selectedMatter.amount)}</Descriptions.Item>
              <Descriptions.Item label="创建时间">{formatDate(selectedMatter.createdAt)}</Descriptions.Item>
              <Descriptions.Item label="备注" span={2}>
                {selectedMatter.remark || "-"}
              </Descriptions.Item>
            </Descriptions>

            <section>
              <div className="business-matter-section-heading">
                <Typography.Title level={4}>上下级事项</Typography.Title>
                <Typography.Text type="secondary">
                  上级：{selectedMatter.parent?.title || "顶级事项"} · 子事项 {selectedMatter.children.length} 个
                </Typography.Text>
              </div>
              {selectedMatter.children.length ? (
                <List
                  size="small"
                  bordered
                  dataSource={selectedMatter.children}
                  renderItem={(child) => (
                    <List.Item>
                      <Space>
                        <Typography.Text strong>{child.title}</Typography.Text>
                        <Tag>{typeLabels[child.type]}</Tag>
                        <Tag color={statusColors[child.status]}>{statusLabels[child.status]}</Tag>
                      </Space>
                    </List.Item>
                  )}
                />
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无子事项" />
              )}
            </section>

            <section>
              <div className="business-matter-section-heading">
                <Typography.Title level={4}>关联文件</Typography.Title>
                <Typography.Text type="secondary">{selectedMatter.documents.length} 份文件</Typography.Text>
              </div>
              {selectedMatter.documents.length ? (
                <List
                  bordered
                  dataSource={selectedMatter.documents}
                  renderItem={(link) => (
                    <List.Item
                      actions={[
                        <Button key="view" type="link" onClick={() => onOpenDocument(link.document)}>
                          查看详情
                        </Button>,
                        <Button key="detach" type="link" danger onClick={() => detachDocument(link.document)}>
                          取消关联
                        </Button>,
                      ]}
                    >
                      <List.Item.Meta
                        avatar={<FileTextOutlined />}
                        title={link.document.title}
                        description={`${link.document.documentNo} · ${link.document.currentVersion?.versionLabel ?? "无版本信息"} · 来源：${getDocumentCategoryPathText(link.document)}`}
                      />
                    </List.Item>
                  )}
                />
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂未关联文件" />
              )}
            </section>

            <BusinessWorkflowPanel
              matter={selectedMatter}
              currentUser={currentUser}
              users={users}
              categories={categories}
              onOpenDocument={onOpenDocument}
              projectPlan={selectedProjectPlan}
              onChanged={() => void refreshSelectedProject()}
            />
            <BusinessProjectPlanPanel
              matterId={selectedMatter.id}
              plan={selectedProjectPlan}
              users={users}
              currentUser={currentUser}
              onChanged={() => void refreshSelectedProject()}
            />
            <BusinessIssuesPanel
              matter={selectedMatter}
              currentUser={currentUser}
              users={users}
              categories={categories}
              onOpenDocument={onOpenDocument}
              onChanged={() => void refreshSelectedProject()}
            />
          </div>
        )}
      </Drawer>

      <Modal
        title="关联文件"
        open={attachOpen}
        width={840}
        okText={`关联 ${selectedDocumentIds.length || ""} 份文件`}
        cancelText="取消"
        confirmLoading={attachSubmitting}
        okButtonProps={{ disabled: !selectedDocumentIds.length }}
        onOk={() => void submitAttach()}
        onCancel={() => setAttachOpen(false)}
        destroyOnHidden
      >
        <Space direction="vertical" size={12} className="full-width-control">
          <Input.Search allowClear placeholder="搜索文件名称、编号" value={attachKeyword} onChange={(event) => setAttachKeyword(event.target.value)} />
          <Cascader
            allowClear
            className="full-width-control"
            options={toCategoryOptions(categories)}
            value={attachCategoryPath}
            onChange={(value) => setAttachCategoryPath(value as string[])}
            placeholder="按现有分类筛选"
            changeOnSelect
          />
          <Typography.Text type="secondary">已隐藏当前事项已经关联的文件，文件不会被复制。</Typography.Text>
          <Table
            rowKey="id"
            size="small"
            loading={attachLoading}
            dataSource={filteredDocuments}
            columns={documentColumns}
            rowSelection={{
              selectedRowKeys: selectedDocumentIds,
              onChange: (keys) => setSelectedDocumentIds(keys.map(String)),
            }}
            pagination={{ pageSize: 8, showSizeChanger: false }}
            scroll={{ y: 420 }}
            locale={{ emptyText: <Empty description="暂无可关联文件" /> }}
          />
        </Space>
      </Modal>
    </div>
  );
}

interface BusinessCategoryOption {
  value: string;
  label: string;
  children?: BusinessCategoryOption[];
}

function toCategoryOptions(nodes: CategoryNode[]): BusinessCategoryOption[] {
  return nodes.map((node) => ({
    value: node.id,
    label: node.name,
    children: node.children?.length ? toCategoryOptions(node.children) : undefined,
  }));
}

function matchesDocumentCategory(document: DocumentRecord, path: string[]) {
  if (!path.length) {
    return true;
  }
  const selectedId = path[path.length - 1];
  return path.length === 1
    ? document.categoryId === selectedId
    : document.subcategoryId === selectedId;
}

function getDocumentCategoryPathText(document: DocumentRecord) {
  if (document.category?.name && document.subcategory?.name) {
    return `${document.category.name} / ${document.subcategory.name}`;
  }
  return document.category?.name || document.subcategory?.name || "未分类";
}

function formatDate(value?: string | null) {
  if (!value) {
    return "-";
  }
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatDateOnly(value?: string | null) {
  if (!value) {
    return "-";
  }
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(new Date(value));
}

function formatAmount(value?: string | null) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  return `${Number(value).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 元`;
}
