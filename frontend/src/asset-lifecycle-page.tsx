import {
  AlertOutlined,
  CheckCircleOutlined,
  CloseOutlined,
  EyeOutlined,
  FileDoneOutlined,
  PlusOutlined,
  ReloadOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import {
  Alert,
  Button,
  Descriptions,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Pagination,
  Progress,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  assignAssetAnomaly,
  cancelAssetExit,
  cancelAssetInventoryTask,
  cancelAssetMaintenance,
  completeAssetInventoryTask,
  completeAssetMaintenance,
  createAssetAnomaly,
  createAssetExit,
  createAssetInventoryTask,
  createAssetMaintenance,
  formatApiError,
  getAssetInventoryTask,
  listAssetAnomalies,
  listAssetExits,
  listAssetInventoryTasks,
  listAssetLocations,
  listAssetMaintenance,
  listAssets,
  listAssetTypes,
  listBusinessMatters,
  listUsers,
  recordAssetInventory,
  resolveAssetAnomaly,
  startAssetMaintenance,
} from "./api";
import type {
  AssetAnomalyRecord,
  AssetAnomalySeverity,
  AssetAnomalyType,
  AssetExitRecord,
  AssetExitType,
  AssetInventoryRecord,
  AssetInventoryScopeType,
  AssetInventoryTaskRecord,
  AssetLocationRecord,
  AssetMaintenanceRecord,
  AssetMaintenanceType,
  AssetRecord,
  AssetTypeRecord,
  BusinessMatterRecord,
  DepartmentRecord,
  PublicUser,
  UserRecord,
} from "./types";

interface AssetLifecyclePageProps {
  currentUser: PublicUser;
  departments: DepartmentRecord[];
}

type LifecycleTab = "inventory" | "maintenance" | "anomalies" | "exits";

const inventoryStatusMeta = {
  OPEN: ["进行中", "processing"],
  COMPLETED: ["已完成", "success"],
  CANCELLED: ["已取消", "default"],
} as const;
const maintenanceStatusMeta = {
  SCHEDULED: ["待开始", "gold"],
  IN_PROGRESS: ["维修中", "processing"],
  COMPLETED: ["已完成", "success"],
  CANCELLED: ["已取消", "default"],
} as const;
const anomalyStatusMeta = { OPEN: ["待处理", "error"], RESOLVED: ["已处理", "success"] } as const;
const exitStatusMeta = {
  PENDING: ["待审批", "processing"],
  APPROVED: ["已通过", "success"],
  REJECTED: ["已驳回", "error"],
  CANCELLED: ["已取消", "default"],
} as const;
const maintenanceTypeLabel: Record<AssetMaintenanceType, string> = {
  REPAIR: "故障维修",
  MAINTENANCE: "定期保养",
  INSPECTION: "设备巡检",
};
const anomalyTypeLabel: Record<AssetAnomalyType, string> = {
  SURPLUS: "盘盈",
  MISSING: "盘亏",
  LOCATION_MISMATCH: "位置不符",
  STATUS_MISMATCH: "状态不符",
  OWNER_MISMATCH: "责任人不符",
  DAMAGE: "设备损坏",
  OTHER: "其他异常",
};
const severityMeta: Record<AssetAnomalySeverity, readonly [string, string]> = {
  LOW: ["低", "default"],
  MEDIUM: ["中", "gold"],
  HIGH: ["高", "orange"],
  CRITICAL: ["紧急", "red"],
};
const exitTypeLabel: Record<AssetExitType, string> = {
  SCRAPPED: "报废",
  LOST: "遗失",
  SOLD: "出售",
  TRANSFERRED: "转出",
  DONATED: "捐赠",
  CROSS_COMPANY_TRANSFER: "跨公司调拨",
};
const scopeTypeLabel: Record<AssetInventoryScopeType, string> = {
  ORGANIZATION: "全公司",
  DEPARTMENT: "按部门",
  LOCATION: "按位置",
  PROJECT: "按项目",
  ASSET_TYPE: "按资产类型",
  ASSET_LIST: "指定资产",
};
const inventoryResultLabel = {
  NORMAL: "正常",
  SURPLUS: "盘盈",
  MISSING: "盘亏",
  LOCATION_MISMATCH: "位置不符",
  STATUS_MISMATCH: "状态不符",
  OWNER_MISMATCH: "责任人不符",
} as const;

export function AssetLifecyclePage({ currentUser, departments }: AssetLifecyclePageProps) {
  const isAdmin = currentUser.role === "ADMIN";
  const [tab, setTab] = useState<LifecycleTab>("inventory");
  const [pages, setPages] = useState<Record<LifecycleTab, number>>({ inventory: 1, maintenance: 1, anomalies: 1, exits: 1 });
  const [totals, setTotals] = useState<Record<LifecycleTab, number>>({ inventory: 0, maintenance: 0, anomalies: 0, exits: 0 });
  const [inventoryTasks, setInventoryTasks] = useState<AssetInventoryTaskRecord[]>([]);
  const [maintenance, setMaintenance] = useState<AssetMaintenanceRecord[]>([]);
  const [anomalies, setAnomalies] = useState<AssetAnomalyRecord[]>([]);
  const [exits, setExits] = useState<AssetExitRecord[]>([]);
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [users, setUsers] = useState<UserRecord[]>(isAdmin ? [] : [currentUser]);
  const [locations, setLocations] = useState<AssetLocationRecord[]>([]);
  const [assetTypes, setAssetTypes] = useState<AssetTypeRecord[]>([]);
  const [projects, setProjects] = useState<BusinessMatterRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [createMode, setCreateMode] = useState<LifecycleTab | null>(null);
  const [inventoryDetail, setInventoryDetail] = useState<AssetInventoryTaskRecord | null>(null);
  const [inventoryRecordOpen, setInventoryRecordOpen] = useState(false);
  const [maintenanceAction, setMaintenanceAction] = useState<{ record: AssetMaintenanceRecord; action: "complete" | "cancel" } | null>(null);
  const [anomalyAction, setAnomalyAction] = useState<{ record: AssetAnomalyRecord; action: "assign" | "resolve" } | null>(null);
  const [inventoryForm] = Form.useForm();
  const [inventoryRecordForm] = Form.useForm();
  const [maintenanceForm] = Form.useForm();
  const [maintenanceActionForm] = Form.useForm();
  const [anomalyForm] = Form.useForm();
  const [anomalyActionForm] = Form.useForm();
  const [exitForm] = Form.useForm();
  const inventoryScope = Form.useWatch("scopeType", inventoryForm) as AssetInventoryScopeType | undefined;

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const page = pages[tab];
      if (tab === "inventory") {
        const result = await listAssetInventoryTasks({ page, pageSize: 20 });
        setInventoryTasks(result.items);
        setTotals((current) => ({ ...current, inventory: result.pagination.totalItems }));
      } else if (tab === "maintenance") {
        const result = await listAssetMaintenance({ page, pageSize: 20 });
        setMaintenance(result.items);
        setTotals((current) => ({ ...current, maintenance: result.pagination.totalItems }));
      } else if (tab === "anomalies") {
        const result = await listAssetAnomalies({ page, pageSize: 20 });
        setAnomalies(result.items);
        setTotals((current) => ({ ...current, anomalies: result.pagination.totalItems }));
      } else {
        const result = await listAssetExits({ page, pageSize: 20 });
        setExits(result.items);
        setTotals((current) => ({ ...current, exits: result.pagination.totalItems }));
      }
    } catch (loadError) {
      setError(formatApiError(loadError));
    } finally {
      setLoading(false);
    }
  }, [pages, tab]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    Promise.all([
      listAssets({ page: 1, pageSize: 100, sortBy: "name", sortOrder: "asc" }),
      listAssetLocations(),
      listAssetTypes(),
      isAdmin ? listUsers() : Promise.resolve({ items: [currentUser] }),
      isAdmin ? listBusinessMatters({ page: 1, pageSize: 100, type: "PROJECT", sortBy: "title", sortOrder: "asc" }) : Promise.resolve({ items: [] }),
    ])
      .then(([assetResult, locationResult, typeResult, userResult, projectResult]) => {
        setAssets(assetResult.items);
        setLocations(locationResult);
        setAssetTypes(typeResult);
        setUsers(userResult.items);
        setProjects(projectResult.items);
      })
      .catch((loadError) => message.error(`资产基础数据加载失败：${formatApiError(loadError)}`));
  }, [currentUser, isAdmin]);

  const assetOptions = useMemo(
    () => assets.map((asset) => ({ value: asset.id, label: `${asset.name} · ${asset.assetCode}` })),
    [assets],
  );
  const userOptions = useMemo(
    () => users.filter((user) => user.status === "ACTIVE").map((user) => ({ value: user.id, label: `${user.realName} · ${user.username}` })),
    [users],
  );

  const openCreate = () => {
    setCreateMode(tab);
    if (tab === "inventory") {
      inventoryForm.resetFields();
      inventoryForm.setFieldsValue({ scopeType: "ORGANIZATION", ownerId: currentUser.id });
    } else if (tab === "maintenance") {
      maintenanceForm.resetFields();
      maintenanceForm.setFieldsValue({ maintenanceType: "REPAIR" });
    } else if (tab === "anomalies") {
      anomalyForm.resetFields();
      anomalyForm.setFieldsValue({ severity: "MEDIUM", type: "DAMAGE" });
    } else {
      exitForm.resetFields();
      exitForm.setFieldsValue({ exitType: "SCRAPPED" });
    }
  };

  const submitCreate = async () => {
    setSubmitting(true);
    try {
      if (createMode === "inventory") {
        const values = await inventoryForm.validateFields();
        await createAssetInventoryTask({ ...values, plannedStart: toIso(values.plannedStart), plannedEnd: toIso(values.plannedEnd) });
        message.success("盘点任务已创建");
      } else if (createMode === "maintenance") {
        const values = await maintenanceForm.validateFields();
        await createAssetMaintenance({ ...values, plannedAt: values.plannedAt ? toIso(values.plannedAt) : undefined });
        message.success("维修保养计划已登记");
      } else if (createMode === "anomalies") {
        await createAssetAnomaly(await anomalyForm.validateFields());
        message.success("资产异常已登记");
      } else if (createMode === "exits") {
        await createAssetExit(await exitForm.validateFields());
        message.success(isAdmin ? "资产退出已办理并归档" : "资产退出申请已提交");
      }
      setCreateMode(null);
      await loadData();
    } catch (submitError) {
      if (!isFormValidationError(submitError)) message.error(`保存失败：${formatApiError(submitError)}`);
    } finally {
      setSubmitting(false);
    }
  };

  const openInventoryDetail = async (record: AssetInventoryTaskRecord) => {
    setLoading(true);
    try {
      setInventoryDetail(await getAssetInventoryTask(record.id));
    } catch (loadError) {
      message.error(`盘点详情加载失败：${formatApiError(loadError)}`);
    } finally {
      setLoading(false);
    }
  };

  const submitInventoryRecord = async () => {
    if (!inventoryDetail) return;
    setSubmitting(true);
    try {
      await recordAssetInventory(inventoryDetail.id, await inventoryRecordForm.validateFields());
      message.success("实盘结果已登记");
      setInventoryRecordOpen(false);
      setInventoryDetail(await getAssetInventoryTask(inventoryDetail.id));
      await loadData();
    } catch (submitError) {
      if (!isFormValidationError(submitError)) message.error(`登记失败：${formatApiError(submitError)}`);
    } finally {
      setSubmitting(false);
    }
  };

  const finishInventory = (record: AssetInventoryTaskRecord) => {
    Modal.confirm({
      title: "完成盘点任务",
      content: "完成后，范围内尚未登记的资产会自动生成盘亏异常。确认继续？",
      okText: "完成盘点",
      cancelText: "继续盘点",
      onOk: async () => {
        try {
          await completeAssetInventoryTask(record.id);
          message.success("盘点任务已完成，差异已进入异常台账");
          setInventoryDetail(null);
          await loadData();
        } catch (actionError) {
          message.error(`完成失败：${formatApiError(actionError)}`);
        }
      },
    });
  };

  const cancelInventory = (record: AssetInventoryTaskRecord) => {
    confirmReason("取消盘点任务", "取消原因", async (reason) => {
      await cancelAssetInventoryTask(record.id, reason);
      message.success("盘点任务已取消");
      await loadData();
    });
  };

  const startMaintenance = async (record: AssetMaintenanceRecord) => {
    try {
      await startAssetMaintenance(record.id);
      message.success("资产已进入维修状态");
      await loadData();
    } catch (actionError) {
      message.error(`开始维修失败：${formatApiError(actionError)}`);
    }
  };

  const openMaintenanceAction = (record: AssetMaintenanceRecord, action: "complete" | "cancel") => {
    maintenanceActionForm.resetFields();
    if (action === "complete") maintenanceActionForm.setFieldsValue({ cost: record.cost ? Number(record.cost) : undefined });
    setMaintenanceAction({ record, action });
  };

  const submitMaintenanceAction = async () => {
    if (!maintenanceAction) return;
    setSubmitting(true);
    try {
      const values = await maintenanceActionForm.validateFields();
      if (maintenanceAction.action === "complete") {
        await completeAssetMaintenance(maintenanceAction.record.id, values);
        message.success("维修保养已完成，资产状态已恢复");
      } else {
        await cancelAssetMaintenance(maintenanceAction.record.id, values.reason);
        message.success("维修保养已取消");
      }
      setMaintenanceAction(null);
      await loadData();
    } catch (actionError) {
      if (!isFormValidationError(actionError)) message.error(`操作失败：${formatApiError(actionError)}`);
    } finally {
      setSubmitting(false);
    }
  };

  const openAnomalyAction = (record: AssetAnomalyRecord, action: "assign" | "resolve") => {
    anomalyActionForm.resetFields();
    if (action === "assign") anomalyActionForm.setFieldsValue({ assignedToId: record.assignedToId });
    setAnomalyAction({ record, action });
  };

  const submitAnomalyAction = async () => {
    if (!anomalyAction) return;
    setSubmitting(true);
    try {
      const values = await anomalyActionForm.validateFields();
      if (anomalyAction.action === "assign") {
        await assignAssetAnomaly(anomalyAction.record.id, values.assignedToId ?? null);
        message.success("异常负责人已更新");
      } else {
        await resolveAssetAnomaly(anomalyAction.record.id, values.resolution);
        message.success("异常已处理");
      }
      setAnomalyAction(null);
      await loadData();
    } catch (actionError) {
      if (!isFormValidationError(actionError)) message.error(`操作失败：${formatApiError(actionError)}`);
    } finally {
      setSubmitting(false);
    }
  };

  const cancelExit = (record: AssetExitRecord) => {
    confirmReason("取消资产退出申请", "取消原因", async (reason) => {
      await cancelAssetExit(record.id, reason);
      message.success("资产退出申请已取消");
      await loadData();
    });
  };

  const inventoryColumns: ColumnsType<AssetInventoryTaskRecord> = [
    {
      title: "盘点任务",
      width: "28%",
      render: (_, record) => <Cell title={record.name} secondary={scopeLabel(record)} />,
    },
    { title: "负责人", width: "14%", render: (_, record) => record.owner.realName },
    {
      title: "进度",
      width: "16%",
      render: (_, record) => <Cell title={`已登记 ${record._count.records} 项`} secondary={record.status === "OPEN" ? "等待完成盘点" : "任务已结束"} />,
    },
    { title: "计划时间", width: "22%", render: (_, record) => <TimeRange start={record.plannedStart} end={record.plannedEnd} /> },
    { title: "状态", width: "10%", render: (_, record) => <Tag color={inventoryStatusMeta[record.status][1]}>{inventoryStatusMeta[record.status][0]}</Tag> },
    {
      title: "操作",
      width: "18%",
      render: (_, record) => (
        <Space size={2} wrap>
          <Button type="text" icon={<EyeOutlined />} title="查看盘点详情" onClick={() => void openInventoryDetail(record)} />
          {record.status === "OPEN" && (isAdmin || record.ownerId === currentUser.id) ? <Button type="link" onClick={() => void openInventoryDetail(record)}>登记</Button> : null}
          {isAdmin && record.status === "OPEN" ? <Button type="link" onClick={() => finishInventory(record)}>完成</Button> : null}
          {isAdmin && record.status === "OPEN" ? <Button type="link" danger onClick={() => cancelInventory(record)}>取消</Button> : null}
        </Space>
      ),
    },
  ];

  const maintenanceColumns: ColumnsType<AssetMaintenanceRecord> = [
    { title: "资产", width: "20%", render: (_, record) => <Cell title={record.asset.name} secondary={record.asset.assetCode} /> },
    { title: "维修事项", width: "27%", render: (_, record) => <Cell title={record.title} secondary={`${maintenanceTypeLabel[record.maintenanceType]}${record.vendor ? ` · ${record.vendor}` : ""}`} /> },
    { title: "计划时间", width: "16%", render: (_, record) => formatDateTime(record.plannedAt) },
    { title: "状态", width: "11%", render: (_, record) => <Tag color={maintenanceStatusMeta[record.status][1]}>{maintenanceStatusMeta[record.status][0]}</Tag> },
    {
      title: "操作",
      width: "26%",
      render: (_, record) => isAdmin ? (
        <Space size={2} wrap>
          {record.status === "SCHEDULED" ? <Button type="link" onClick={() => void startMaintenance(record)}>开始维修</Button> : null}
          {record.status === "IN_PROGRESS" ? <Button type="link" onClick={() => openMaintenanceAction(record, "complete")}>完成</Button> : null}
          {["SCHEDULED", "IN_PROGRESS"].includes(record.status) ? <Button type="link" danger onClick={() => openMaintenanceAction(record, "cancel")}>取消</Button> : null}
        </Space>
      ) : "-",
    },
  ];

  const anomalyColumns: ColumnsType<AssetAnomalyRecord> = [
    { title: "资产", width: "18%", render: (_, record) => <Cell title={record.asset.name} secondary={record.asset.assetCode} /> },
    { title: "异常内容", width: "31%", render: (_, record) => <Cell title={record.description} secondary={anomalyTypeLabel[record.type]} /> },
    { title: "等级", width: "10%", render: (_, record) => <Tag color={severityMeta[record.severity][1]}>{severityMeta[record.severity][0]}</Tag> },
    { title: "负责人", width: "14%", render: (_, record) => record.assignedTo?.realName || "待指派" },
    { title: "状态", width: "10%", render: (_, record) => <Tag color={anomalyStatusMeta[record.status][1]}>{anomalyStatusMeta[record.status][0]}</Tag> },
    {
      title: "操作",
      width: "17%",
      render: (_, record) => record.status === "OPEN" ? (
        <Space size={2} wrap>
          {isAdmin ? <Button type="link" onClick={() => openAnomalyAction(record, "assign")}>改派</Button> : null}
          {(isAdmin || record.assignedToId === currentUser.id) ? <Button type="link" onClick={() => openAnomalyAction(record, "resolve")}>处理</Button> : null}
        </Space>
      ) : <Typography.Text type="secondary">{record.resolution || "已完成"}</Typography.Text>,
    },
  ];

  const exitColumns: ColumnsType<AssetExitRecord> = [
    { title: "资产", width: "19%", render: (_, record) => <Cell title={record.asset.name} secondary={record.asset.assetCode} /> },
    { title: "退出事项", width: "32%", render: (_, record) => <Cell title={exitTypeLabel[record.exitType]} secondary={record.reason} /> },
    { title: "申请人", width: "13%", render: (_, record) => record.applicant.realName },
    { title: "申请时间", width: "17%", render: (_, record) => formatDateTime(record.createdAt) },
    { title: "状态", width: "10%", render: (_, record) => <Tag color={exitStatusMeta[record.status][1]}>{exitStatusMeta[record.status][0]}</Tag> },
    {
      title: "操作",
      width: "13%",
      render: (_, record) => record.status === "PENDING" && (isAdmin || record.applicantId === currentUser.id)
        ? <Button type="link" danger onClick={() => cancelExit(record)}>取消</Button>
        : "-",
    },
  ];

  const activeRecords = tab === "inventory" ? inventoryTasks : tab === "maintenance" ? maintenance : tab === "anomalies" ? anomalies : exits;
  const activeColumns = tab === "inventory" ? inventoryColumns : tab === "maintenance" ? maintenanceColumns : tab === "anomalies" ? anomalyColumns : exitColumns;
  const canCreate = tab === "anomalies" || tab === "exits" || isAdmin;
  const createLabel = tab === "inventory" ? "新建盘点" : tab === "maintenance" ? "登记维修" : tab === "anomalies" ? "上报异常" : "申请退出";

  return (
    <div className="page-stack asset-lifecycle-page">
      <div className="asset-page-heading">
        <div>
          <Typography.Title level={2} className="page-title">资产生命周期</Typography.Title>
          <Typography.Paragraph className="page-lead">盘点、维修、异常和退出统一留痕，资产状态随业务过程自动更新。</Typography.Paragraph>
        </div>
        <Space wrap>
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void loadData()}>刷新</Button>
          {canCreate ? <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>{createLabel}</Button> : null}
        </Space>
      </div>

      <section className="page-band lifecycle-band">
        <Tabs
          activeKey={tab}
          onChange={(key) => setTab(key as LifecycleTab)}
          items={[
            { key: "inventory", label: <span><FileDoneOutlined /> 资产盘点 <Tag>{totals.inventory}</Tag></span> },
            { key: "maintenance", label: <span><ToolOutlined /> 维修保养 <Tag>{totals.maintenance}</Tag></span> },
            { key: "anomalies", label: <span><AlertOutlined /> 异常台账 <Tag>{totals.anomalies}</Tag></span> },
            { key: "exits", label: <span><CloseOutlined /> 资产退出 <Tag>{totals.exits}</Tag></span> },
          ]}
        />
        {error ? <Alert showIcon type="error" message="生命周期数据加载失败" description={error} className="circulation-alert" /> : null}
        <Table
          rowKey="id"
          loading={loading}
          dataSource={activeRecords as []}
          columns={activeColumns as ColumnsType<never>}
          pagination={false}
          tableLayout="fixed"
          locale={{ emptyText: <Empty description="暂无记录" /> }}
          className="lifecycle-table"
        />
        <div className="asset-pagination">
          <Typography.Text type="secondary">共 {totals[tab]} 条记录</Typography.Text>
          <Pagination current={pages[tab]} pageSize={20} total={totals[tab]} showSizeChanger={false} onChange={(page) => setPages((current) => ({ ...current, [tab]: page }))} />
        </div>
      </section>

      <Modal open={Boolean(createMode)} title={createLabel} okText="保存" cancelText="取消" confirmLoading={submitting} onOk={() => void submitCreate()} onCancel={() => setCreateMode(null)} destroyOnHidden width={680}>
        {createMode === "inventory" ? <InventoryCreateForm form={inventoryForm} scope={inventoryScope} departments={departments} locations={locations} assetTypes={assetTypes} projects={projects} assetOptions={assetOptions} userOptions={userOptions} /> : null}
        {createMode === "maintenance" ? <MaintenanceCreateForm form={maintenanceForm} assetOptions={assetOptions} /> : null}
        {createMode === "anomalies" ? <AnomalyCreateForm form={anomalyForm} assetOptions={assetOptions} userOptions={userOptions} isAdmin={isAdmin} /> : null}
        {createMode === "exits" ? <ExitCreateForm form={exitForm} assetOptions={assetOptions} isAdmin={isAdmin} /> : null}
      </Modal>

      <InventoryDetailModal
        task={inventoryDetail}
        canRecord={Boolean(inventoryDetail && inventoryDetail.status === "OPEN" && (isAdmin || inventoryDetail.ownerId === currentUser.id))}
        canComplete={Boolean(isAdmin && inventoryDetail?.status === "OPEN")}
        onClose={() => setInventoryDetail(null)}
        onRecord={() => { inventoryRecordForm.resetFields(); setInventoryRecordOpen(true); }}
        onComplete={() => inventoryDetail && finishInventory(inventoryDetail)}
      />

      <Modal open={inventoryRecordOpen} title="登记实盘结果" okText="保存结果" cancelText="取消" confirmLoading={submitting} onOk={() => void submitInventoryRecord()} onCancel={() => setInventoryRecordOpen(false)} destroyOnHidden>
        <Form form={inventoryRecordForm} layout="vertical" requiredMark="optional">
          <Form.Item name="assetId" label="实盘资产" rules={[{ required: true, message: "请选择资产" }]}><Select showSearch optionFilterProp="label" options={assetOptions} /></Form.Item>
          <Form.Item name="checkedLocationId" label="实际位置"><Select allowClear showSearch optionFilterProp="label" options={locations.map((item) => ({ value: item.id, label: item.name }))} /></Form.Item>
          <Form.Item name="checkedAssetStatus" label="实际状态"><Select allowClear options={[{ value: "active", label: "正常在用" }, { value: "unavailable", label: "不可用" }]} /></Form.Item>
          <Form.Item name="checkedOwnerId" label="实际责任人"><Select allowClear showSearch optionFilterProp="label" options={userOptions} /></Form.Item>
          <Form.Item name="note" label="盘点备注"><Input.TextArea rows={3} maxLength={1000} showCount /></Form.Item>
        </Form>
      </Modal>

      <Modal open={Boolean(maintenanceAction)} title={maintenanceAction?.action === "complete" ? "完成维修保养" : "取消维修保养"} okText="确认" cancelText="返回" confirmLoading={submitting} onOk={() => void submitMaintenanceAction()} onCancel={() => setMaintenanceAction(null)} destroyOnHidden>
        <Form form={maintenanceActionForm} layout="vertical">
          {maintenanceAction?.action === "complete" ? (
            <><Form.Item name="cost" label="实际费用"><InputNumber min={0} precision={2} className="full-width-control" /></Form.Item><Form.Item name="description" label="处理结果"><Input.TextArea rows={4} maxLength={2000} showCount /></Form.Item></>
          ) : <Form.Item name="reason" label="取消原因"><Input.TextArea rows={3} maxLength={500} showCount /></Form.Item>}
        </Form>
      </Modal>

      <Modal open={Boolean(anomalyAction)} title={anomalyAction?.action === "assign" ? "指派异常负责人" : "完成异常处理"} okText="确认" cancelText="取消" confirmLoading={submitting} onOk={() => void submitAnomalyAction()} onCancel={() => setAnomalyAction(null)} destroyOnHidden>
        <Form form={anomalyActionForm} layout="vertical">
          {anomalyAction?.action === "assign" ? <Form.Item name="assignedToId" label="负责人"><Select allowClear showSearch optionFilterProp="label" options={userOptions} /></Form.Item> : <Form.Item name="resolution" label="处理结果" rules={[{ required: true, whitespace: true, message: "请填写处理结果" }]}><Input.TextArea rows={4} maxLength={2000} showCount /></Form.Item>}
        </Form>
      </Modal>
    </div>
  );
}

function InventoryCreateForm({ form, scope, departments, locations, assetTypes, projects, assetOptions, userOptions }: {
  form: ReturnType<typeof Form.useForm>[0];
  scope?: AssetInventoryScopeType;
  departments: DepartmentRecord[];
  locations: AssetLocationRecord[];
  assetTypes: AssetTypeRecord[];
  projects: BusinessMatterRecord[];
  assetOptions: Array<{ value: string; label: string }>;
  userOptions: Array<{ value: string; label: string }>;
}) {
  const scopeOptions = scope === "DEPARTMENT"
    ? departments.map((item) => ({ value: item.id, label: item.name }))
    : scope === "LOCATION"
      ? locations.map((item) => ({ value: item.id, label: item.name }))
      : scope === "PROJECT"
        ? projects.map((item) => ({ value: item.id, label: `${item.title} · ${item.matterNo}` }))
        : assetTypes.map((item) => ({ value: item.id, label: item.name }));
  return (
    <Form form={form} layout="vertical" requiredMark="optional">
      <Form.Item name="name" label="任务名称" rules={[{ required: true, whitespace: true, message: "请输入任务名称" }]}><Input maxLength={100} /></Form.Item>
      <div className="circulation-form-grid">
        <Form.Item name="ownerId" label="盘点负责人" rules={[{ required: true, message: "请选择负责人" }]}><Select showSearch optionFilterProp="label" options={userOptions} /></Form.Item>
        <Form.Item name="scopeType" label="盘点范围" rules={[{ required: true }]}><Select options={Object.entries(scopeTypeLabel).map(([value, label]) => ({ value, label }))} /></Form.Item>
      </div>
      {scope && !["ORGANIZATION", "ASSET_LIST"].includes(scope) ? <Form.Item name="scopeId" label="范围对象" rules={[{ required: true, message: "请选择范围对象" }]}><Select showSearch optionFilterProp="label" options={scopeOptions} /></Form.Item> : null}
      {scope === "ASSET_LIST" ? <Form.Item name="assetIds" label="资产清单" rules={[{ required: true, message: "请选择至少一项资产" }]}><Select mode="multiple" showSearch optionFilterProp="label" options={assetOptions} maxTagCount="responsive" /></Form.Item> : null}
      <div className="circulation-form-grid">
        <Form.Item name="plannedStart" label="计划开始" rules={[{ required: true, message: "请选择开始时间" }]}><Input type="datetime-local" /></Form.Item>
        <Form.Item name="plannedEnd" label="计划结束" rules={[{ required: true, message: "请选择结束时间" }]}><Input type="datetime-local" /></Form.Item>
      </div>
    </Form>
  );
}

function MaintenanceCreateForm({ form, assetOptions }: { form: ReturnType<typeof Form.useForm>[0]; assetOptions: Array<{ value: string; label: string }> }) {
  return (
    <Form form={form} layout="vertical" requiredMark="optional">
      <Form.Item name="assetId" label="资产" rules={[{ required: true, message: "请选择资产" }]}><Select showSearch optionFilterProp="label" options={assetOptions} /></Form.Item>
      <div className="circulation-form-grid">
        <Form.Item name="maintenanceType" label="业务类型" rules={[{ required: true }]}><Select options={Object.entries(maintenanceTypeLabel).map(([value, label]) => ({ value, label }))} /></Form.Item>
        <Form.Item name="plannedAt" label="计划时间"><Input type="datetime-local" /></Form.Item>
      </div>
      <Form.Item name="title" label="维修事项" rules={[{ required: true, whitespace: true, message: "请输入维修事项" }]}><Input maxLength={100} /></Form.Item>
      <div className="circulation-form-grid">
        <Form.Item name="vendor" label="服务单位"><Input maxLength={100} /></Form.Item>
        <Form.Item name="cost" label="预计费用"><InputNumber min={0} precision={2} className="full-width-control" /></Form.Item>
      </div>
      <Form.Item name="description" label="问题或计划说明"><Input.TextArea rows={3} maxLength={2000} showCount /></Form.Item>
    </Form>
  );
}

function AnomalyCreateForm({ form, assetOptions, userOptions, isAdmin }: { form: ReturnType<typeof Form.useForm>[0]; assetOptions: Array<{ value: string; label: string }>; userOptions: Array<{ value: string; label: string }>; isAdmin: boolean }) {
  return (
    <Form form={form} layout="vertical" requiredMark="optional">
      <Form.Item name="assetId" label="资产" rules={[{ required: true, message: "请选择资产" }]}><Select showSearch optionFilterProp="label" options={assetOptions} /></Form.Item>
      <div className="circulation-form-grid">
        <Form.Item name="type" label="异常类型" rules={[{ required: true }]}><Select options={Object.entries(anomalyTypeLabel).map(([value, label]) => ({ value, label }))} /></Form.Item>
        <Form.Item name="severity" label="严重程度" rules={[{ required: true }]}><Select options={Object.entries(severityMeta).map(([value, meta]) => ({ value, label: meta[0] }))} /></Form.Item>
      </div>
      {isAdmin ? <Form.Item name="assignedToId" label="负责人"><Select allowClear showSearch optionFilterProp="label" options={userOptions} /></Form.Item> : null}
      <Form.Item name="description" label="异常说明" rules={[{ required: true, whitespace: true, message: "请填写异常说明" }]}><Input.TextArea rows={4} maxLength={2000} showCount /></Form.Item>
    </Form>
  );
}

function ExitCreateForm({ form, assetOptions, isAdmin }: { form: ReturnType<typeof Form.useForm>[0]; assetOptions: Array<{ value: string; label: string }>; isAdmin: boolean }) {
  return (
    <Form form={form} layout="vertical" requiredMark="optional">
      {isAdmin ? <Alert type="warning" showIcon message="管理员提交后将直接通过并归档资产，请确认资产信息无误。" className="asset-form-alert" /> : null}
      <Form.Item name="assetId" label="退出资产" rules={[{ required: true, message: "请选择资产" }]}><Select showSearch optionFilterProp="label" options={assetOptions} /></Form.Item>
      <Form.Item name="exitType" label="退出方式" rules={[{ required: true }]}><Select options={Object.entries(exitTypeLabel).map(([value, label]) => ({ value, label }))} /></Form.Item>
      <Form.Item name="reason" label="退出原因" rules={[{ required: true, whitespace: true, message: "请填写退出原因" }]}><Input.TextArea rows={4} maxLength={2000} showCount /></Form.Item>
    </Form>
  );
}

function InventoryDetailModal({ task, canRecord, canComplete, onClose, onRecord, onComplete }: {
  task: AssetInventoryTaskRecord | null;
  canRecord: boolean;
  canComplete: boolean;
  onClose: () => void;
  onRecord: () => void;
  onComplete: () => void;
}) {
  const records = task?.records ?? [];
  const progress = task?.expectedCount ? Math.min(100, Math.round((records.length / task.expectedCount) * 100)) : 0;
  const columns: ColumnsType<AssetInventoryRecord> = [
    { title: "资产", width: "28%", render: (_, record) => <Cell title={record.asset.name} secondary={record.asset.assetCode} /> },
    { title: "结果", width: "20%", render: (_, record) => <Tag color={record.result === "NORMAL" ? "green" : "red"}>{inventoryResultLabel[record.result]}</Tag> },
    { title: "实盘位置", width: "20%", render: (_, record) => record.checkedLocation?.name || "未登记" },
    { title: "盘点人", width: "16%", render: (_, record) => record.checker.realName },
    { title: "盘点时间", width: "20%", render: (_, record) => formatDateTime(record.checkedAt) },
  ];
  return (
    <Modal open={Boolean(task)} title={task?.name || "盘点详情"} width={920} onCancel={onClose} footer={<Space>{canRecord ? <Button type="primary" icon={<PlusOutlined />} onClick={onRecord}>登记实盘</Button> : null}{canComplete ? <Button icon={<CheckCircleOutlined />} onClick={onComplete}>完成盘点</Button> : null}<Button onClick={onClose}>关闭</Button></Space>}>
      {task ? <Space direction="vertical" size={16} className="full-width-control">
        <Descriptions bordered size="small" column={3}>
          <Descriptions.Item label="负责人">{task.owner.realName}</Descriptions.Item>
          <Descriptions.Item label="范围">{scopeLabel(task)}</Descriptions.Item>
          <Descriptions.Item label="状态"><Tag color={inventoryStatusMeta[task.status][1]}>{inventoryStatusMeta[task.status][0]}</Tag></Descriptions.Item>
          <Descriptions.Item label="计划时间" span={2}><TimeRange start={task.plannedStart} end={task.plannedEnd} /></Descriptions.Item>
          <Descriptions.Item label="异常数量">{task.anomalies?.filter((item) => item.status === "OPEN").length ?? 0}</Descriptions.Item>
        </Descriptions>
        <div className="inventory-progress"><div><Typography.Text strong>盘点进度</Typography.Text><Typography.Text type="secondary">{records.length} / {task.expectedCount ?? 0} 项</Typography.Text></div><Progress percent={progress} status={task.status === "COMPLETED" ? "success" : "active"} /></div>
        <Table rowKey="id" dataSource={records} columns={columns} pagination={false} tableLayout="fixed" size="small" locale={{ emptyText: <Empty description="尚未登记实盘结果" /> }} className="lifecycle-table" />
      </Space> : null}
    </Modal>
  );
}

function Cell({ title, secondary }: { title: string; secondary?: string }) {
  return <div className="circulation-cell-stack"><Typography.Text strong>{title}</Typography.Text>{secondary ? <Typography.Text type="secondary">{secondary}</Typography.Text> : null}</div>;
}

function TimeRange({ start, end }: { start: string; end: string }) {
  return <div className="circulation-cell-stack"><span>{formatDateTime(start)}</span><Typography.Text type="secondary">至 {formatDateTime(end)}</Typography.Text></div>;
}

function scopeLabel(task: AssetInventoryTaskRecord) {
  const count = task.scopeValue?.assetIds?.length;
  return count ? `${scopeTypeLabel[task.scopeType]} · ${count} 项` : scopeTypeLabel[task.scopeType];
}

function toIso(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("时间格式无效");
  return date.toISOString();
}

function formatDateTime(value?: string | null) {
  if (!value) return "未设置";
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

function isFormValidationError(error: unknown) {
  return Boolean(error && typeof error === "object" && "errorFields" in error);
}

function confirmReason(title: string, label: string, action: (reason: string) => Promise<void>) {
  let reason = "";
  Modal.confirm({
    title,
    content: <Input.TextArea placeholder={label} rows={3} maxLength={500} onChange={(event) => { reason = event.target.value; }} />,
    okText: "确认",
    cancelText: "返回",
    okButtonProps: { danger: true },
    onOk: async () => {
      try {
        await action(reason.trim());
      } catch (error) {
        message.error(`操作失败：${formatApiError(error)}`);
        throw error;
      }
    },
  });
}
