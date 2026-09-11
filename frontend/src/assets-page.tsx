import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  DatabaseOutlined,
  EyeOutlined,
  ReloadOutlined,
  SearchOutlined,
  SwapOutlined,
} from "@ant-design/icons";
import {
  Alert,
  Button,
  Col,
  Descriptions,
  Drawer,
  Empty,
  Input,
  Pagination,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useState } from "react";

import {
  formatApiError,
  getAsset,
  getAssetOverview,
  listAssetLocations,
  listAssets,
  listAssetTypes,
} from "./api";
import type {
  AssetListQuery,
  AssetLocationRecord,
  AssetOverview,
  AssetRecord,
  AssetResourceStatus,
  AssetStatus,
  AssetTypeRecord,
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
};

const resourceStatusMeta: Record<AssetResourceStatus, { label: string; color: string }> = {
  available: { label: "可用", color: "blue" },
  reserved: { label: "已预约", color: "gold" },
  borrowed: { label: "已借出", color: "purple" },
  transferring: { label: "调拨中", color: "cyan" },
  unavailable: { label: "不可用", color: "red" },
  return_pending: { label: "待确认归还", color: "orange" },
};

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

export function AssetsPage() {
  const [records, setRecords] = useState<AssetRecord[]>([]);
  const [overview, setOverview] = useState<AssetOverview>(emptyOverview);
  const [assetTypes, setAssetTypes] = useState<AssetTypeRecord[]>([]);
  const [locations, setLocations] = useState<AssetLocationRecord[]>([]);
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

  useEffect(() => {
    let cancelled = false;
    Promise.all([listAssetTypes(), listAssetLocations()])
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
    () => assetTypes.map((item) => ({ label: item.name, value: item.id })),
    [assetTypes],
  );
  const locationOptions = useMemo(
    () => locations.map((item) => ({ label: item.name, value: item.id })),
    [locations],
  );

  const openDetail = async (record: AssetRecord) => {
    setDetail(record);
    setDetailLoading(true);
    try {
      setDetail(await getAsset(record.id));
    } catch (error) {
      message.error(`资产详情加载失败：${formatApiError(error)}`);
    } finally {
      setDetailLoading(false);
    }
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
      width: 70,
      align: "center",
      render: (_, record) => (
        <Button
          type="text"
          icon={<EyeOutlined />}
          aria-label={`查看${record.name}`}
          title="查看详情"
          onClick={() => void openDetail(record)}
        />
      ),
    },
  ];

  const customFields = detail?.assetType.fieldSchema ?? [];

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
        <Button
          icon={<ReloadOutlined />}
          loading={loading}
          onClick={() => setRefreshVersion((value) => value + 1)}
        >
          刷新
        </Button>
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
              <Typography.Title level={5}>资产识别码</Typography.Title>
              <Space size={[6, 6]} wrap>
                {detail.identifiers?.length ? (
                  detail.identifiers.map((identifier) => (
                    <Tag key={identifier.id} color={identifier.isPrimary ? "blue" : "default"}>
                      {identifier.identifierType.toUpperCase()} · {identifier.value}
                    </Tag>
                  ))
                ) : (
                  <Typography.Text type="secondary">暂无识别码</Typography.Text>
                )}
              </Space>
            </div>
            <div>
              <Typography.Title level={5}>备注</Typography.Title>
              <Typography.Paragraph>{detail.description || "暂无备注"}</Typography.Paragraph>
            </div>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
