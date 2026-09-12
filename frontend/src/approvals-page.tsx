import { CheckOutlined, CloseOutlined, EyeOutlined, ReloadOutlined } from "@ant-design/icons";
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
  Tag,
  Timeline,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useMemo, useState } from "react";

import { approveRequest, formatApiError, listApprovals, rejectRequest } from "./api";
import type { ApprovalRecord, ApprovalStatus, PublicUser } from "./types";

interface ApprovalsPageProps {
  currentUser: PublicUser;
}

const approvalStatus = {
  PENDING: ["待处理", "gold"],
  APPROVED: ["已通过", "green"],
  REJECTED: ["已驳回", "red"],
  CANCELLED: ["已取消", "default"],
} as const;

const businessTypeLabel = {
  ASSET_INTAKE: "历史资产入库",
  ASSET_RESERVATION: "资产预约",
  ASSET_BORROW: "资产借用",
  ASSET_TRANSFER: "资产调拨",
  ASSET_EXIT: "资产退出",
} as const;

const actionLabel = {
  SUBMIT: "提交申请",
  APPROVE: "审批通过",
  REJECT: "审批驳回",
  CANCEL: "取消申请",
} as const;

export function ApprovalsPage({ currentUser }: ApprovalsPageProps) {
  const isAdmin = currentUser.role === "ADMIN";
  const [items, setItems] = useState<ApprovalRecord[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<ApprovalStatus | undefined>(isAdmin ? "PENDING" : undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<ApprovalRecord | null>(null);
  const [review, setReview] = useState<{ record: ApprovalRecord; action: "approve" | "reject" } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listApprovals({ page, pageSize: 20, status });
      setItems(result.items);
      setTotal(result.pagination.totalItems);
    } catch (loadError) {
      setError(formatApiError(loadError));
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openReview = (record: ApprovalRecord, action: "approve" | "reject") => {
    form.resetFields();
    setReview({ record, action });
  };

  const submitReview = async () => {
    if (!review) return;
    const values = await form.validateFields();
    setSubmitting(true);
    try {
      if (review.action === "approve") await approveRequest(review.record.id, values.comment);
      else await rejectRequest(review.record.id, values.comment);
      message.success(review.action === "approve" ? "审批已通过" : "审批已驳回");
      setReview(null);
      await loadData();
    } catch (reviewError) {
      if (!(reviewError && typeof reviewError === "object" && "errorFields" in reviewError)) {
        message.error(`审批失败：${formatApiError(reviewError)}`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const columns = useMemo<ColumnsType<ApprovalRecord>>(() => [
    {
      title: "审批事项",
      width: "28%",
      render: (_, record) => (
        <div className="circulation-cell-stack">
          <Typography.Text strong>{businessTypeLabel[record.businessType]}</Typography.Text>
          <Typography.Text type="secondary" ellipsis={{ tooltip: businessSummary(record) }}>{businessSummary(record)}</Typography.Text>
        </div>
      ),
    },
    { title: "申请人", dataIndex: ["applicant", "realName"], width: "15%" },
    { title: "申请时间", width: 150, render: (_, record) => formatDateTime(record.createdAt) },
    {
      title: "业务时间",
      render: (_, record) => {
        const range = businessRange(record);
        return range ? <div className="circulation-cell-stack"><span>{formatDateTime(range[0])}</span><Typography.Text type="secondary">至 {formatDateTime(range[1])}</Typography.Text></div> : "-";
      },
    },
    { title: "状态", width: 90, render: (_, record) => <Tag color={approvalStatus[record.status][1]}>{approvalStatus[record.status][0]}</Tag> },
    {
      title: "操作",
      width: 180,
      render: (_, record) => (
        <Space size={2} wrap>
          <Button type="text" icon={<EyeOutlined />} title="查看详情" aria-label="查看审批详情" onClick={() => setDetail(record)} />
          {isAdmin && record.status === "PENDING" && record.businessType !== "ASSET_INTAKE" ? (
            <>
              <Button type="link" icon={<CheckOutlined />} onClick={() => openReview(record, "approve")}>通过</Button>
              <Button type="link" danger icon={<CloseOutlined />} onClick={() => openReview(record, "reject")}>驳回</Button>
            </>
          ) : null}
        </Space>
      ),
    },
  ], [isAdmin]);

  return (
    <div className="page-stack approvals-page">
      <div className="asset-page-heading">
        <div>
          <Typography.Title level={2} className="page-title">审批中心</Typography.Title>
          <Typography.Paragraph className="page-lead">{isAdmin ? "处理资产预约、借用、调拨和退出申请，并查看迁移保留的历史入库审批。" : "查看本人提交的申请、审批结果和处理意见。"}</Typography.Paragraph>
        </div>
        <Space wrap>
          <Select
            value={status}
            allowClear
            placeholder="全部状态"
            className="approval-status-filter"
            options={Object.entries(approvalStatus).map(([value, meta]) => ({ value, label: meta[0] }))}
            onChange={(value) => { setPage(1); setStatus(value); }}
          />
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void loadData()}>刷新</Button>
        </Space>
      </div>
      <section className="page-band approvals-band">
        {error ? <Alert type="error" showIcon message="审批数据加载失败" description={error} className="circulation-alert" /> : null}
        <Table
          rowKey="id"
          loading={loading}
          dataSource={items}
          columns={columns}
          pagination={false}
          tableLayout="fixed"
          locale={{ emptyText: <Empty description="暂无审批记录" /> }}
          className="circulation-table"
        />
        <div className="asset-pagination">
          <Typography.Text type="secondary">共 {total} 条审批</Typography.Text>
          <Pagination current={page} pageSize={20} total={total} showSizeChanger={false} onChange={setPage} />
        </div>
      </section>

      <Modal
        open={Boolean(review)}
        title={review?.action === "approve" ? "通过审批" : "驳回审批"}
        okText={review?.action === "approve" ? "确认通过" : "确认驳回"}
        okButtonProps={{ danger: review?.action === "reject" }}
        cancelText="取消"
        confirmLoading={submitting}
        onOk={() => void submitReview()}
        onCancel={() => setReview(null)}
        destroyOnHidden
      >
        <Typography.Paragraph>{review ? `${businessTypeLabel[review.record.businessType]} · ${businessSummary(review.record)}` : null}</Typography.Paragraph>
        <Form form={form} layout="vertical">
          <Form.Item name="comment" label="处理意见" rules={review?.action === "reject" ? [{ required: true, whitespace: true, message: "请填写驳回原因" }] : []}>
            <Input.TextArea rows={4} maxLength={1000} showCount />
          </Form.Item>
        </Form>
      </Modal>

      <ApprovalDetail record={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

function ApprovalDetail({ record, onClose }: { record: ApprovalRecord | null; onClose: () => void }) {
  if (!record) return null;
  return (
    <Modal open title="审批详情" width={720} footer={<Button onClick={onClose}>关闭</Button>} onCancel={onClose}>
      <Descriptions bordered size="small" column={2}>
        <Descriptions.Item label="业务类型">{businessTypeLabel[record.businessType]}</Descriptions.Item>
        <Descriptions.Item label="状态"><Tag color={approvalStatus[record.status][1]}>{approvalStatus[record.status][0]}</Tag></Descriptions.Item>
        <Descriptions.Item label="业务对象" span={2}>{businessSummary(record)}</Descriptions.Item>
        <Descriptions.Item label="申请人">{record.applicant.realName}</Descriptions.Item>
        <Descriptions.Item label="申请时间">{formatDateTime(record.createdAt)}</Descriptions.Item>
        {record.exitRequest ? <Descriptions.Item label="退出方式">{exitTypeLabel[record.exitRequest.exitType]}</Descriptions.Item> : null}
        {record.exitRequest ? <Descriptions.Item label="退出原因" span={2}>{record.exitRequest.reason}</Descriptions.Item> : null}
        <Descriptions.Item label="处理意见" span={2}>{record.comment || "无"}</Descriptions.Item>
      </Descriptions>
      <Typography.Title level={5} className="approval-history-title">处理记录</Typography.Title>
      <Timeline
        items={record.actions.map((action) => ({
          color: action.action === "REJECT" ? "red" : action.action === "APPROVE" ? "green" : "blue",
          children: (
            <div className="approval-history-item">
              <Typography.Text strong>{actionLabel[action.action]}</Typography.Text>
              <Typography.Text type="secondary">{action.actor.realName} · {formatDateTime(action.createdAt)}</Typography.Text>
              {action.comment ? <Typography.Paragraph>{action.comment}</Typography.Paragraph> : null}
            </div>
          ),
        }))}
      />
    </Modal>
  );
}

const exitTypeLabel = {
  SCRAPPED: "报废",
  LOST: "遗失",
  SOLD: "出售",
  TRANSFERRED: "转出",
  DONATED: "捐赠",
  CROSS_COMPANY_TRANSFER: "跨公司调拨",
} as const;

function businessSummary(record: ApprovalRecord) {
  const item = record.reservation ?? record.borrow ?? record.transfer ?? record.exitRequest;
  return item ? `${item.asset.name} · ${item.asset.assetCode}` : `业务编号 ${record.businessId}`;
}

function businessRange(record: ApprovalRecord): [string, string] | null {
  if (record.reservation) return [record.reservation.startAt, record.reservation.endAt];
  if (record.borrow) return [record.borrow.borrowStart, record.borrow.borrowEnd];
  return null;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}
