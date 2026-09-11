import {
  CalendarOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  PlusOutlined,
  ReloadOutlined,
  SwapOutlined,
  UndoOutlined,
} from "@ant-design/icons";
import {
  Alert,
  Button,
  Descriptions,
  Empty,
  Form,
  Input,
  Modal,
  Pagination,
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
  cancelAssetBorrow,
  cancelAssetReservation,
  cancelAssetTransfer,
  checkoutAssetBorrow,
  completeAssetTransfer,
  confirmAssetReturn,
  createAssetBorrow,
  createAssetReservation,
  createAssetTransfer,
  formatApiError,
  listAssetBorrows,
  listAssetLocations,
  listAssetReservations,
  listAssetTransfers,
  listAssets,
  listUsers,
  requestAssetReturn,
} from "./api";
import type {
  AssetBorrowRecord,
  AssetRecord,
  AssetReservationRecord,
  AssetTransferRecord,
  DepartmentRecord,
  PublicUser,
  UserRecord,
} from "./types";

type CirculationTab = "reservations" | "borrows" | "transfers";
type CreateMode = "reservation" | "borrow" | "transfer";
type HandoverMode = "checkout" | "return" | "transfer";

interface AssetCirculationPageProps {
  currentUser: PublicUser;
  departments: DepartmentRecord[];
}

const reservationStatus = {
  PENDING: ["待审批", "gold"],
  APPROVED: ["已通过", "blue"],
  ACTIVE: ["使用中", "cyan"],
  COMPLETED: ["已完成", "green"],
  CANCELLED: ["已取消", "default"],
  REJECTED: ["已驳回", "red"],
  EXPIRED: ["已过期", "default"],
} as const;

const borrowStatus = {
  REQUESTED: ["待审批", "gold"],
  APPROVED: ["待交接", "blue"],
  ACTIVE: ["借用中", "cyan"],
  RETURN_PENDING: ["待确认归还", "orange"],
  RETURNED: ["已归还", "green"],
  REJECTED: ["已驳回", "red"],
  CANCELLED: ["已取消", "default"],
} as const;

const transferStatus = {
  PENDING: ["待审批", "gold"],
  APPROVED: ["待交接", "blue"],
  IN_TRANSIT: ["调拨中", "cyan"],
  COMPLETED: ["已完成", "green"],
  REJECTED: ["已驳回", "red"],
  CANCELLED: ["已取消", "default"],
} as const;

export function AssetCirculationPage({ currentUser, departments }: AssetCirculationPageProps) {
  const isAdmin = currentUser.role === "ADMIN";
  const [tab, setTab] = useState<CirculationTab>("reservations");
  const [reservations, setReservations] = useState<AssetReservationRecord[]>([]);
  const [borrows, setBorrows] = useState<AssetBorrowRecord[]>([]);
  const [transfers, setTransfers] = useState<AssetTransferRecord[]>([]);
  const [totals, setTotals] = useState({ reservations: 0, borrows: 0, transfers: 0 });
  const [pages, setPages] = useState({ reservations: 1, borrows: 1, transfers: 1 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createMode, setCreateMode] = useState<CreateMode | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [locations, setLocations] = useState<Array<{ id: string; name: string }>>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [detail, setDetail] = useState<AssetReservationRecord | AssetBorrowRecord | AssetTransferRecord | null>(null);
  const [handover, setHandover] = useState<{ mode: HandoverMode; record: AssetBorrowRecord | AssetTransferRecord } | null>(null);
  const [createForm] = Form.useForm();
  const [handoverForm] = Form.useForm();

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [reservationResult, borrowResult, transferResult] = await Promise.all([
        listAssetReservations({ page: pages.reservations, pageSize: 20 }),
        listAssetBorrows({ page: pages.borrows, pageSize: 20 }),
        isAdmin ? listAssetTransfers({ page: pages.transfers, pageSize: 20 }) : Promise.resolve(null),
      ]);
      setReservations(reservationResult.items);
      setBorrows(borrowResult.items);
      setTransfers(transferResult?.items ?? []);
      setTotals({
        reservations: reservationResult.pagination.totalItems,
        borrows: borrowResult.pagination.totalItems,
        transfers: transferResult?.pagination.totalItems ?? 0,
      });
    } catch (loadError) {
      setError(formatApiError(loadError));
    } finally {
      setLoading(false);
    }
  }, [isAdmin, pages]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    void searchAssets("");
    if (isAdmin) {
      Promise.all([listAssetLocations(), listUsers()])
        .then(([locationItems, userResult]) => {
          setLocations(locationItems);
          setUsers(userResult.items.filter((item) => item.status === "ACTIVE"));
        })
        .catch((loadError) => message.error(`调拨选项加载失败：${formatApiError(loadError)}`));
    }
  }, [isAdmin]);

  const searchAssets = async (keyword: string) => {
    try {
      const result = await listAssets({ page: 1, pageSize: 20, keyword: keyword.trim() || undefined });
      setAssets(result.items);
    } catch (loadError) {
      message.error(`资产搜索失败：${formatApiError(loadError)}`);
    }
  };

  const openCreate = (mode: CreateMode) => {
    createForm.resetFields();
    setCreateMode(mode);
  };

  const submitCreate = async () => {
    if (!createMode) return;
    const values = await createForm.validateFields();
    setSubmitting(true);
    try {
      if (createMode === "reservation") {
        await createAssetReservation({
          assetId: values.assetId,
          startAt: toIso(values.startAt),
          endAt: toIso(values.endAt),
          purpose: values.purpose,
        });
        message.success(isAdmin ? "预约已创建" : "预约申请已提交，等待管理员审批");
      } else if (createMode === "borrow") {
        await createAssetBorrow({
          assetId: values.assetId,
          reservationId: values.reservationId,
          borrowStart: toIso(values.startAt),
          borrowEnd: toIso(values.endAt),
          purpose: values.purpose,
          note: values.note,
        });
        message.success(isAdmin ? "借用已登记" : "借用申请已提交，等待管理员审批");
      } else {
        await createAssetTransfer({
          assetId: values.assetId,
          toDepartmentId: values.toDepartmentId,
          toLocationId: values.toLocationId,
          toOwnerId: values.toOwnerId,
          reason: values.reason,
        });
        message.success("调拨已登记，等待完成交接");
      }
      setCreateMode(null);
      await loadData();
    } catch (submitError) {
      if (!isFormValidationError(submitError)) message.error(`保存失败：${formatApiError(submitError)}`);
    } finally {
      setSubmitting(false);
    }
  };

  const confirmCancel = (kind: CreateMode, id: string) => {
    const labels = { reservation: "预约", borrow: "借用", transfer: "调拨" };
    Modal.confirm({
      title: `取消${labels[kind]}`,
      content: `确认取消这条${labels[kind]}记录？已生成的业务轨迹会继续保留。`,
      okText: "确认取消",
      cancelText: "返回",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          if (kind === "reservation") await cancelAssetReservation(id, "用户主动取消");
          if (kind === "borrow") await cancelAssetBorrow(id, "用户主动取消");
          if (kind === "transfer") await cancelAssetTransfer(id);
          message.success(`${labels[kind]}已取消`);
          await loadData();
        } catch (cancelError) {
          message.error(`取消失败：${formatApiError(cancelError)}`);
        }
      },
    });
  };

  const requestReturn = (record: AssetBorrowRecord) => {
    Modal.confirm({
      title: "发起归还",
      content: `确认发起“${record.asset.name}”的归还？管理员完成实物核对后会确认归还。`,
      okText: "确认发起",
      cancelText: "返回",
      onOk: async () => {
        try {
          await requestAssetReturn(record.id);
          message.success("归还申请已发起");
          await loadData();
        } catch (returnError) {
          message.error(`发起归还失败：${formatApiError(returnError)}`);
        }
      },
    });
  };

  const submitHandover = async () => {
    if (!handover) return;
    const values = await handoverForm.validateFields();
    const payload = {
      items: splitItems(values.items),
      note: values.note?.trim() || undefined,
    };
    setSubmitting(true);
    try {
      if (handover.mode === "checkout") await checkoutAssetBorrow(handover.record.id, payload);
      if (handover.mode === "return") await confirmAssetReturn(handover.record.id, payload);
      if (handover.mode === "transfer") await completeAssetTransfer(handover.record.id, payload);
      message.success(handover.mode === "checkout" ? "借出交接已完成" : handover.mode === "return" ? "归还已确认" : "调拨交接已完成");
      setHandover(null);
      await loadData();
    } catch (handoverError) {
      if (!isFormValidationError(handoverError)) message.error(`交接失败：${formatApiError(handoverError)}`);
    } finally {
      setSubmitting(false);
    }
  };

  const reservationColumns = useMemo<ColumnsType<AssetReservationRecord>>(() => [
    assetColumn<AssetReservationRecord>(),
    { title: "申请人", dataIndex: ["applicant", "realName"], width: "13%" },
    { title: "预约时间", width: "25%", render: (_, item) => <TimeRange start={item.startAt} end={item.endAt} /> },
    { title: "用途", dataIndex: "purpose", ellipsis: true },
    { title: "状态", width: 90, render: (_, item) => <StatusTag value={reservationStatus[item.status]} /> },
    {
      title: "操作",
      width: 130,
      render: (_, item) => (
        <Space size={2} wrap>
          <Button type="text" icon={<EyeOutlined />} title="查看详情" aria-label="查看预约详情" onClick={() => setDetail(item)} />
          {["PENDING", "APPROVED", "ACTIVE"].includes(item.status)
            ? <Button type="text" danger icon={<UndoOutlined />} title="取消预约" aria-label="取消预约" onClick={() => confirmCancel("reservation", item.id)} />
            : null}
        </Space>
      ),
    },
  ], []);

  const borrowColumns = useMemo<ColumnsType<AssetBorrowRecord>>(() => [
    assetColumn<AssetBorrowRecord>(),
    { title: "借用人", dataIndex: ["applicant", "realName"], width: "13%" },
    { title: "借用时间", width: "25%", render: (_, item) => <TimeRange start={item.borrowStart} end={item.borrowEnd} /> },
    { title: "用途", dataIndex: "purpose", ellipsis: true },
    { title: "状态", width: 110, render: (_, item) => <StatusTag value={borrowStatus[item.status]} /> },
    {
      title: "操作",
      width: 170,
      render: (_, item) => (
        <Space size={2} wrap>
          <Button type="text" icon={<EyeOutlined />} title="查看详情" aria-label="查看借用详情" onClick={() => setDetail(item)} />
          {["REQUESTED", "APPROVED"].includes(item.status)
            ? <Button type="text" danger icon={<UndoOutlined />} title="取消借用" aria-label="取消借用" onClick={() => confirmCancel("borrow", item.id)} />
            : null}
          {isAdmin && item.status === "APPROVED"
            ? <Button type="link" onClick={() => { handoverForm.resetFields(); setHandover({ mode: "checkout", record: item }); }}>交接借出</Button>
            : null}
          {item.status === "ACTIVE"
            ? <Button type="link" onClick={() => requestReturn(item)}>发起归还</Button>
            : null}
          {isAdmin && item.status === "RETURN_PENDING"
            ? <Button type="link" onClick={() => { handoverForm.resetFields(); setHandover({ mode: "return", record: item }); }}>确认归还</Button>
            : null}
        </Space>
      ),
    },
  ], [isAdmin]);

  const transferColumns = useMemo<ColumnsType<AssetTransferRecord>>(() => [
    assetColumn<AssetTransferRecord>(),
    {
      title: "调拨去向",
      render: (_, item) => (
        <div className="circulation-cell-stack">
          <span>{item.toDepartment?.name || "未指定部门"}</span>
          <Typography.Text type="secondary">{item.toLocation?.name || "未指定位置"} · {item.toOwner?.realName || "未指定责任人"}</Typography.Text>
        </div>
      ),
    },
    { title: "原因", dataIndex: "reason", ellipsis: true },
    { title: "状态", width: 100, render: (_, item) => <StatusTag value={transferStatus[item.status]} /> },
    { title: "登记时间", width: 150, render: (_, item) => formatDateTime(item.createdAt) },
    {
      title: "操作",
      width: 150,
      render: (_, item) => (
        <Space size={2} wrap>
          <Button type="text" icon={<EyeOutlined />} title="查看详情" aria-label="查看调拨详情" onClick={() => setDetail(item)} />
          {item.status === "APPROVED"
            ? <Button type="link" onClick={() => { handoverForm.resetFields(); setHandover({ mode: "transfer", record: item }); }}>完成交接</Button>
            : null}
          {["PENDING", "APPROVED"].includes(item.status)
            ? <Button type="text" danger icon={<UndoOutlined />} title="取消调拨" aria-label="取消调拨" onClick={() => confirmCancel("transfer", item.id)} />
            : null}
        </Space>
      ),
    },
  ], []);

  const activeRecords = tab === "reservations" ? reservations : tab === "borrows" ? borrows : transfers;
  const activeColumns = tab === "reservations" ? reservationColumns : tab === "borrows" ? borrowColumns : transferColumns;
  const mode = tab === "reservations" ? "reservation" : tab === "borrows" ? "borrow" : "transfer";

  return (
    <div className="page-stack circulation-page">
      <div className="asset-page-heading">
        <div>
          <Typography.Title level={2} className="page-title">资产流转</Typography.Title>
          <Typography.Paragraph className="page-lead">集中处理预约、借用归还和内部调拨，所有状态变化保留业务时间线和管理员审计。</Typography.Paragraph>
        </div>
        <Space wrap>
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void loadData()}>刷新</Button>
          {(tab !== "transfers" || isAdmin) ? <Button type="primary" icon={<PlusOutlined />} onClick={() => openCreate(mode)}>新增{tab === "reservations" ? "预约" : tab === "borrows" ? "借用" : "调拨"}</Button> : null}
        </Space>
      </div>

      <section className="page-band circulation-band">
        <Tabs
          activeKey={tab}
          onChange={(key) => setTab(key as CirculationTab)}
          items={[
            { key: "reservations", label: <span><CalendarOutlined /> 预约 <Tag>{totals.reservations}</Tag></span> },
            { key: "borrows", label: <span><ClockCircleOutlined /> 借用与归还 <Tag>{totals.borrows}</Tag></span> },
            ...(isAdmin ? [{ key: "transfers", label: <span><SwapOutlined /> 内部调拨 <Tag>{totals.transfers}</Tag></span> }] : []),
          ]}
        />
        {error ? <Alert showIcon type="error" message="资产流转数据加载失败" description={error} className="circulation-alert" /> : null}
        <Table
          rowKey="id"
          loading={loading}
          dataSource={activeRecords as []}
          columns={activeColumns as ColumnsType<never>}
          pagination={false}
          tableLayout="fixed"
          locale={{ emptyText: <Empty description="暂无流转记录" /> }}
          className="circulation-table"
        />
        <div className="asset-pagination">
          <Typography.Text type="secondary">共 {totals[tab]} 条记录</Typography.Text>
          <Pagination
            current={pages[tab]}
            pageSize={20}
            total={totals[tab]}
            showSizeChanger={false}
            onChange={(page) => setPages((current) => ({ ...current, [tab]: page }))}
          />
        </div>
      </section>

      <Modal
        open={Boolean(createMode)}
        title={createMode === "reservation" ? "新增资产预约" : createMode === "borrow" ? "新增资产借用" : "新增内部调拨"}
        okText="保存"
        cancelText="取消"
        confirmLoading={submitting}
        onOk={() => void submitCreate()}
        onCancel={() => setCreateMode(null)}
        destroyOnHidden
      >
        <Form form={createForm} layout="vertical" requiredMark="optional">
          <Form.Item name="assetId" label="资产" rules={[{ required: true, message: "请选择资产" }]}>
            <Select
              showSearch
              filterOption={false}
              onSearch={(value) => void searchAssets(value)}
              placeholder="输入资产名称、编号或序列号搜索"
              options={assets.map((item) => ({ value: item.id, label: `${item.name} · ${item.assetCode}` }))}
            />
          </Form.Item>
          {createMode === "borrow" ? (
            <Form.Item name="reservationId" label="来源预约">
              <Select
                allowClear
                placeholder="可选：使用已通过的本人预约"
                options={reservations.filter((item) => ["APPROVED", "ACTIVE"].includes(item.status)).map((item) => ({
                  value: item.id,
                  label: `${item.asset.name} · ${formatDateTime(item.startAt)}`,
                }))}
              />
            </Form.Item>
          ) : null}
          {createMode !== "transfer" ? (
            <>
              <div className="circulation-form-grid">
                <Form.Item name="startAt" label={createMode === "reservation" ? "开始时间" : "借用时间"} rules={[{ required: true, message: "请选择开始时间" }]}>
                  <Input type="datetime-local" />
                </Form.Item>
                <Form.Item name="endAt" label={createMode === "reservation" ? "结束时间" : "计划归还"} rules={[{ required: true, message: "请选择结束时间" }]}>
                  <Input type="datetime-local" />
                </Form.Item>
              </div>
              <Form.Item name="purpose" label="用途" rules={[{ required: true, whitespace: true, message: "请输入用途" }]}>
                <Input.TextArea rows={3} maxLength={500} showCount />
              </Form.Item>
              {createMode === "borrow" ? <Form.Item name="note" label="备注"><Input.TextArea rows={2} maxLength={1000} /></Form.Item> : null}
            </>
          ) : (
            <>
              <div className="circulation-form-grid">
                <Form.Item name="toDepartmentId" label="目标部门"><Select allowClear options={departments.map((item) => ({ value: item.id, label: item.name }))} /></Form.Item>
                <Form.Item name="toLocationId" label="目标位置"><Select allowClear options={locations.map((item) => ({ value: item.id, label: item.name }))} /></Form.Item>
              </div>
              <Form.Item name="toOwnerId" label="目标责任人"><Select allowClear showSearch optionFilterProp="label" options={users.map((item) => ({ value: item.id, label: `${item.realName} · ${item.username}` }))} /></Form.Item>
              <Form.Item name="reason" label="调拨原因" rules={[{ required: true, whitespace: true, message: "请输入调拨原因" }]}><Input.TextArea rows={3} maxLength={1000} showCount /></Form.Item>
            </>
          )}
        </Form>
      </Modal>

      <Modal
        open={Boolean(handover)}
        title={handover?.mode === "checkout" ? "借出交接" : handover?.mode === "return" ? "确认归还" : "调拨交接"}
        okText="确认完成"
        cancelText="取消"
        confirmLoading={submitting}
        onOk={() => void submitHandover()}
        onCancel={() => setHandover(null)}
        destroyOnHidden
      >
        <Form form={handoverForm} layout="vertical">
          <Form.Item name="items" label="随附物品" extra="每行填写一项，例如电源适配器、包装箱">
            <Input.TextArea rows={4} />
          </Form.Item>
          <Form.Item name="note" label="交接备注"><Input.TextArea rows={3} maxLength={1000} showCount /></Form.Item>
        </Form>
      </Modal>

      <CirculationDetail record={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

function assetColumn<T extends { asset: { name: string; assetCode: string } }>(): ColumnsType<T>[number] {
  return {
    title: "资产",
    width: "20%",
    render: (_, item) => (
      <div className="circulation-cell-stack">
        <Typography.Text strong ellipsis={{ tooltip: item.asset.name }}>{item.asset.name}</Typography.Text>
        <Typography.Text type="secondary">{item.asset.assetCode}</Typography.Text>
      </div>
    ),
  };
}

function TimeRange({ start, end }: { start: string; end: string }) {
  return (
    <div className="circulation-cell-stack">
      <span>{formatDateTime(start)}</span>
      <Typography.Text type="secondary">至 {formatDateTime(end)}</Typography.Text>
    </div>
  );
}

function StatusTag({ value }: { value: readonly [string, string] }) {
  return <Tag color={value[1]}>{value[0]}</Tag>;
}

function CirculationDetail({
  record,
  onClose,
}: {
  record: AssetReservationRecord | AssetBorrowRecord | AssetTransferRecord | null;
  onClose: () => void;
}) {
  if (!record) return null;
  const isReservation = "startAt" in record;
  const isBorrow = "borrowStart" in record;
  const status = isReservation ? reservationStatus[record.status] : isBorrow ? borrowStatus[record.status] : transferStatus[record.status];
  return (
    <Modal open title="流转详情" footer={<Button onClick={onClose}>关闭</Button>} onCancel={onClose} width={680}>
      <Descriptions bordered size="small" column={2}>
        <Descriptions.Item label="资产名称">{record.asset.name}</Descriptions.Item>
        <Descriptions.Item label="资产编号">{record.asset.assetCode}</Descriptions.Item>
        <Descriptions.Item label="状态"><StatusTag value={status} /></Descriptions.Item>
        <Descriptions.Item label="登记时间">{formatDateTime(record.createdAt)}</Descriptions.Item>
        {isReservation ? (
          <>
            <Descriptions.Item label="申请人">{record.applicant.realName}</Descriptions.Item>
            <Descriptions.Item label="预约时间" span={2}><TimeRange start={record.startAt} end={record.endAt} /></Descriptions.Item>
            <Descriptions.Item label="用途" span={2}>{record.purpose}</Descriptions.Item>
          </>
        ) : isBorrow ? (
          <>
            <Descriptions.Item label="借用人">{record.applicant.realName}</Descriptions.Item>
            <Descriptions.Item label="借用时间" span={2}><TimeRange start={record.borrowStart} end={record.borrowEnd} /></Descriptions.Item>
            <Descriptions.Item label="用途" span={2}>{record.purpose}</Descriptions.Item>
            <Descriptions.Item label="备注" span={2}>{record.note || "无"}</Descriptions.Item>
          </>
        ) : (
          <>
            <Descriptions.Item label="目标部门">{record.toDepartment?.name || "未指定"}</Descriptions.Item>
            <Descriptions.Item label="目标位置">{record.toLocation?.name || "未指定"}</Descriptions.Item>
            <Descriptions.Item label="目标责任人">{record.toOwner?.realName || "未指定"}</Descriptions.Item>
            <Descriptions.Item label="调拨原因" span={2}>{record.reason}</Descriptions.Item>
          </>
        )}
      </Descriptions>
    </Modal>
  );
}

function toIso(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("时间格式无效");
  return date.toISOString();
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function splitItems(value?: string) {
  return (value ?? "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

function isFormValidationError(error: unknown) {
  return Boolean(error && typeof error === "object" && "errorFields" in error);
}
