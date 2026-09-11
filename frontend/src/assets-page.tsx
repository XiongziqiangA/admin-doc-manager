import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  FileTextOutlined,
  LinkOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  SettingOutlined,
  SwapOutlined,
} from "@ant-design/icons";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Col,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  List,
  Modal,
  Pagination,
  Row,
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
  formatApiError,
  confirmPendingAsset,
  attachAssetDocuments,
  createAsset,
  createAssetIdentifier,
  createAssetLocation,
  createAssetType,
  createPendingAsset,
  disableAssetLocation,
  deleteAssetIdentifier,
  getAsset,
  getAssetOverview,
  listAssetEvents,
  detachAssetDocument,
  listDocuments,
  listBusinessMatters,
  listAssetLocations,
  listPendingAssets,
  listAssets,
  listAssetTypes,
  listUsers,
  updateAsset,
  updateAssetIdentifier,
  updateAssetLocation,
  updateAssetType,
} from "./api";
import type {
  AssetFieldDefinition,
  AssetEventRecord,
  AssetIdentifierRecord,
  AssetDocumentLink,
  AssetListQuery,
  AssetLocationRecord,
  AssetOverview,
  AssetPendingRecord,
  AssetRecord,
  AssetResourceStatus,
  AssetStatus,
  AssetTypeRecord,
  BusinessMatterRecord,
  DepartmentRecord,
  DocumentRecord,
  PublicUser,
  UserRecord,
} from "./types";

const emptyOverview: AssetOverview = {
  total: 0,
  active: 0,
  available: 0,
  borrowed: 0,
  pending: 0,
};

const assetStatusMeta: Record<AssetStatus, { label: string; color: string }> = {
  active: { label: "在用", color: "green" },
  pending: { label: "待确认", color: "gold" },
  unavailable: { label: "不可用", color: "red" },
  archived: { label: "已归档", color: "default" },
  scrapped: { label: "已报废", color: "default" },
  lost: { label: "已遗失", color: "red" },
  sold: { label: "已出售", color: "default" },
  transferred: { label: "已转出", color: "default" },
  donated: { label: "已捐赠", color: "default" },
};

const resourceStatusMeta: Record<AssetResourceStatus, { label: string; color: string }> = {
  available: { label: "可用", color: "blue" },
  reserved: { label: "已预约", color: "gold" },
  borrowed: { label: "已借出", color: "purple" },
  transferring: { label: "调拨中", color: "cyan" },
  unavailable: { label: "不可用", color: "red" },
  return_pending: { label: "待确认归还", color: "orange" },
  maintenance: { label: "维修中", color: "volcano" },
  exit_pending: { label: "退出待审批", color: "magenta" },
  retired: { label: "已退出", color: "default" },
};

const editableAssetStatuses: AssetStatus[] = ["active", "pending", "unavailable", "archived"];
const editableResourceStatuses: AssetResourceStatus[] = ["available", "reserved", "unavailable"];

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatMoney(value?: string | null) {
  if (!value) return "-";
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function formatCustomValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

async function listAllProjects() {
  const projects: BusinessMatterRecord[] = [];
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages) {
    const result = await listBusinessMatters({
      page,
      pageSize: 100,
      type: "PROJECT",
      sortBy: "title",
      sortOrder: "asc",
    });
    projects.push(...result.items);
    totalPages = result.pagination.totalPages || 1;
    page += 1;
  }
  return projects;
}

interface AssetsPageProps {
  currentUser: PublicUser;
  departments: DepartmentRecord[];
  onOpenDocument: (document: DocumentRecord) => void | Promise<void>;
}

type AssetFormValues = {
  assetTypeId: string;
  name: string;
  assetCode?: string;
  departmentId?: string;
  locationId?: string;
  businessMatterId?: string;
  ownerUserId?: string;
  usingUserId?: string;
  brand?: string;
  model?: string;
  serialNumber?: string;
  supplier?: string;
  purchaseDate?: string;
  purchaseAmount?: number;
  assetStatus?: AssetStatus;
  resourceStatus?: AssetResourceStatus;
  customFields?: Record<string, string | number | boolean | null | undefined>;
  description?: string;
  reviewNote?: string;
};

export function AssetsPage({ currentUser, departments, onOpenDocument }: AssetsPageProps) {
  const isAdmin = currentUser.role === "ADMIN";
  const [records, setRecords] = useState<AssetRecord[]>([]);
  const [overview, setOverview] = useState<AssetOverview>(emptyOverview);
  const [assetTypes, setAssetTypes] = useState<AssetTypeRecord[]>([]);
  const [locations, setLocations] = useState<AssetLocationRecord[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [projects, setProjects] = useState<BusinessMatterRecord[]>([]);
  const [pendingRecords, setPendingRecords] = useState<AssetPendingRecord[]>([]);
  const [query, setQuery] = useState<AssetListQuery>({
    page: 1,
    pageSize: 20,
    sortBy: "updatedAt",
    sortOrder: "desc",
  });
  const [keyword, setKeyword] = useState("");
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [detail, setDetail] = useState<AssetRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [assetEvents, setAssetEvents] = useState<AssetEventRecord[]>([]);
  const [assetFormOpen, setAssetFormOpen] = useState(false);
  const [assetFormMode, setAssetFormMode] = useState<"create" | "edit" | "pending">("create");
  const [editingAsset, setEditingAsset] = useState<AssetRecord | null>(null);
  const [pendingTarget, setPendingTarget] = useState<AssetPendingRecord | null>(null);
  const [masterDataOpen, setMasterDataOpen] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [relatedDataVersion, setRelatedDataVersion] = useState(0);
  const [identifierModalOpen, setIdentifierModalOpen] = useState(false);
  const [editingIdentifier, setEditingIdentifier] = useState<AssetIdentifierRecord | null>(null);
  const [identifierForm] = Form.useForm();
  const [documentAttachOpen, setDocumentAttachOpen] = useState(false);
  const [documentAttachLoading, setDocumentAttachLoading] = useState(false);
  const [documentAttachSubmitting, setDocumentAttachSubmitting] = useState(false);
  const [availableDocuments, setAvailableDocuments] = useState<DocumentRecord[]>([]);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [documentAttachKeyword, setDocumentAttachKeyword] = useState("");
  const [documentAttachPage, setDocumentAttachPage] = useState(1);
  const [documentAttachTotal, setDocumentAttachTotal] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listAssetTypes(true), listAssetLocations(true)])
      .then(([types, locationRecords]) => {
        if (!cancelled) {
          setAssetTypes(types);
          setLocations(locationRecords);
        }
      })
      .catch((error) => {
        if (!cancelled) message.error(`资产基础数据加载失败：${formatApiError(error)}`);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshVersion]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      isAdmin ? listUsers().then((result) => result.items) : Promise.resolve([currentUser]),
      listAllProjects(),
      isAdmin ? listPendingAssets() : Promise.resolve([]),
    ])
      .then(([userRecords, projectRecords, pendingResult]) => {
        if (!cancelled) {
          setUsers(userRecords);
          setProjects(projectRecords);
          setPendingRecords(pendingResult);
        }
      })
      .catch((error) => {
        if (!cancelled) message.error(`资产关联数据加载失败：${formatApiError(error)}`);
      });
    return () => {
      cancelled = true;
    };
  }, [currentUser, isAdmin, relatedDataVersion]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    Promise.all([listAssets(query), getAssetOverview()])
      .then(([result, metrics]) => {
        if (!cancelled) {
          setRecords(result.items);
          setTotal(result.pagination.totalItems);
          setOverview(metrics);
        }
      })
      .catch((error) => {
        if (!cancelled) setLoadError(formatApiError(error));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query, refreshVersion]);

  const typeOptions = useMemo(
    () => assetTypes.filter((item) => item.enabled).map((item) => ({ label: item.name, value: item.id })),
    [assetTypes],
  );
  const locationOptions = useMemo(
    () => locations.filter((item) => item.enabled).map((item) => ({ label: item.name, value: item.id })),
    [locations],
  );

  const openDetail = async (record: AssetRecord) => {
    setDetail(record);
    setAssetEvents([]);
    setDetailLoading(true);
    try {
      const [assetDetail, eventResult] = await Promise.all([
        getAsset(record.id),
        listAssetEvents(record.id, 1, 50),
      ]);
      setDetail(assetDetail);
      setAssetEvents(eventResult.items);
    } catch (error) {
      message.error(`资产详情加载失败：${formatApiError(error)}`);
    } finally {
      setDetailLoading(false);
    }
  };

  const reload = () => {
    setRefreshVersion((value) => value + 1);
    setRelatedDataVersion((value) => value + 1);
  };

  const openCreate = () => {
    setEditingAsset(null);
    setPendingTarget(null);
    setAssetFormMode("create");
    setAssetFormOpen(true);
  };

  const openEmployeeSubmit = () => {
    setEditingAsset(null);
    setPendingTarget(null);
    setAssetFormMode("pending");
    setAssetFormOpen(true);
  };

  const openEdit = (record: AssetRecord) => {
    setEditingAsset(record);
    setPendingTarget(null);
    setAssetFormMode("edit");
    setAssetFormOpen(true);
  };

  const openPending = (record: AssetPendingRecord) => {
    setPendingTarget(record);
    setEditingAsset(null);
    setAssetFormMode("pending");
    setPendingOpen(false);
    setAssetFormOpen(true);
  };

  const submitAsset = async (values: AssetFormValues) => {
    setActionLoading(true);
    try {
      const payload = { ...values, customFields: values.customFields ?? {} };
      if (assetFormMode === "pending") {
        if (pendingTarget) {
          await confirmPendingAsset(pendingTarget.id, payload);
          message.success("待确认资产已入正式台账");
        } else {
          await createPendingAsset({ rawPayload: payload });
          message.success("资产信息已提交，等待管理员确认");
        }
      } else if (editingAsset) {
        await updateAsset(editingAsset.id, { ...payload, version: editingAsset.version });
        message.success("资产台账已更新");
      } else {
        await createAsset(payload);
        message.success("资产已加入正式台账");
      }
      setAssetFormOpen(false);
      setPendingTarget(null);
      setEditingAsset(null);
      reload();
    } catch (error) {
      message.error(`资产保存失败：${formatApiError(error)}`);
    } finally {
      setActionLoading(false);
    }
  };

  const refreshMasterData = async () => {
    const [types, locationRecords] = await Promise.all([listAssetTypes(true), listAssetLocations(true)]);
    setAssetTypes(types);
    setLocations(locationRecords);
  };

  const saveAssetType = async (id: string | null, values: Record<string, unknown>) => {
    setActionLoading(true);
    try {
      if (id) await updateAssetType(id, values);
      else await createAssetType(values);
      message.success(id ? "资产类型已更新" : "资产类型已创建");
      await refreshMasterData();
    } finally {
      setActionLoading(false);
    }
  };

  const saveAssetLocation = async (id: string | null, values: Record<string, unknown>) => {
    setActionLoading(true);
    try {
      if (id) await updateAssetLocation(id, values);
      else await createAssetLocation(values);
      message.success(id ? "存放位置已更新" : "存放位置已创建");
      await refreshMasterData();
    } finally {
      setActionLoading(false);
    }
  };

  const removeAssetLocation = async (record: AssetLocationRecord) => {
    Modal.confirm({
      title: "停用存放位置",
      content: `确认停用“${record.name}”？已有资产或启用中的下级位置会阻止停用。`,
      okText: "停用",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await disableAssetLocation(record.id);
          message.success("存放位置已停用");
          await refreshMasterData();
        } catch (error) {
          message.error(`停用失败：${formatApiError(error)}`);
        }
      },
    });
  };

  const openIdentifierModal = (identifier?: AssetIdentifierRecord) => {
    setEditingIdentifier(identifier ?? null);
    identifierForm.resetFields();
    identifierForm.setFieldsValue(identifier ?? { isPrimary: false });
    setIdentifierModalOpen(true);
  };

  const saveIdentifier = async () => {
    if (!detail) return;
    try {
      const values = await identifierForm.validateFields();
      setActionLoading(true);
      if (editingIdentifier) {
        await updateAssetIdentifier(detail.id, editingIdentifier.id, values);
      } else {
        await createAssetIdentifier(detail.id, values);
      }
      message.success(editingIdentifier ? "识别码已更新" : "识别码已新增");
      setIdentifierModalOpen(false);
      await openDetail(detail);
    } catch (error) {
      if (!(error && typeof error === "object" && "errorFields" in error)) {
        message.error(`识别码保存失败：${formatApiError(error)}`);
      }
    } finally {
      setActionLoading(false);
    }
  };

  const removeIdentifier = (identifier: AssetIdentifierRecord) => {
    if (!detail) return;
    Modal.confirm({
      title: "删除识别码",
      content: `确认删除“${identifier.value}”？系统二维码不能删除。`,
      okText: "删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          setActionLoading(true);
          await deleteAssetIdentifier(detail.id, identifier.id);
          message.success("识别码已删除");
          await openDetail(detail);
        } catch (error) {
          message.error(`识别码删除失败：${formatApiError(error)}`);
        } finally {
          setActionLoading(false);
        }
      },
    });
  };

  const loadAvailableDocuments = async (page: number, keyword: string) => {
    setDocumentAttachLoading(true);
    try {
      const result = await listDocuments({
        page,
        pageSize: 8,
        keyword: keyword.trim() || undefined,
        sortBy: "updatedAt",
        sortOrder: "desc",
      });
      setAvailableDocuments(result.items);
      setDocumentAttachTotal(result.pagination.totalItems);
    } catch (error) {
      message.error(`文件列表加载失败：${formatApiError(error)}`);
    } finally {
      setDocumentAttachLoading(false);
    }
  };

  const openDocumentAttach = () => {
    if (!detail) return;
    setDocumentAttachKeyword("");
    setDocumentAttachPage(1);
    setSelectedDocumentIds([]);
    setDocumentAttachOpen(true);
    void loadAvailableDocuments(1, "");
  };

  const submitDocumentAttach = async () => {
    if (!detail || !selectedDocumentIds.length) return;
    setDocumentAttachSubmitting(true);
    try {
      await attachAssetDocuments(detail.id, selectedDocumentIds);
      message.success(`已关联 ${selectedDocumentIds.length} 份文件`);
      setDocumentAttachOpen(false);
      await openDetail(detail);
    } catch (error) {
      message.error(`文件关联失败：${formatApiError(error)}`);
    } finally {
      setDocumentAttachSubmitting(false);
    }
  };

  const removeDocumentLink = (link: AssetDocumentLink) => {
    if (!detail) return;
    Modal.confirm({
      title: "取消文件关联",
      content: `确认取消“${link.document.title}”与该资产的关联？原文件不会被删除。`,
      okText: "取消关联",
      cancelText: "保留关联",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          setActionLoading(true);
          await detachAssetDocument(detail.id, link.documentId);
          message.success("文件关联已取消");
          await openDetail(detail);
        } catch (error) {
          message.error(`取消关联失败：${formatApiError(error)}`);
        } finally {
          setActionLoading(false);
        }
      },
    });
  };

  const columns: ColumnsType<AssetRecord> = [
    {
      title: "资产",
      dataIndex: "name",
      render: (_, record) => (
        <button type="button" className="asset-name-button" onClick={() => void openDetail(record)}>
          <strong>{record.name}</strong>
          <span>{record.assetCode}</span>
        </button>
      ),
    },
    {
      title: "类型",
      dataIndex: ["assetType", "name"],
      width: 128,
      render: (value: string) => value || "-",
    },
    {
      title: "责任与位置",
      width: 190,
      render: (_, record) => (
        <div className="asset-table-stack">
          <span>{record.owner?.realName || record.usingUser?.realName || "未指定责任人"}</span>
          <Typography.Text type="secondary">
            {record.location?.name || record.department?.name || "未指定位置"}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: "状态",
      width: 150,
      render: (_, record) => (
        <Space size={[4, 4]} wrap>
          <Tag color={assetStatusMeta[record.assetStatus]?.color}>
            {assetStatusMeta[record.assetStatus]?.label || record.assetStatus}
          </Tag>
          <Tag color={resourceStatusMeta[record.resourceStatus]?.color}>
            {resourceStatusMeta[record.resourceStatus]?.label || record.resourceStatus}
          </Tag>
        </Space>
      ),
    },
    {
      title: "最近更新",
      dataIndex: "updatedAt",
      width: 150,
      render: formatDate,
    },
    {
      title: "操作",
      width: isAdmin ? 104 : 70,
      align: "center",
      render: (_, record) => (
        <Space size={0}>
          <Button
            type="text"
            icon={<EyeOutlined />}
            aria-label={`查看${record.name}`}
            title="查看详情"
            onClick={() => void openDetail(record)}
          />
          {isAdmin ? (
            <Button
              type="text"
              icon={<EditOutlined />}
              aria-label={`编辑${record.name}`}
              title="编辑资产"
              onClick={() => openEdit(record)}
            />
          ) : null}
        </Space>
      ),
    },
  ];

  const customFields = detail?.assetType.fieldSchema ?? [];
  const linkedDocumentIds = new Set(detail?.documents?.map((item) => item.documentId) ?? []);
  const filteredAvailableDocuments = availableDocuments.filter(
    (document) => !linkedDocumentIds.has(document.id),
  );

  return (
    <div className="page-stack asset-page">
      <div className="asset-page-heading">
        <div>
          <Typography.Title level={2} className="page-title">
            资产设备
          </Typography.Title>
          <Typography.Paragraph className="page-lead">
            统一查看资产档案、责任归属、当前位置和使用状态。
          </Typography.Paragraph>
        </div>
        <Space wrap>
          <Button icon={<ReloadOutlined />} loading={loading} onClick={reload}>
            刷新
          </Button>
          {isAdmin ? (
            <>
              <Button icon={<SettingOutlined />} onClick={() => setMasterDataOpen(true)}>
                基础资料
              </Button>
              <Badge count={overview.pending} size="small">
                <Button icon={<ClockCircleOutlined />} onClick={() => setPendingOpen(true)}>
                  待确认
                </Button>
              </Badge>
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                新增资产
              </Button>
            </>
          ) : (
            <Button type="primary" icon={<PlusOutlined />} onClick={openEmployeeSubmit}>
              提交资产信息
            </Button>
          )}
        </Space>
      </div>

      <Row gutter={[14, 14]}>
        <Col xs={24} sm={12} xl={6}>
          <div className="metric asset-metric">
            <Statistic title="资产总数" value={overview.total} prefix={<DatabaseOutlined />} />
            <Typography.Text type="secondary">正式资产台账</Typography.Text>
          </div>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <div className="metric asset-metric asset-metric-green">
            <Statistic title="在用资产" value={overview.active} prefix={<CheckCircleOutlined />} />
            <Typography.Text type="secondary">当前有效资产</Typography.Text>
          </div>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <div className="metric asset-metric asset-metric-blue">
            <Statistic title="可用资产" value={overview.available} prefix={<SwapOutlined />} />
            <Typography.Text type="secondary">已借出 {overview.borrowed} 项</Typography.Text>
          </div>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <div className="metric asset-metric asset-metric-orange">
            <Statistic title="待确认入库" value={overview.pending} prefix={<ClockCircleOutlined />} />
            <Typography.Text type="secondary">等待管理员确认</Typography.Text>
          </div>
        </Col>
      </Row>

      <section className="page-band asset-register-band">
        <div className="asset-filter-row">
          <Input
            value={keyword}
            prefix={<SearchOutlined />}
            allowClear
            placeholder="搜索资产名称、编号、序列号、品牌或型号"
            onChange={(event) => setKeyword(event.target.value)}
            onPressEnter={() =>
              setQuery((current) => ({ ...current, page: 1, keyword: keyword.trim() || undefined }))
            }
          />
          <Select
            allowClear
            placeholder="全部资产类型"
            options={typeOptions}
            value={query.assetTypeId}
            onChange={(assetTypeId) => setQuery((current) => ({ ...current, page: 1, assetTypeId }))}
          />
          <Select
            allowClear
            placeholder="全部位置"
            options={locationOptions}
            value={query.locationId}
            onChange={(locationId) => setQuery((current) => ({ ...current, page: 1, locationId }))}
          />
          <Select
            allowClear
            placeholder="全部使用状态"
            value={query.resourceStatus}
            options={Object.entries(resourceStatusMeta).map(([value, meta]) => ({
              value,
              label: meta.label,
            }))}
            onChange={(resourceStatus) =>
              setQuery((current) => ({ ...current, page: 1, resourceStatus }))
            }
          />
          <Button
            type="primary"
            icon={<SearchOutlined />}
            onClick={() =>
              setQuery((current) => ({ ...current, page: 1, keyword: keyword.trim() || undefined }))
            }
          >
            查询
          </Button>
        </div>

        {loadError ? <Alert type="error" showIcon message="资产台账加载失败" description={loadError} /> : null}
        <Table<AssetRecord>
          rowKey="id"
          tableLayout="fixed"
          loading={loading}
          columns={columns}
          dataSource={records}
          pagination={false}
          locale={{ emptyText: <Empty description="暂无资产记录" /> }}
          className="asset-register-table"
        />
        <div className="asset-pagination">
          <Typography.Text type="secondary">共 {total} 项资产</Typography.Text>
          <Pagination
            current={query.page}
            pageSize={query.pageSize}
            total={total}
            showSizeChanger
            pageSizeOptions={[20, 50, 100]}
            onChange={(page, pageSize) => setQuery((current) => ({ ...current, page, pageSize }))}
          />
        </div>
      </section>

      <Drawer
        title={detail ? `${detail.name} · ${detail.assetCode}` : "资产详情"}
        open={Boolean(detail)}
        width={720}
        destroyOnClose
        onClose={() => setDetail(null)}
      >
        {detailLoading ? (
          <div className="loading-state">
            <Spin />
          </div>
        ) : detail ? (
          <div className="asset-detail-stack">
            <div className="asset-detail-status">
              <Tag color={assetStatusMeta[detail.assetStatus]?.color}>
                {assetStatusMeta[detail.assetStatus]?.label || detail.assetStatus}
              </Tag>
              <Tag color={resourceStatusMeta[detail.resourceStatus]?.color}>
                {resourceStatusMeta[detail.resourceStatus]?.label || detail.resourceStatus}
              </Tag>
              <Typography.Text type="secondary">数据版本 {detail.version}</Typography.Text>
              {isAdmin && !detail.archivedAt ? (
                <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(detail)}>
                  编辑
                </Button>
              ) : null}
            </div>
            <Descriptions title="基础信息" bordered column={2} size="small">
              <Descriptions.Item label="资产类型">{detail.assetType.name}</Descriptions.Item>
              <Descriptions.Item label="序列号">{detail.serialNumber || "-"}</Descriptions.Item>
              <Descriptions.Item label="品牌">{detail.brand || "-"}</Descriptions.Item>
              <Descriptions.Item label="型号">{detail.model || "-"}</Descriptions.Item>
              <Descriptions.Item label="供应商">{detail.supplier || "-"}</Descriptions.Item>
              <Descriptions.Item label="采购金额">{formatMoney(detail.purchaseAmount)}</Descriptions.Item>
              <Descriptions.Item label="采购日期">{formatDate(detail.purchaseDate)}</Descriptions.Item>
              <Descriptions.Item label="最近更新">{formatDate(detail.updatedAt)}</Descriptions.Item>
            </Descriptions>
            <Descriptions title="责任与归属" bordered column={2} size="small">
              <Descriptions.Item label="责任人">{detail.owner?.realName || "-"}</Descriptions.Item>
              <Descriptions.Item label="使用人">{detail.usingUser?.realName || "-"}</Descriptions.Item>
              <Descriptions.Item label="所属部门">{detail.department?.name || "-"}</Descriptions.Item>
              <Descriptions.Item label="当前位置">{detail.location?.name || "-"}</Descriptions.Item>
            </Descriptions>
            {customFields.length ? (
              <Descriptions title="设备专属信息" bordered column={2} size="small">
                {customFields.map((field) => (
                  <Descriptions.Item key={field.key} label={field.name}>
                    {formatCustomValue(detail.customFields[field.key])}
                  </Descriptions.Item>
                ))}
              </Descriptions>
            ) : null}
            <div>
              <div className="asset-detail-section-heading">
                <Typography.Title level={5}>资产识别码</Typography.Title>
                {isAdmin && !detail.archivedAt ? (
                  <Button size="small" icon={<PlusOutlined />} onClick={() => openIdentifierModal()}>
                    新增识别码
                  </Button>
                ) : null}
              </div>
              <Space size={[6, 6]} wrap>
                {detail.identifiers?.length ? (
                  detail.identifiers.map((identifier) => (
                    <Space key={identifier.id} size={2} className="asset-identifier-item">
                      <Tag color={identifier.isPrimary ? "blue" : "default"}>
                        {identifier.identifierType.toUpperCase()} · {identifier.value}
                      </Tag>
                      {isAdmin && identifier.identifierType !== "qr" ? (
                        <>
                          <Button type="text" size="small" icon={<EditOutlined />} title="编辑识别码" onClick={() => openIdentifierModal(identifier)} />
                          <Button type="text" size="small" danger icon={<DeleteOutlined />} title="删除识别码" onClick={() => removeIdentifier(identifier)} />
                        </>
                      ) : null}
                    </Space>
                  ))
                ) : (
                  <Typography.Text type="secondary">暂无识别码</Typography.Text>
                )}
              </Space>
            </div>
            <div>
              <div className="asset-detail-section-heading">
                <div>
                  <Typography.Title level={5}>关联文件</Typography.Title>
                  <Typography.Text type="secondary">关联行政文件中心中的资料，文件本身不会被复制。</Typography.Text>
                </div>
                {isAdmin && !detail.archivedAt ? (
                  <Button size="small" icon={<LinkOutlined />} onClick={openDocumentAttach}>
                    关联文件
                  </Button>
                ) : null}
              </div>
              {detail.documents?.length ? (
                <List
                  bordered
                  size="small"
                  dataSource={detail.documents}
                  renderItem={(link) => (
                    <List.Item
                      actions={[
                        <Button key="view" type="link" onClick={() => void onOpenDocument(link.document)}>
                          查看详情
                        </Button>,
                        ...(isAdmin ? [
                          <Button key="detach" type="link" danger onClick={() => removeDocumentLink(link)}>
                            取消关联
                          </Button>,
                        ] : []),
                      ]}
                    >
                      <List.Item.Meta
                        avatar={<FileTextOutlined />}
                        title={link.document.title}
                        description={`${link.document.documentNo} · ${link.document.currentVersion?.versionLabel ?? "无版本信息"} · ${link.document.category?.name ?? "未分类"}`}
                      />
                    </List.Item>
                  )}
                />
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂未关联文件" />
              )}
            </div>
            <div>
              <div className="asset-detail-section-heading">
                <Typography.Title level={5}>生命周期记录</Typography.Title>
                <Typography.Text type="secondary">最近 {assetEvents.length} 条</Typography.Text>
              </div>
              {assetEvents.length ? (
                <Timeline
                  items={assetEvents.map((event) => ({
                    color: assetEventColor(event.eventType),
                    children: (
                      <div className="approval-history-item">
                        <Typography.Text strong>{event.summary}</Typography.Text>
                        <Typography.Text type="secondary">
                          {event.actor?.realName || "系统"} · {formatDate(event.createdAt)}
                        </Typography.Text>
                      </div>
                    ),
                  }))}
                />
              ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无生命周期记录" />}
            </div>
            <div>
              <Typography.Title level={5}>备注</Typography.Title>
              <Typography.Paragraph>{detail.description || "暂无备注"}</Typography.Paragraph>
            </div>
          </div>
        ) : null}
      </Drawer>

      <Modal
        title="关联行政文件"
        open={documentAttachOpen}
        width={840}
        okText={`关联 ${selectedDocumentIds.length || ""} 份文件`}
        cancelText="取消"
        confirmLoading={documentAttachSubmitting}
        okButtonProps={{ disabled: !selectedDocumentIds.length }}
        onOk={() => void submitDocumentAttach()}
        onCancel={() => setDocumentAttachOpen(false)}
        destroyOnHidden
      >
        <Space direction="vertical" size={12} className="full-width-control">
          <Input.Search
            allowClear
            placeholder="搜索文件名称、编号"
            value={documentAttachKeyword}
            onChange={(event) => setDocumentAttachKeyword(event.target.value)}
            onSearch={(value) => {
              setDocumentAttachPage(1);
              void loadAvailableDocuments(1, value);
            }}
          />
          <Typography.Text type="secondary">已隐藏当前资产已关联的文件。搜索结果共 {documentAttachTotal} 份。</Typography.Text>
          <Table<DocumentRecord>
            rowKey="id"
            size="small"
            loading={documentAttachLoading}
            dataSource={filteredAvailableDocuments}
            columns={[
              {
                title: "文件名称",
                dataIndex: "title",
                ellipsis: true,
                render: (value: string, record) => (
                  <div className="asset-document-title-cell">
                    <Typography.Text strong ellipsis={{ tooltip: value }}>{value}</Typography.Text>
                    <Typography.Text type="secondary">{record.currentVersion?.originalFileName || record.documentNo}</Typography.Text>
                  </div>
                ),
              },
              { title: "文件编号", dataIndex: "documentNo", width: 150 },
              { title: "版本", width: 110, render: (_, record) => record.currentVersion?.versionLabel || "-" },
              { title: "分类", width: 130, render: (_, record) => record.category?.name || "未分类" },
            ]}
            rowSelection={{
              selectedRowKeys: selectedDocumentIds,
              onChange: (keys) => setSelectedDocumentIds(keys.map(String)),
              preserveSelectedRowKeys: true,
            }}
            pagination={{
              current: documentAttachPage,
              pageSize: 8,
              total: documentAttachTotal,
              showSizeChanger: false,
              onChange: (page) => {
                setDocumentAttachPage(page);
                void loadAvailableDocuments(page, documentAttachKeyword);
              },
            }}
            scroll={{ y: 420 }}
            locale={{ emptyText: <Empty description="暂无可关联文件" /> }}
          />
        </Space>
      </Modal>

      <AssetFormDrawer
        open={assetFormOpen}
        mode={assetFormMode}
        record={editingAsset}
        pendingRecord={pendingTarget}
        isAdmin={isAdmin}
        loading={actionLoading}
        assetTypes={assetTypes}
        locations={locations}
        departments={departments}
        users={users}
        projects={projects}
        onClose={() => {
          setAssetFormOpen(false);
          setEditingAsset(null);
          setPendingTarget(null);
        }}
        onSubmit={submitAsset}
      />

      <PendingAssetsDrawer
        open={pendingOpen}
        loading={loading}
        records={pendingRecords}
        onClose={() => setPendingOpen(false)}
        onConfirm={openPending}
      />

      <AssetMasterDataDrawer
        open={masterDataOpen}
        loading={actionLoading}
        assetTypes={assetTypes}
        locations={locations}
        onClose={() => setMasterDataOpen(false)}
        onSaveType={saveAssetType}
        onSaveLocation={saveAssetLocation}
        onDisableLocation={removeAssetLocation}
      />

      <Modal
        title={editingIdentifier ? "编辑识别码" : "新增识别码"}
        open={identifierModalOpen}
        onOk={() => void saveIdentifier()}
        onCancel={() => setIdentifierModalOpen(false)}
        confirmLoading={actionLoading}
        okText="保存"
        cancelText="取消"
        forceRender
      >
        <Form form={identifierForm} layout="vertical">
          <Form.Item
            name="identifierType"
            label="识别码类型"
            rules={[
              { required: true, message: "请输入识别码类型" },
              { pattern: /^[A-Za-z0-9_-]+$/, message: "只能使用字母、数字、下划线和短横线" },
            ]}
          >
            <Input maxLength={50} disabled={Boolean(editingIdentifier)} placeholder="例如 RFID、label" />
          </Form.Item>
          <Form.Item name="value" label="识别码值" rules={[{ required: true, message: "请输入识别码值" }]}>
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item name="isPrimary" valuePropName="checked">
            <Checkbox>设为此类型的主识别码</Checkbox>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

function assetEventColor(eventType: string) {
  if (eventType.includes("rejected") || eventType.includes("cancelled")) return "gray";
  if (eventType.includes("anomaly") || eventType.includes("missing")) return "red";
  if (eventType.includes("completed") || eventType.includes("returned")) return "green";
  return "blue";
}

function AssetFormDrawer({
  open,
  mode,
  record,
  pendingRecord,
  isAdmin,
  loading,
  assetTypes,
  locations,
  departments,
  users,
  projects,
  onClose,
  onSubmit,
}: {
  open: boolean;
  mode: "create" | "edit" | "pending";
  record: AssetRecord | null;
  pendingRecord: AssetPendingRecord | null;
  isAdmin: boolean;
  loading: boolean;
  assetTypes: AssetTypeRecord[];
  locations: AssetLocationRecord[];
  departments: DepartmentRecord[];
  users: UserRecord[];
  projects: BusinessMatterRecord[];
  onClose: () => void;
  onSubmit: (values: AssetFormValues) => Promise<void>;
}) {
  const [form] = Form.useForm<AssetFormValues>();
  const selectedTypeId = Form.useWatch("assetTypeId", form);
  const selectedType = assetTypes.find((item) => item.id === selectedTypeId);
  const initialValues = useMemo<Partial<AssetFormValues>>(() => {
    if (record) {
      return {
        assetTypeId: record.assetTypeId,
        name: record.name,
        assetCode: record.assetCode,
        departmentId: record.departmentId ?? undefined,
        locationId: record.locationId ?? undefined,
        businessMatterId: record.businessMatterId ?? undefined,
        ownerUserId: record.ownerUserId ?? undefined,
        usingUserId: record.usingUserId ?? undefined,
        brand: record.brand ?? undefined,
        model: record.model ?? undefined,
        serialNumber: record.serialNumber ?? undefined,
        supplier: record.supplier ?? undefined,
        purchaseDate: record.purchaseDate?.slice(0, 10),
        purchaseAmount: record.purchaseAmount ? Number(record.purchaseAmount) : undefined,
        assetStatus: record.assetStatus,
        resourceStatus: record.resourceStatus,
        customFields: record.customFields as AssetFormValues["customFields"],
        description: record.description ?? undefined,
      } as Partial<AssetFormValues>;
    }
    if (pendingRecord) {
      return {
        ...(pendingRecord.rawPayload as Partial<AssetFormValues>),
        ...(pendingRecord.aiFields as Partial<AssetFormValues> | null),
      };
    }
    return { assetStatus: "active", resourceStatus: "available", customFields: {} };
  }, [pendingRecord, record]);

  const title = pendingRecord
    ? "确认资产入库"
    : mode === "edit"
      ? "编辑资产台账"
      : isAdmin
        ? "新增资产"
        : "提交资产信息";

  useEffect(() => {
    if (open) {
      form.resetFields();
      form.setFieldsValue(initialValues);
    }
  }, [form, initialValues, open]);

  return (
    <Drawer
      title={title}
      open={open}
      width={780}
      forceRender
      onClose={onClose}
      extra={
        <Button type="primary" loading={loading} onClick={() => form.submit()}>
          {pendingRecord ? "确认入库" : mode === "pending" ? "提交" : "保存"}
        </Button>
      }
    >
      <Form
        key={record?.id ?? pendingRecord?.id ?? `${mode}-new`}
        form={form}
        layout="vertical"
        initialValues={initialValues}
        onFinish={(values) => void onSubmit(values)}
      >
        {mode === "pending" && !pendingRecord ? (
          <Alert
            className="asset-form-alert"
            type="info"
            showIcon
            message="提交后由管理员确认，确认前不会进入正式资产台账。"
          />
        ) : null}
        {pendingRecord?.duplicateCandidates?.length ? (
          <Alert
            className="asset-form-alert"
            type="warning"
            showIcon
            message={`系统发现 ${pendingRecord.duplicateCandidates.length} 条可能重复的资产，请核对后再确认。`}
          />
        ) : null}

        <Typography.Title level={5}>资产信息</Typography.Title>
        <Row gutter={12}>
          <Col xs={24} md={12}>
            <Form.Item name="assetTypeId" label="资产类型" rules={[{ required: true, message: "请选择资产类型" }]}>
              <Select
                showSearch
                optionFilterProp="label"
                placeholder="请选择资产类型"
                options={assetTypes
                  .filter((item) => item.enabled || item.id === record?.assetTypeId)
                  .map((item) => ({ label: item.name, value: item.id }))}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="name" label="资产名称" rules={[{ required: true, message: "请输入资产名称" }]}>
              <Input maxLength={200} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="assetCode" label="资产编号" extra="留空时由系统自动生成">
              <Input maxLength={100} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="serialNumber" label="序列号">
              <Input maxLength={100} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="brand" label="品牌">
              <Input maxLength={100} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="model" label="型号">
              <Input maxLength={100} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="supplier" label="供应商">
              <Input maxLength={200} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="purchaseDate" label="采购日期">
              <Input type="date" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="purchaseAmount" label="采购金额">
              <InputNumber min={0} precision={2} addonAfter="元" className="full-width-control" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="locationId" label="当前位置">
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                options={locations.filter((item) => item.enabled).map((item) => ({ label: item.name, value: item.id }))}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="departmentId" label="所属部门">
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                options={departments.map((item) => ({ label: item.name, value: item.id }))}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="businessMatterId" label="关联项目">
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                options={projects.map((item) => ({
                  label: `${item.title} · ${item.matterNo}`,
                  value: item.id,
                }))}
              />
            </Form.Item>
          </Col>
        </Row>

        {isAdmin ? (
          <>
            <Typography.Title level={5}>责任与状态</Typography.Title>
            <Row gutter={12}>
              <Col xs={24} md={12}>
                <Form.Item name="ownerUserId" label="责任人">
                  <Select
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    options={users.map((item) => ({ label: item.realName || item.username, value: item.id }))}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="usingUserId" label="使用人">
                  <Select
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    options={users.map((item) => ({ label: item.realName || item.username, value: item.id }))}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="assetStatus" label="资产状态">
                  <Select options={editableAssetStatuses.map((value) => ({ value, label: assetStatusMeta[value].label }))} />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="resourceStatus" label="使用状态">
                  <Select options={editableResourceStatuses.map((value) => ({ value, label: resourceStatusMeta[value].label }))} />
                </Form.Item>
              </Col>
            </Row>
          </>
        ) : null}

        {selectedType?.fieldSchema.length ? (
          <>
            <Typography.Title level={5}>设备专属信息</Typography.Title>
            <Row gutter={12}>
              {selectedType.fieldSchema.map((field) => (
                <Col xs={24} md={12} key={field.key}>
                  <CustomFieldControl field={field} />
                </Col>
              ))}
            </Row>
          </>
        ) : null}

        <Form.Item name="description" label="备注">
          <Input.TextArea rows={3} maxLength={2000} />
        </Form.Item>
        {pendingRecord ? (
          <Form.Item name="reviewNote" label="确认说明">
            <Input.TextArea rows={2} maxLength={1000} />
          </Form.Item>
        ) : null}
      </Form>
    </Drawer>
  );
}

function CustomFieldControl({ field }: { field: AssetFieldDefinition }) {
  const rules = field.required ? [{ required: true, message: `请填写${field.name}` }] : undefined;
  if (field.type === "boolean") {
    return (
      <Form.Item name={["customFields", field.key]} valuePropName="checked">
        <Checkbox>{field.name}</Checkbox>
      </Form.Item>
    );
  }
  return (
    <Form.Item name={["customFields", field.key]} label={field.name} rules={rules}>
      {field.type === "number" ? (
        <InputNumber className="full-width-control" />
      ) : field.type === "date" ? (
        <Input type="date" />
      ) : field.type === "select" ? (
        <Select options={(field.options ?? []).map((option) => ({ label: option, value: option }))} />
      ) : (
        <Input maxLength={500} />
      )}
    </Form.Item>
  );
}

function PendingAssetsDrawer({
  open,
  loading,
  records,
  onClose,
  onConfirm,
}: {
  open: boolean;
  loading: boolean;
  records: AssetPendingRecord[];
  onClose: () => void;
  onConfirm: (record: AssetPendingRecord) => void;
}) {
  const columns: ColumnsType<AssetPendingRecord> = [
    {
      title: "资产名称",
      render: (_, record) =>
        String(record.aiFields?.name || record.rawPayload?.name || "未填写名称"),
    },
    {
      title: "提交人",
      width: 120,
      render: (_, record) => record.submittedBy?.realName || "-",
    },
    {
      title: "提交时间",
      dataIndex: "createdAt",
      width: 160,
      render: formatDate,
    },
    {
      title: "疑似重复",
      width: 100,
      render: (_, record) => record.duplicateCandidates?.length ?? 0,
    },
    {
      title: "操作",
      width: 90,
      render: (_, record) => (
        <Button type="link" onClick={() => onConfirm(record)}>
          核对入库
        </Button>
      ),
    },
  ];
  return (
    <Drawer title="待确认资产" open={open} width={760} onClose={onClose} destroyOnHidden>
      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={records}
        pagination={{ pageSize: 20 }}
        tableLayout="fixed"
        locale={{ emptyText: <Empty description="暂无待确认资产" /> }}
      />
    </Drawer>
  );
}

function AssetMasterDataDrawer({
  open,
  loading,
  assetTypes,
  locations,
  onClose,
  onSaveType,
  onSaveLocation,
  onDisableLocation,
}: {
  open: boolean;
  loading: boolean;
  assetTypes: AssetTypeRecord[];
  locations: AssetLocationRecord[];
  onClose: () => void;
  onSaveType: (id: string | null, values: Record<string, unknown>) => Promise<void>;
  onSaveLocation: (id: string | null, values: Record<string, unknown>) => Promise<void>;
  onDisableLocation: (record: AssetLocationRecord) => Promise<void>;
}) {
  return (
    <Drawer title="资产基础资料" open={open} width={860} onClose={onClose} destroyOnHidden>
      <Tabs
        items={[
          {
            key: "types",
            label: "资产类型",
            children: (
              <AssetTypeManager records={assetTypes} loading={loading} onSave={onSaveType} />
            ),
          },
          {
            key: "locations",
            label: "存放位置",
            children: (
              <AssetLocationManager
                records={locations}
                loading={loading}
                onSave={onSaveLocation}
                onDisable={onDisableLocation}
              />
            ),
          },
        ]}
      />
    </Drawer>
  );
}

function AssetTypeManager({
  records,
  loading,
  onSave,
}: {
  records: AssetTypeRecord[];
  loading: boolean;
  onSave: (id: string | null, values: Record<string, unknown>) => Promise<void>;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AssetTypeRecord | null>(null);
  const [form] = Form.useForm();

  const openModal = (record?: AssetTypeRecord) => {
    setEditing(record ?? null);
    form.resetFields();
    form.setFieldsValue(
      record
        ? {
            ...record,
            fieldSchema: record.fieldSchema.map((field) => ({
              ...field,
              optionsText: field.options?.join(", "),
            })),
          }
        : { fieldSchema: [] },
    );
    setModalOpen(true);
  };

  const submit = async () => {
    try {
      const values = await form.validateFields();
      const fieldSchema = (values.fieldSchema ?? []).map(
        (field: AssetFieldDefinition & { optionsText?: string }) => ({
          key: field.key,
          name: field.name,
          type: field.type,
          required: Boolean(field.required),
          ...(field.type === "select"
            ? {
                options: (field.optionsText ?? "")
                  .split(/[,，]/)
                  .map((item) => item.trim())
                  .filter(Boolean),
              }
            : {}),
        }),
      );
      await onSave(editing?.id ?? null, { ...values, fieldSchema });
      setModalOpen(false);
    } catch (error) {
      if (!(error && typeof error === "object" && "errorFields" in error)) {
        message.error(`保存失败：${formatApiError(error)}`);
      }
    }
  };

  const columns: ColumnsType<AssetTypeRecord> = [
    { title: "类型名称", dataIndex: "name" },
    { title: "编码", dataIndex: "code", width: 120 },
    {
      title: "上级类型",
      dataIndex: "parentId",
      render: (value) => records.find((item) => item.id === value)?.name || "-",
    },
    {
      title: "专属字段",
      render: (_, record) => record.fieldSchema.length,
      width: 90,
    },
    {
      title: "状态",
      dataIndex: "enabled",
      width: 80,
      render: (value) => (value ? <Tag color="green">启用</Tag> : <Tag>停用</Tag>),
    },
    {
      title: "操作",
      width: 150,
      render: (_, record) => (
        <Space size={4}>
          <Button type="text" icon={<EditOutlined />} title="编辑" onClick={() => openModal(record)} />
          <Button
            type="link"
            danger={record.enabled}
            onClick={() => void onSave(record.id, { enabled: !record.enabled }).catch((error) => message.error(formatApiError(error)))}
          >
            {record.enabled ? "停用" : "启用"}
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <>
      <div className="asset-master-toolbar">
        <Typography.Text type="secondary">类型可定义不同设备的专属字段。</Typography.Text>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
          新增类型
        </Button>
      </div>
      <Table rowKey="id" loading={loading} columns={columns} dataSource={records} pagination={false} tableLayout="fixed" />
      <Modal
        title={editing ? "编辑资产类型" : "新增资产类型"}
        open={modalOpen}
        onOk={() => void submit()}
        onCancel={() => setModalOpen(false)}
        confirmLoading={loading}
        okText="保存"
        cancelText="取消"
        width={760}
        forceRender
      >
        <Form form={form} layout="vertical">
          <Row gutter={12}>
            <Col xs={24} md={12}>
              <Form.Item name="name" label="类型名称" rules={[{ required: true, message: "请输入类型名称" }]}>
                <Input maxLength={100} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="code"
                label="类型编码"
                rules={[
                  { required: true, message: "请输入类型编码" },
                  { pattern: /^[A-Za-z0-9_-]+$/, message: "只能使用字母、数字、下划线和短横线" },
                ]}
              >
                <Input maxLength={50} disabled={Boolean(editing)} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="parentId" label="上级类型">
            <Select
              allowClear
              options={records
                .filter((item) => item.id !== editing?.id && item.enabled)
                .map((item) => ({ label: item.name, value: item.id }))}
            />
          </Form.Item>
          <Typography.Title level={5}>设备专属字段</Typography.Title>
          <Form.List name="fieldSchema">
            {(fields, { add, remove }) => (
              <div className="asset-field-list">
                {fields.map(({ key, name }) => (
                  <div className="asset-field-row" key={key}>
                    <Form.Item name={[name, "name"]} rules={[{ required: true, message: "填写名称" }]}>
                      <Input placeholder="字段名称" maxLength={100} />
                    </Form.Item>
                    <Form.Item
                      name={[name, "key"]}
                      rules={[
                        { required: true, message: "填写字段键" },
                        { pattern: /^[A-Za-z][A-Za-z0-9_]*$/, message: "字母开头，仅字母数字下划线" },
                      ]}
                    >
                      <Input placeholder="字段键，如 cpuModel" maxLength={50} disabled={Boolean(editing)} />
                    </Form.Item>
                    <Form.Item name={[name, "type"]} rules={[{ required: true, message: "选择类型" }]}>
                      <Select
                        placeholder="字段类型"
                        options={[
                          { label: "文本", value: "text" },
                          { label: "数字", value: "number" },
                          { label: "日期", value: "date" },
                          { label: "选项", value: "select" },
                          { label: "是/否", value: "boolean" },
                        ]}
                      />
                    </Form.Item>
                    <Form.Item name={[name, "optionsText"]}>
                      <Input placeholder="选项用逗号分隔" />
                    </Form.Item>
                    <Form.Item name={[name, "required"]} valuePropName="checked">
                      <Checkbox>必填</Checkbox>
                    </Form.Item>
                    <Button type="text" danger icon={<DeleteOutlined />} title="删除字段" onClick={() => remove(name)} />
                  </div>
                ))}
                <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ type: "text", required: false })}>
                  新增专属字段
                </Button>
              </div>
            )}
          </Form.List>
        </Form>
      </Modal>
    </>
  );
}

function AssetLocationManager({
  records,
  loading,
  onSave,
  onDisable,
}: {
  records: AssetLocationRecord[];
  loading: boolean;
  onSave: (id: string | null, values: Record<string, unknown>) => Promise<void>;
  onDisable: (record: AssetLocationRecord) => Promise<void>;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AssetLocationRecord | null>(null);
  const [form] = Form.useForm();

  const openModal = (record?: AssetLocationRecord) => {
    setEditing(record ?? null);
    form.resetFields();
    form.setFieldsValue(record ?? {});
    setModalOpen(true);
  };
  const submit = async () => {
    try {
      const values = await form.validateFields();
      await onSave(editing?.id ?? null, values);
      setModalOpen(false);
    } catch (error) {
      if (!(error && typeof error === "object" && "errorFields" in error)) {
        message.error(`保存失败：${formatApiError(error)}`);
      }
    }
  };
  const columns: ColumnsType<AssetLocationRecord> = [
    { title: "位置名称", dataIndex: "name" },
    { title: "编码", dataIndex: "code", width: 120 },
    {
      title: "上级位置",
      dataIndex: "parentId",
      render: (value) => records.find((item) => item.id === value)?.name || "-",
    },
    {
      title: "状态",
      dataIndex: "enabled",
      width: 80,
      render: (value) => (value ? <Tag color="green">启用</Tag> : <Tag>停用</Tag>),
    },
    {
      title: "操作",
      width: 160,
      render: (_, record) => (
        <Space size={4}>
          <Button type="text" icon={<EditOutlined />} title="编辑" onClick={() => openModal(record)} />
          {record.enabled ? (
            <Button type="link" danger onClick={() => void onDisable(record)}>
              停用
            </Button>
          ) : (
            <Button type="link" onClick={() => void onSave(record.id, { enabled: true }).catch((error) => message.error(formatApiError(error)))}>
              启用
            </Button>
          )}
        </Space>
      ),
    },
  ];
  return (
    <>
      <div className="asset-master-toolbar">
        <Typography.Text type="secondary">按办公地点、库房或楼层维护树形位置。</Typography.Text>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
          新增位置
        </Button>
      </div>
      <Table rowKey="id" loading={loading} columns={columns} dataSource={records} pagination={false} tableLayout="fixed" />
      <Modal
        title={editing ? "编辑存放位置" : "新增存放位置"}
        open={modalOpen}
        onOk={() => void submit()}
        onCancel={() => setModalOpen(false)}
        confirmLoading={loading}
        okText="保存"
        cancelText="取消"
        forceRender
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="位置名称" rules={[{ required: true, message: "请输入位置名称" }]}>
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item
            name="code"
            label="位置编码"
            rules={[
              { required: true, message: "请输入位置编码" },
              { pattern: /^[A-Za-z0-9_-]+$/, message: "只能使用字母、数字、下划线和短横线" },
            ]}
          >
            <Input maxLength={50} disabled={Boolean(editing)} />
          </Form.Item>
          <Form.Item name="parentId" label="上级位置">
            <Select
              allowClear
              options={records
                .filter((item) => item.id !== editing?.id && item.enabled)
                .map((item) => ({ label: item.name, value: item.id }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
