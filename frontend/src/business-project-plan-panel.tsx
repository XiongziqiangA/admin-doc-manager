import {
  DeleteOutlined,
  EditOutlined,
  FlagOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import {
  Button,
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
  Tag,
  Typography,
  message,
} from "antd";
import { useState } from "react";

import {
  createBusinessMilestone,
  createBusinessStage,
  deleteBusinessMilestone,
  deleteBusinessStage,
  formatApiError,
  updateBusinessMilestone,
  updateBusinessStage,
} from "./api";
import type {
  BusinessMilestoneRecord,
  BusinessMilestoneStatus,
  BusinessProjectHealth,
  BusinessProjectPlan,
  BusinessStageRecord,
  BusinessStageStatus,
  PublicUser,
  UserRecord,
} from "./types";

const stageStatusLabels: Record<BusinessStageStatus, string> = {
  PLANNED: "未开始",
  IN_PROGRESS: "进行中",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
};

const milestoneStatusLabels: Record<BusinessMilestoneStatus, string> = {
  PLANNED: "待完成",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
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

const stageStatusColors: Record<BusinessStageStatus, string> = {
  PLANNED: "default",
  IN_PROGRESS: "processing",
  COMPLETED: "success",
  CANCELLED: "default",
};

interface StageFormValues {
  name: string;
  description?: string;
  status: BusinessStageStatus;
  progress?: number;
  sort?: number;
  startDate?: string;
  endDate?: string;
  ownerId?: string;
  ownerName?: string;
}

interface MilestoneFormValues {
  title: string;
  description?: string;
  stageId?: string;
  status: BusinessMilestoneStatus;
  dueDate?: string;
  ownerId?: string;
  ownerName?: string;
}

type PersonMode = "master" | "custom";

interface BusinessProjectPlanPanelProps {
  matterId: string;
  plan: BusinessProjectPlan | null;
  users: UserRecord[];
  currentUser: PublicUser;
  onChanged: () => void;
}

export function BusinessProjectPlanPanel({ matterId, plan, users, currentUser, onChanged }: BusinessProjectPlanPanelProps) {
  const [stageOpen, setStageOpen] = useState(false);
  const [editingStage, setEditingStage] = useState<BusinessStageRecord | null>(null);
  const [stageSubmitting, setStageSubmitting] = useState(false);
  const [stageOwnerMode, setStageOwnerMode] = useState<PersonMode>("master");
  const [milestoneOpen, setMilestoneOpen] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<BusinessMilestoneRecord | null>(null);
  const [milestoneSubmitting, setMilestoneSubmitting] = useState(false);
  const [milestoneOwnerMode, setMilestoneOwnerMode] = useState<PersonMode>("master");
  const [stageForm] = Form.useForm<StageFormValues>();
  const [milestoneForm] = Form.useForm<MilestoneFormValues>();
  const isAdmin = currentUser.role === "ADMIN";

  const openStageForm = (stage?: BusinessStageRecord) => {
    setEditingStage(stage ?? null);
    setStageOwnerMode(stage?.ownerName ? "custom" : "master");
    stageForm.resetFields();
    stageForm.setFieldsValue(stage ? {
      name: stage.name,
      description: stage.description ?? undefined,
      status: stage.status,
      progress: stage.progress,
      sort: stage.sort,
      startDate: stage.startDate?.slice(0, 10),
      endDate: stage.endDate?.slice(0, 10),
      ownerId: stage.ownerId ?? undefined,
      ownerName: stage.ownerName ?? undefined,
    } : { status: "PLANNED", progress: 0, sort: plan?.stages.length ?? 0 });
    setStageOpen(true);
  };

  const submitStage = async () => {
    try {
      const values = await stageForm.validateFields();
      setStageSubmitting(true);
      const payload = {
        name: values.name.trim(),
        description: values.description?.trim() || null,
        status: values.status,
        progress: values.progress ?? 0,
        sort: values.sort ?? 0,
        startDate: values.startDate || null,
        endDate: values.endDate || null,
        ...(stageOwnerMode === "custom"
          ? { ownerId: null, ownerName: values.ownerName?.trim() || null }
          : { ownerId: values.ownerId || null, ownerName: null }),
      };
      if (editingStage) await updateBusinessStage(matterId, editingStage.id, payload);
      else await createBusinessStage(matterId, payload);
      message.success(editingStage ? "项目阶段已更新" : "项目阶段已创建");
      setStageOpen(false);
      onChanged();
    } catch (error) {
      if (error && typeof error === "object" && "errorFields" in error) return;
      message.error(`阶段保存失败：${formatApiError(error)}`);
    } finally {
      setStageSubmitting(false);
    }
  };

  const removeStage = (stage: BusinessStageRecord) => {
    Modal.confirm({
      title: "删除项目阶段",
      content: `确认删除“${stage.name}”吗？阶段下的任务和里程碑会解除阶段关联，但不会被删除。`,
      okText: "删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteBusinessStage(matterId, stage.id);
          message.success("项目阶段已删除");
          onChanged();
        } catch (error) {
          message.error(`阶段删除失败：${formatApiError(error)}`);
        }
      },
    });
  };

  const openMilestoneForm = (milestone?: BusinessMilestoneRecord) => {
    setEditingMilestone(milestone ?? null);
    setMilestoneOwnerMode(milestone?.ownerName ? "custom" : "master");
    milestoneForm.resetFields();
    milestoneForm.setFieldsValue(milestone ? {
      title: milestone.title,
      description: milestone.description ?? undefined,
      stageId: milestone.stageId ?? undefined,
      status: milestone.status,
      dueDate: milestone.dueDate?.slice(0, 10),
      ownerId: milestone.ownerId ?? undefined,
      ownerName: milestone.ownerName ?? undefined,
    } : { status: "PLANNED" });
    setMilestoneOpen(true);
  };

  const submitMilestone = async () => {
    try {
      const values = await milestoneForm.validateFields();
      setMilestoneSubmitting(true);
      const payload = {
        title: values.title.trim(),
        description: values.description?.trim() || null,
        stageId: values.stageId || null,
        status: values.status,
        dueDate: values.dueDate || null,
        ...(milestoneOwnerMode === "custom"
          ? { ownerId: null, ownerName: values.ownerName?.trim() || null }
          : { ownerId: values.ownerId || null, ownerName: null }),
      };
      if (editingMilestone) await updateBusinessMilestone(matterId, editingMilestone.id, payload);
      else await createBusinessMilestone(matterId, payload);
      message.success(editingMilestone ? "里程碑已更新" : "里程碑已创建");
      setMilestoneOpen(false);
      onChanged();
    } catch (error) {
      if (error && typeof error === "object" && "errorFields" in error) return;
      message.error(`里程碑保存失败：${formatApiError(error)}`);
    } finally {
      setMilestoneSubmitting(false);
    }
  };

  const removeMilestone = (milestone: BusinessMilestoneRecord) => {
    Modal.confirm({
      title: "删除里程碑",
      content: `确认删除“${milestone.title}”吗？里程碑下的任务不会被删除。`,
      okText: "删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteBusinessMilestone(matterId, milestone.id);
          message.success("里程碑已删除");
          onChanged();
        } catch (error) {
          message.error(`里程碑删除失败：${formatApiError(error)}`);
        }
      },
    });
  };

  const ownerOptions = users.map((item) => ({ value: item.id, label: `${item.realName}（${item.username}）` }));
  const stageOptions = (plan?.stages ?? []).map((stage) => ({ value: stage.id, label: stage.name }));

  return (
    <section className="business-project-plan-panel">
      <div className="business-matter-section-heading">
        <div>
          <Typography.Title level={4}>项目进度</Typography.Title>
          <Typography.Text type="secondary">阶段、里程碑和任务进度会自动汇总到项目整体进度。</Typography.Text>
        </div>
        <Space wrap>
          <Button size="small" icon={<FlagOutlined />} onClick={() => openMilestoneForm()}>新增里程碑</Button>
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => openStageForm()}>新增阶段</Button>
        </Space>
      </div>
      {plan ? (
        <>
          <div className="business-project-progress-summary">
            <div>
              <Typography.Text type="secondary">整体进度</Typography.Text>
              <Progress percent={plan.summary.progress} status={plan.summary.health === "DELAYED" ? "exception" : plan.summary.health === "COMPLETED" ? "success" : "active"} />
            </div>
            <Space wrap>
              <Tag color={healthColors[plan.summary.health]}>{healthLabels[plan.summary.health]}</Tag>
              <Typography.Text type="secondary">阶段 {plan.summary.completedStageCount}/{plan.summary.stageCount}</Typography.Text>
              <Typography.Text type="secondary">里程碑 {plan.summary.completedMilestoneCount}/{plan.summary.milestoneCount}</Typography.Text>
              {plan.summary.overdueTaskCount ? <Tag color="red">逾期任务 {plan.summary.overdueTaskCount}</Tag> : null}
              {plan.summary.overdueMilestoneCount ? <Tag color="red">逾期里程碑 {plan.summary.overdueMilestoneCount}</Tag> : null}
            </Space>
          </div>
          <div className="business-project-plan-columns">
            <div>
              <Typography.Text strong>项目阶段</Typography.Text>
              {plan.stages.length ? (
                <List
                  size="small"
                  bordered
                  dataSource={plan.stages}
                  renderItem={(stage) => (
                    <List.Item actions={[
                      <Button key="edit" type="link" icon={<EditOutlined />} onClick={() => openStageForm(stage)}>编辑</Button>,
                      <Button key="delete" type="link" danger icon={<DeleteOutlined />} onClick={() => removeStage(stage)} />,
                    ]}>
                      <List.Item.Meta
                        title={<Space wrap><Typography.Text strong>{stage.name}</Typography.Text><Tag color={stageStatusColors[stage.status]}>{stageStatusLabels[stage.status]}</Tag></Space>}
                        description={<Space direction="vertical" size={2} className="full-width-control"><Progress percent={stage.calculatedProgress} size="small" status={stage.status === "CANCELLED" ? "exception" : stage.status === "COMPLETED" ? "success" : "active"} /><Typography.Text type="secondary">负责人：{stage.ownerName || stage.owner?.realName || "事项负责人"} · 任务 {stage.taskCount} 个 · {stage.startDate?.slice(0, 10) || "未定开始"} 至 {stage.endDate?.slice(0, 10) || "未定结束"}</Typography.Text></Space>}
                      />
                    </List.Item>
                  )}
                />
              ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无项目阶段" />}
            </div>
            <div>
              <Typography.Text strong>里程碑</Typography.Text>
              {plan.milestones.length ? (
                <List
                  size="small"
                  bordered
                  dataSource={plan.milestones}
                  renderItem={(milestone) => {
                    const overdue = milestone.status === "PLANNED" && milestone.dueDate && new Date(milestone.dueDate) < new Date();
                    return <List.Item actions={[
                      <Button key="edit" type="link" icon={<EditOutlined />} onClick={() => openMilestoneForm(milestone)}>编辑</Button>,
                      <Button key="delete" type="link" danger icon={<DeleteOutlined />} onClick={() => removeMilestone(milestone)} />,
                    ]}>
                      <List.Item.Meta
                        title={<Space wrap><Typography.Text strong>{milestone.title}</Typography.Text><Tag color={milestone.status === "COMPLETED" ? "success" : milestone.status === "CANCELLED" ? "default" : overdue ? "red" : "blue"}>{overdue ? "已逾期" : milestoneStatusLabels[milestone.status]}</Tag></Space>}
                        description={`阶段：${milestone.stage?.name || "未指定"} · 负责人：${milestone.ownerName || milestone.owner?.realName || "事项负责人"} · 截止：${milestone.dueDate?.slice(0, 10) || "未设置"}`}
                      />
                    </List.Item>;
                  }}
                />
              ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无里程碑" />}
            </div>
          </div>
        </>
      ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="项目计划加载中" />}

      <Modal title={editingStage ? "编辑项目阶段" : "新增项目阶段"} open={stageOpen} width={680} okText="保存" cancelText="取消" confirmLoading={stageSubmitting} onOk={() => void submitStage()} onCancel={() => setStageOpen(false)} destroyOnHidden>
        <Form form={stageForm} layout="vertical">
          <div className="business-workflow-form-grid">
            <Form.Item name="name" label="阶段名称" rules={[{ required: true, message: "请输入阶段名称" }]}><Input maxLength={200} /></Form.Item>
            <Form.Item name="status" label="阶段状态" rules={[{ required: true }]}><Select options={Object.entries(stageStatusLabels).map(([value, label]) => ({ value, label }))} /></Form.Item>
            <Form.Item name="progress" label="手工进度（无阶段任务时使用）"><InputNumber min={0} max={100} precision={0} className="full-width-control" /></Form.Item>
            <Form.Item name="sort" label="排序"><InputNumber min={0} precision={0} className="full-width-control" /></Form.Item>
            <Form.Item name="startDate" label="开始日期"><Input type="date" /></Form.Item>
            <Form.Item name="endDate" label="结束日期"><Input type="date" /></Form.Item>
          </div>
          <div className="business-workflow-reference-field">
            <Typography.Text strong>阶段负责人</Typography.Text>
            <Segmented block size="small" value={stageOwnerMode} options={[{ label: "系统账号", value: "master" }, { label: "自定义输入", value: "custom" }]} onChange={(value) => { const next = value as PersonMode; setStageOwnerMode(next); stageForm.setFieldsValue(next === "custom" ? { ownerId: undefined } : { ownerName: undefined }); }} />
            {stageOwnerMode === "custom" ? <Form.Item name="ownerName" rules={[{ required: true, message: "请输入负责人名称" }]}><Input maxLength={200} /></Form.Item> : isAdmin ? <Form.Item name="ownerId"><Select allowClear showSearch optionFilterProp="label" options={ownerOptions} /></Form.Item> : <Typography.Text type="secondary">默认使用事项负责人</Typography.Text>}
          </div>
          <Form.Item name="description" label="阶段说明"><Input.TextArea rows={3} maxLength={4000} /></Form.Item>
        </Form>
      </Modal>

      <Modal title={editingMilestone ? "编辑里程碑" : "新增里程碑"} open={milestoneOpen} width={680} okText="保存" cancelText="取消" confirmLoading={milestoneSubmitting} onOk={() => void submitMilestone()} onCancel={() => setMilestoneOpen(false)} destroyOnHidden>
        <Form form={milestoneForm} layout="vertical">
          <div className="business-workflow-form-grid">
            <Form.Item name="title" label="里程碑名称" rules={[{ required: true, message: "请输入里程碑名称" }]}><Input maxLength={200} /></Form.Item>
            <Form.Item name="status" label="状态" rules={[{ required: true }]}><Select options={Object.entries(milestoneStatusLabels).map(([value, label]) => ({ value, label }))} /></Form.Item>
            <Form.Item name="stageId" label="所属阶段"><Select allowClear options={stageOptions} /></Form.Item>
            <Form.Item name="dueDate" label="截止日期"><Input type="date" /></Form.Item>
          </div>
          <div className="business-workflow-reference-field">
            <Typography.Text strong>里程碑负责人</Typography.Text>
            <Segmented block size="small" value={milestoneOwnerMode} options={[{ label: "系统账号", value: "master" }, { label: "自定义输入", value: "custom" }]} onChange={(value) => { const next = value as PersonMode; setMilestoneOwnerMode(next); milestoneForm.setFieldsValue(next === "custom" ? { ownerId: undefined } : { ownerName: undefined }); }} />
            {milestoneOwnerMode === "custom" ? <Form.Item name="ownerName" rules={[{ required: true, message: "请输入负责人名称" }]}><Input maxLength={200} /></Form.Item> : isAdmin ? <Form.Item name="ownerId"><Select allowClear showSearch optionFilterProp="label" options={ownerOptions} /></Form.Item> : <Typography.Text type="secondary">默认使用事项负责人</Typography.Text>}
          </div>
          <Form.Item name="description" label="说明"><Input.TextArea rows={3} maxLength={4000} /></Form.Item>
        </Form>
      </Modal>
    </section>
  );
}
