import {
  ClearOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  EyeOutlined,
  FileAddOutlined,
  FilterOutlined,
  FolderAddOutlined,
  FolderOpenOutlined,
  RobotOutlined,
  ReloadOutlined,
  SettingOutlined,
  SyncOutlined,
} from "@ant-design/icons";
import {
  Alert,
  Button,
  Cascader,
  Checkbox,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  Tree,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { CascaderProps } from "antd/es/cascader";
import type { DataNode } from "antd/es/tree";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  addFinancePackageItems,
  createFinancePackage,
  createFinancePackageGroup,
  deleteFinancePackage,
  deleteFinancePackageGroup,
  deleteFinancePackageItem,
  downloadDocumentBlob,
  exportFinancePackageBlob,
  formatApiError,
  getFinancePackage,
  getFinanceAnalysis,
  listFinancePackageCandidates,
  listFinancePackages,
  startFinanceAnalysis,
  confirmFinanceAnalysis,
  updateFinancePackage,
  updateFinancePackageGroup,
  updateFinancePackageItem,
} from "./api";
import type {
  CategoryNode,
  DepartmentRecord,
  DocumentRecord,
  FinanceMaterialType,
  FinanceAnalysisJobDetail,
  FinanceAnalysisSuggestionRecord,
  FinancePackageCandidate,
  FinancePackageGroupRecord,
  FinancePackageItemRecord,
  FinancePackageTaskRecord,
  TagRecord,
} from "./types";

const { Title, Text } = Typography;
const ROOT_GROUP_KEY = "__finance_root__";

const MATERIAL_TYPE_LABELS: Record<FinanceMaterialType, string> = {
  REIMBURSEMENT_FORM: "报销单",
  INVOICE: "发票",
  PAYMENT_FORM: "付款单",
  TICKET: "车票/行程单",
  CONTRACT: "合同",
  BANK_RECEIPT: "银行回单",
  OTHER: "其他凭证",
};

const MATERIAL_TYPE_OPTIONS = Object.entries(MATERIAL_TYPE_LABELS).map(([value, label]) => ({ value, label }));

interface FinancePackagesPageProps {
  onOpenDocument: (document: DocumentRecord) => void;
  categories: CategoryNode[];
  departments: DepartmentRecord[];
  tags: TagRecord[];
}

interface TaskFormValues {
  name: string;
  period: string;
  rootFolderName: string;
  includeManifest: boolean;
  copyGroupsFromTaskId?: string;
}

interface GroupFormValues {
  name: string;
  parentId?: string;
  sort: number;
}

interface ItemFormValues {
  groupId: string;
  materialType: FinanceMaterialType;
  exportFileName?: string;
  remark?: string;
}

interface CandidateFilters {
  categoryPath: string[];
  departmentId?: string;
  tagId?: string;
  materialType?: FinanceMaterialType;
  uploadedFrom?: string;
  uploadedTo?: string;
}

interface AnalysisDraft {
  decision: "CONFIRM" | "REJECT";
  groupId?: string;
  groupName: string;
  materialType: FinanceMaterialType;
  exportFileName: string;
  remark: string;
}

const EMPTY_CANDIDATE_FILTERS: CandidateFilters = { categoryPath: [] };

type ConfirmAction =
  | { type: "task"; task: FinancePackageTaskRecord }
  | { type: "group"; group: FinancePackageGroupRecord }
  | { type: "item"; item: FinancePackageItemRecord }
  | null;

export function FinancePackagesPage({ onOpenDocument, categories, departments, tags }: FinancePackagesPageProps) {
  const [tasks, setTasks] = useState<FinancePackageTaskRecord[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string>();
  const [detail, setDetail] = useState<FinancePackageTaskRecord>();
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [taskModalMode, setTaskModalMode] = useState<"create" | "edit" | null>(null);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<FinancePackageGroupRecord | null>(null);
  const [editingItem, setEditingItem] = useState<FinancePackageItemRecord | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [candidateOpen, setCandidateOpen] = useState(false);
  const [candidates, setCandidates] = useState<FinancePackageCandidate[]>([]);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [candidateKeyword, setCandidateKeyword] = useState("");
  const [candidatePage, setCandidatePage] = useState(1);
  const [candidateTotal, setCandidateTotal] = useState(0);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);
  const [candidateDestination, setCandidateDestination] = useState<string>(ROOT_GROUP_KEY);
  const [candidateFilters, setCandidateFilters] = useState<CandidateFilters>(EMPTY_CANDIDATE_FILTERS);
  const [candidateMaterialType, setCandidateMaterialType] = useState<FinanceMaterialType>();
  const [analysisJob, setAnalysisJob] = useState<FinanceAnalysisJobDetail | null>(null);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisConfirming, setAnalysisConfirming] = useState(false);
  const [analysisDrafts, setAnalysisDrafts] = useState<Record<string, AnalysisDraft>>({});
  const [taskForm] = Form.useForm<TaskFormValues>();
  const [groupForm] = Form.useForm<GroupFormValues>();
  const [itemForm] = Form.useForm<ItemFormValues>();

  const loadAnalysis = useCallback(async (taskId: string, jobId: string) => {
    const result = await getFinanceAnalysis(taskId, jobId);
    setAnalysisJob(result);
    setAnalysisDrafts((current) => {
      const next = { ...current };
      for (const suggestion of result.suggestions) {
        next[suggestion.id] ??= createAnalysisDraft(suggestion);
      }
      return next;
    });
    return result;
  }, []);

  const loadTasks = useCallback(async (preferredTaskId?: string) => {
    setLoadingTasks(true);
    try {
      const result = await listFinancePackages();
      setTasks(result.items);
      setSelectedTaskId((current) => {
        const next = preferredTaskId ?? current;
        return result.items.some((task) => task.id === next) ? next : result.items[0]?.id;
      });
    } catch (error) {
      message.error(`加载财务归集任务失败：${formatApiError(error)}`);
    } finally {
      setLoadingTasks(false);
    }
  }, []);

  const loadDetail = useCallback(async (taskId: string) => {
    setLoadingDetail(true);
    try {
      setDetail(await getFinancePackage(taskId));
    } catch (error) {
      message.error(`加载归集内容失败：${formatApiError(error)}`);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    setSelectedGroupId(null);
    if (selectedTaskId) {
      void loadDetail(selectedTaskId);
    } else {
      setDetail(undefined);
    }
  }, [loadDetail, selectedTaskId]);

  useEffect(() => {
    if (!analysisOpen || !selectedTaskId || !analysisJob || !["PENDING", "RUNNING"].includes(analysisJob.status)) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      void loadAnalysis(selectedTaskId, analysisJob.id).catch((error) => {
        message.error(`获取智能识别进度失败：${formatApiError(error)}`);
      });
    }, 2000);
    return () => window.clearInterval(timer);
  }, [analysisJob, analysisOpen, loadAnalysis, selectedTaskId]);

  const groups = detail?.groups ?? [];
  const items = detail?.items ?? [];
  const groupOptions = useMemo(() => buildGroupOptions(groups), [groups]);
  const visibleItems = useMemo(
    () => items.filter((item) => item.groupId === selectedGroupId),
    [items, selectedGroupId],
  );
  const selectedGroup = groups.find((group) => group.id === selectedGroupId);

  const openAnalysis = async () => {
    if (!selectedTaskId) return;
    Modal.confirm({
      title: "启动财务智能识别？",
      content: "系统将读取当前归集任务中尚未归集的有效文件，把文件名、分类、标签和已解析正文发送到已配置的 OpenAI 兼容中转站，仅生成待确认建议，不会自动修改原文件。",
      okText: "继续识别",
      cancelText: "取消",
      width: 520,
      onOk: async () => {
        setAnalysisLoading(true);
        try {
          const job = await startFinanceAnalysis(selectedTaskId);
          setAnalysisJob({ ...job, suggestions: [] });
          setAnalysisDrafts({});
          setAnalysisOpen(true);
          void loadAnalysis(selectedTaskId, job.id).catch(() => undefined);
        } catch (error) {
          message.error(`启动智能识别失败：${formatApiError(error)}`);
        } finally {
          setAnalysisLoading(false);
        }
      },
    });
  };

  const updateAnalysisDraft = (suggestionId: string, patch: Partial<AnalysisDraft>) => {
    setAnalysisDrafts((current) => ({
      ...current,
      [suggestionId]: { ...current[suggestionId], ...patch },
    }));
  };

  const confirmAnalysis = async () => {
    if (!selectedTaskId || !analysisJob || analysisJob.status !== "COMPLETED") return;
    const pendingSuggestions = analysisJob.suggestions.filter((suggestion) => suggestion.status === "PENDING");
    if (!pendingSuggestions.length) {
      message.info("当前没有待确认的建议");
      return;
    }
    setAnalysisConfirming(true);
    try {
      const result = await confirmFinanceAnalysis(selectedTaskId, analysisJob.id, {
        createGroups: true,
        suggestions: pendingSuggestions.map((suggestion) => {
          const draft = analysisDrafts[suggestion.id] ?? createAnalysisDraft(suggestion);
          return {
            suggestionId: suggestion.id,
            decision: draft.decision,
            groupId: draft.groupId === ROOT_GROUP_KEY ? null : draft.groupId || undefined,
            groupName: draft.groupName.trim() || undefined,
            materialType: draft.materialType,
            exportFileName: draft.exportFileName.trim() || undefined,
            remark: draft.remark.trim() || undefined,
          };
        }),
      });
      message.success(`已确认 ${result.confirmedCount} 份，暂不处理 ${result.rejectedCount} 份${result.createdGroupCount ? `，新建 ${result.createdGroupCount} 个目录` : ""}`);
      await Promise.all([loadDetail(selectedTaskId), loadAnalysis(selectedTaskId, analysisJob.id)]);
    } catch (error) {
      message.error(`确认智能整理失败：${formatApiError(error)}`);
    } finally {
      setAnalysisConfirming(false);
    }
  };

  const refresh = async () => {
    if (!selectedTaskId) {
      await loadTasks();
      return;
    }
    await Promise.all([loadTasks(selectedTaskId), loadDetail(selectedTaskId)]);
  };

  const openCreateTask = () => {
    const period = getCurrentChinaPeriod();
    const [year, month] = period.split("-");
    taskForm.setFieldsValue({
      name: `${year}年${Number(month)}月财务资料`,
      period,
      rootFolderName: "我界报销单(打包）",
      includeManifest: true,
      copyGroupsFromTaskId: undefined,
    });
    setTaskModalMode("create");
  };

  const openEditTask = () => {
    if (!detail) return;
    taskForm.setFieldsValue({
      name: detail.name,
      period: detail.period,
      rootFolderName: detail.rootFolderName,
      includeManifest: detail.includeManifest,
      copyGroupsFromTaskId: undefined,
    });
    setTaskModalMode("edit");
  };

  const submitTask = async () => {
    try {
      const values = await taskForm.validateFields();
      setSubmitting(true);
      if (taskModalMode === "edit" && selectedTaskId) {
        await updateFinancePackage(selectedTaskId, values);
        message.success("归集任务已更新");
        setTaskModalMode(null);
        await refresh();
      } else {
        const created = await createFinancePackage(values);
        message.success("归集任务已创建");
        setTaskModalMode(null);
        await loadTasks(created.id);
      }
    } catch (error) {
      if (isFormValidationError(error)) return;
      message.error(`保存归集任务失败：${formatApiError(error)}`);
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDeleteTask = () => {
    if (!detail) return;
    setConfirmAction({ type: "task", task: detail });
  };

  const openCreateGroup = () => {
    groupForm.setFieldsValue({ name: "", parentId: selectedGroupId ?? undefined, sort: groups.length + 1 });
    setEditingGroup(null);
    setGroupModalOpen(true);
  };

  const openEditGroup = (group: FinancePackageGroupRecord) => {
    groupForm.setFieldsValue({ name: group.name, parentId: group.parentId ?? undefined, sort: group.sort });
    setEditingGroup(group);
    setGroupModalOpen(true);
  };

  const submitGroup = async () => {
    if (!selectedTaskId) return;
    try {
      const values = await groupForm.validateFields();
      setSubmitting(true);
      if (editingGroup) {
        await updateFinancePackageGroup(selectedTaskId, editingGroup.id, {
          name: values.name,
          sort: values.sort,
        });
        message.success("目录已更新");
      } else {
        await createFinancePackageGroup(selectedTaskId, values);
        message.success("目录已创建");
      }
      setGroupModalOpen(false);
      await loadDetail(selectedTaskId);
    } catch (error) {
      if (isFormValidationError(error)) return;
      message.error(`保存目录失败：${formatApiError(error)}`);
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDeleteGroup = (group: FinancePackageGroupRecord) => {
    if (!selectedTaskId) return;
    setConfirmAction({ type: "group", group });
  };

  const loadCandidates = async (
    page = 1,
    keyword = candidateKeyword,
    filters = candidateFilters,
  ) => {
    if (!selectedTaskId) return;
    setCandidateLoading(true);
    try {
      const result = await listFinancePackageCandidates(selectedTaskId, {
        page,
        pageSize: 50,
        keyword: keyword || undefined,
        categoryId: filters.categoryPath[0],
        subcategoryId: filters.categoryPath.length > 1 ? filters.categoryPath.at(-1) : undefined,
        departmentId: filters.departmentId,
        tagId: filters.tagId,
        materialType: filters.materialType,
        uploadedFrom: filters.uploadedFrom,
        uploadedTo: filters.uploadedTo,
      });
      setCandidates(result.items);
      setCandidateTotal(result.pagination.totalItems);
      setCandidatePage(page);
    } catch (error) {
      message.error(`加载候选文件失败：${formatApiError(error)}`);
    } finally {
      setCandidateLoading(false);
    }
  };

  const openCandidates = () => {
    setSelectedCandidateIds([]);
    setCandidateKeyword("");
    setCandidateDestination(selectedGroupId ?? ROOT_GROUP_KEY);
    setCandidateFilters(EMPTY_CANDIDATE_FILTERS);
    setCandidateMaterialType(undefined);
    setCandidateOpen(true);
    void loadCandidates(1, "", EMPTY_CANDIDATE_FILTERS);
  };

  const updateCandidateFilters = (filters: CandidateFilters) => {
    setCandidateFilters(filters);
    void loadCandidates(1, candidateKeyword, filters);
  };

  const resetCandidateFilters = () => {
    updateCandidateFilters(EMPTY_CANDIDATE_FILTERS);
  };

  const addCandidates = async () => {
    if (!selectedTaskId || !selectedCandidateIds.length) {
      message.warning("请先选择要加入的文件");
      return;
    }
    setSubmitting(true);
    try {
      const result = await addFinancePackageItems(selectedTaskId, {
        documentIds: selectedCandidateIds,
        groupId: candidateDestination === ROOT_GROUP_KEY ? null : candidateDestination,
        materialType: candidateMaterialType,
      });
      message.success(`已加入 ${result.addedCount} 份文件${result.skippedCount ? `，跳过 ${result.skippedCount} 份` : ""}`);
      setSelectedCandidateIds([]);
      setCandidateOpen(false);
      await loadDetail(selectedTaskId);
    } catch (error) {
      message.error(`加入文件失败：${formatApiError(error)}`);
    } finally {
      setSubmitting(false);
    }
  };

  const openEditItem = (item: FinancePackageItemRecord) => {
    itemForm.setFieldsValue({
      groupId: item.groupId ?? ROOT_GROUP_KEY,
      materialType: item.materialType,
      exportFileName: item.exportFileName ?? item.version.originalFileName,
      remark: item.remark ?? undefined,
    });
    setEditingItem(item);
  };

  const submitItem = async () => {
    if (!selectedTaskId || !editingItem) return;
    try {
      const values = await itemForm.validateFields();
      setSubmitting(true);
      await updateFinancePackageItem(selectedTaskId, editingItem.id, {
        ...values,
        groupId: values.groupId === ROOT_GROUP_KEY ? null : values.groupId,
      });
      message.success("归集文件已更新");
      setEditingItem(null);
      await loadDetail(selectedTaskId);
    } catch (error) {
      if (isFormValidationError(error)) return;
      message.error(`更新归集文件失败：${formatApiError(error)}`);
    } finally {
      setSubmitting(false);
    }
  };

  const useLatestVersion = async (item: FinancePackageItemRecord) => {
    if (!selectedTaskId) return;
    try {
      await updateFinancePackageItem(selectedTaskId, item.id, { useLatestVersion: true });
      message.success("已改用最新版本");
      await loadDetail(selectedTaskId);
    } catch (error) {
      message.error(`切换版本失败：${formatApiError(error)}`);
    }
  };

  const downloadLockedVersion = async (item: FinancePackageItemRecord) => {
    try {
      const blob = await downloadDocumentBlob(item.documentId, item.versionId);
      saveBlob(blob, item.exportFileName || item.version.originalFileName);
    } catch (error) {
      message.error(`下载文件失败：${formatApiError(error)}`);
    }
  };

  const confirmRemoveItem = (item: FinancePackageItemRecord) => {
    if (!selectedTaskId) return;
    setConfirmAction({ type: "item", item });
  };

  const submitConfirmAction = async () => {
    if (!confirmAction) return;
    setSubmitting(true);
    try {
      if (confirmAction.type === "task") {
        await deleteFinancePackage(confirmAction.task.id);
        message.success("归集任务已删除，原文件保持不变");
        setConfirmAction(null);
        setSelectedTaskId(undefined);
        setDetail(undefined);
        await loadTasks();
      } else if (confirmAction.type === "group") {
        if (!selectedTaskId) return;
        await deleteFinancePackageGroup(selectedTaskId, confirmAction.group.id);
        if (selectedGroupId === confirmAction.group.id) setSelectedGroupId(null);
        message.success("目录已删除");
        setConfirmAction(null);
        await loadDetail(selectedTaskId);
      } else {
        if (!selectedTaskId) return;
        await deleteFinancePackageItem(selectedTaskId, confirmAction.item.id);
        message.success("文件已从归集任务移除");
        setConfirmAction(null);
        await loadDetail(selectedTaskId);
      }
    } catch (error) {
      const actionLabel = confirmAction.type === "task" ? "删除归集任务" : confirmAction.type === "group" ? "删除目录" : "移出文件";
      message.error(`${actionLabel}失败：${formatApiError(error)}`);
    } finally {
      setSubmitting(false);
    }
  };

  const exportPackage = async () => {
    if (!selectedTaskId) return;
    setExporting(true);
    try {
      const result = await exportFinancePackageBlob(selectedTaskId);
      saveBlob(result.blob, result.fileName);
      message.success("财务交付包已生成");
      await refresh();
    } catch (error) {
      message.error(`生成交付包失败：${formatApiError(error)}`);
    } finally {
      setExporting(false);
    }
  };

  if (loadingTasks && !tasks.length) {
    return <div className="loading-state"><Spin size="large" /></div>;
  }

  return (
    <div className="page-stack finance-page">
      <section className="page-band finance-task-band">
        <div className="page-band-header">
          <div className="finance-task-heading">
            <Title level={2} className="page-title">财务月度归集</Title>
            <Select
              className="finance-task-select"
              value={selectedTaskId}
              placeholder="选择归集任务"
              options={tasks.map((task) => ({ value: task.id, label: `${task.period} · ${task.name}` }))}
              onChange={setSelectedTaskId}
            />
          </div>
          <Space wrap>
            <Tooltip title="刷新">
              <Button icon={<ReloadOutlined />} aria-label="刷新财务归集" onClick={() => void refresh()} />
            </Tooltip>
            {detail && (
              <>
                <Button icon={<RobotOutlined />} loading={analysisLoading} onClick={() => void openAnalysis()}>
                  智能识别归集
                </Button>
                <Tooltip title="任务设置">
                  <Button icon={<SettingOutlined />} aria-label="任务设置" onClick={openEditTask} />
                </Tooltip>
                <Tooltip title="删除任务">
                  <Button danger icon={<DeleteOutlined />} aria-label="删除任务" onClick={confirmDeleteTask} />
                </Tooltip>
                <Button type="primary" icon={<DownloadOutlined />} loading={exporting} onClick={() => void exportPackage()}>
                  生成交付包
                </Button>
              </>
            )}
            <Button icon={<FileAddOutlined />} onClick={openCreateTask}>新建归集</Button>
          </Space>
        </div>
        {detail && (
          <div className="finance-summary-strip" aria-label="归集任务概况">
            <SummaryItem label="归属月份" value={detail.period} />
            <SummaryItem label="交付总目录" value={detail.rootFolderName} wide />
            <SummaryItem label="事项目录" value={`${groups.length} 个`} />
            <SummaryItem label="已归集文件" value={`${items.length} 份`} />
            <SummaryItem label="最近导出" value={detail.lastExportedAt ? formatDate(detail.lastExportedAt) : "尚未导出"} />
          </div>
        )}
      </section>

      {!detail ? (
        <section className="page-band">
          <Empty description="暂无财务归集任务">
            <Button type="primary" icon={<FileAddOutlined />} onClick={openCreateTask}>新建月度归集</Button>
          </Empty>
        </section>
      ) : (
        <>
          {!!detail.validation?.issues.length && (
            <Alert
              type="warning"
              showIcon
              message="交付检查"
              description={<Space wrap>{detail.validation.issues.map((issue) => <Tag key={issue.code}>{issue.message}</Tag>)}</Space>}
            />
          )}
          <div className="finance-workspace">
            <FinanceDirectoryPane
              rootName={detail.rootFolderName}
              groups={groups}
              items={items}
              selectedGroupId={selectedGroupId}
              onSelect={setSelectedGroupId}
              onCreate={openCreateGroup}
              onEdit={openEditGroup}
              onDelete={confirmDeleteGroup}
            />
            <section className="page-band finance-files-pane">
              <div className="section-toolbar finance-files-toolbar">
                <div>
                  <Title level={4} className="section-title">{selectedGroup?.name ?? "总目录文件"}</Title>
                  <Text type="secondary">{visibleItems.length} 份文件</Text>
                </div>
                <Button type="primary" icon={<FileAddOutlined />} onClick={openCandidates}>加入文件</Button>
              </div>
              <FinanceItemList
                loading={loadingDetail}
                items={visibleItems}
                onOpen={onOpenDocument}
                onDownload={downloadLockedVersion}
                onEdit={openEditItem}
                onUseLatest={useLatestVersion}
                onRemove={confirmRemoveItem}
              />
            </section>
          </div>
        </>
      )}

      <Modal
        title="智能识别与归集建议"
        open={analysisOpen}
        width={1080}
        okText="确认并归集"
        cancelText="关闭"
        confirmLoading={analysisConfirming}
        okButtonProps={{ disabled: analysisJob?.status !== "COMPLETED" || !analysisJob.suggestions.some((item) => item.status === "PENDING") }}
        onOk={() => void confirmAnalysis()}
        onCancel={() => setAnalysisOpen(false)}
        destroyOnHidden
      >
        <AnalysisReview
          job={analysisJob}
          drafts={analysisDrafts}
          groups={groups}
          onOpenDocument={onOpenDocument}
          onChange={updateAnalysisDraft}
        />
      </Modal>

      <Modal
        title={taskModalMode === "edit" ? "归集任务设置" : "新建月度归集"}
        open={taskModalMode !== null}
        okText="保存"
        cancelText="取消"
        confirmLoading={submitting}
        onOk={() => void submitTask()}
        onCancel={() => setTaskModalMode(null)}
        destroyOnHidden
      >
        <Form form={taskForm} layout="vertical" requiredMark={false}>
          <Form.Item name="name" label="任务名称" rules={[{ required: true, message: "请输入任务名称" }]}>
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item name="period" label="归属月份" rules={[{ required: true, message: "请选择归属月份" }]}>
            <Input type="month" />
          </Form.Item>
          <Form.Item name="rootFolderName" label="交付总目录名称" rules={[{ required: true, message: "请输入总目录名称" }]}>
            <Input maxLength={120} />
          </Form.Item>
          {taskModalMode === "create" && !!tasks.length && (
            <Form.Item name="copyGroupsFromTaskId" label="复制已有目录结构">
              <Select allowClear placeholder="不复制" options={tasks.map((task) => ({ value: task.id, label: `${task.period} · ${task.name}` }))} />
            </Form.Item>
          )}
          <Form.Item name="includeManifest" valuePropName="checked">
            <Checkbox>生成文件清单.xlsx</Checkbox>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingGroup ? "编辑交付目录" : "新增交付目录"}
        open={groupModalOpen}
        okText="保存"
        cancelText="取消"
        confirmLoading={submitting}
        onOk={() => void submitGroup()}
        onCancel={() => setGroupModalOpen(false)}
        destroyOnHidden
      >
        <Form form={groupForm} layout="vertical" requiredMark={false}>
          <Form.Item name="name" label="目录名称" rules={[{ required: true, message: "请输入目录名称" }]}>
            <Input maxLength={120} autoFocus />
          </Form.Item>
          {!editingGroup && (
            <Form.Item name="parentId" label="上级目录">
              <Select allowClear placeholder="总目录" options={groupOptions} />
            </Form.Item>
          )}
          <Form.Item name="sort" label="排序" rules={[{ required: true, message: "请输入排序" }]}>
            <InputNumber min={0} max={100000} precision={0} className="finance-number-input" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="整理归集文件"
        open={!!editingItem}
        okText="保存"
        cancelText="取消"
        confirmLoading={submitting}
        onOk={() => void submitItem()}
        onCancel={() => setEditingItem(null)}
        destroyOnHidden
      >
        <Form form={itemForm} layout="vertical" requiredMark={false}>
          <Form.Item name="groupId" label="交付目录" rules={[{ required: true, message: "请选择交付目录" }]}>
            <Select options={[{ value: ROOT_GROUP_KEY, label: "总目录" }, ...groupOptions]} />
          </Form.Item>
          <Form.Item name="materialType" label="材料类型" rules={[{ required: true }]}>
            <Select options={MATERIAL_TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item name="exportFileName" label="导出文件名" rules={[{ required: true, message: "请输入导出文件名" }]}>
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea maxLength={500} rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={confirmAction?.type === "task" ? "删除归集任务" : confirmAction?.type === "group" ? "删除交付目录" : "从归集任务移除"}
        open={!!confirmAction}
        okText={confirmAction?.type === "item" ? "移除" : "删除"}
        okButtonProps={{ danger: true }}
        cancelText="取消"
        confirmLoading={submitting}
        onOk={() => void submitConfirmAction()}
        onCancel={() => setConfirmAction(null)}
        destroyOnHidden
      >
        <Typography.Paragraph>
          {confirmAction?.type === "task"
            ? `确定删除“${confirmAction.task.name}”吗？原文件不会被删除。`
            : confirmAction?.type === "group"
              ? `确定删除“${confirmAction.group.name}”吗？非空目录不能删除。`
              : confirmAction
                ? `确定移除“${confirmAction.item.document.title}”吗？文件中心中的原文件不会删除。`
                : ""}
        </Typography.Paragraph>
      </Modal>

      <CandidateDrawer
        open={candidateOpen}
        loading={candidateLoading}
        submitting={submitting}
        candidates={candidates}
        total={candidateTotal}
        page={candidatePage}
        keyword={candidateKeyword}
        destination={candidateDestination}
        categories={categories}
        departments={departments}
        tags={tags}
        filters={candidateFilters}
        materialType={candidateMaterialType}
        groupOptions={groupOptions}
        selectedIds={selectedCandidateIds}
        onKeywordChange={setCandidateKeyword}
        onSearch={() => void loadCandidates(1)}
        onPageChange={(page) => void loadCandidates(page)}
        onDestinationChange={setCandidateDestination}
        onFiltersChange={updateCandidateFilters}
        onMaterialTypeChange={setCandidateMaterialType}
        onResetFilters={resetCandidateFilters}
        onSelectionChange={setSelectedCandidateIds}
        onOpenDocument={onOpenDocument}
        onAdd={() => void addCandidates()}
        onClose={() => setCandidateOpen(false)}
      />
    </div>
  );
}

function FinanceDirectoryPane({
  rootName,
  groups,
  items,
  selectedGroupId,
  onSelect,
  onCreate,
  onEdit,
  onDelete,
}: {
  rootName: string;
  groups: FinancePackageGroupRecord[];
  items: FinancePackageItemRecord[];
  selectedGroupId: string | null;
  onSelect: (id: string | null) => void;
  onCreate: () => void;
  onEdit: (group: FinancePackageGroupRecord) => void;
  onDelete: (group: FinancePackageGroupRecord) => void;
}) {
  const treeData = useMemo<DataNode[]>(
    () => buildGroupTree(groups, items, onEdit, onDelete),
    [groups, items, onDelete, onEdit],
  );
  const rootCount = items.filter((item) => !item.groupId).length;
  return (
    <aside className="page-band finance-directory-pane">
      <div className="section-toolbar finance-directory-toolbar">
        <Title level={4} className="section-title">交付目录</Title>
        <Tooltip title="新增目录">
          <Button size="small" icon={<FolderAddOutlined />} aria-label="新增交付目录" onClick={onCreate} />
        </Tooltip>
      </div>
      <button
        type="button"
        className={`finance-root-directory${selectedGroupId === null ? " is-selected" : ""}`}
        onClick={() => onSelect(null)}
      >
        <FolderOpenOutlined />
        <span>{rootName}</span>
        <Tag>{rootCount}</Tag>
      </button>
      {treeData.length ? (
        <Tree
          blockNode
          defaultExpandAll
          selectedKeys={selectedGroupId ? [selectedGroupId] : []}
          treeData={treeData}
          onSelect={(keys) => keys[0] && onSelect(String(keys[0]))}
        />
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无事项目录" />
      )}
    </aside>
  );
}

function FinanceItemList({
  loading,
  items,
  onOpen,
  onDownload,
  onEdit,
  onUseLatest,
  onRemove,
}: {
  loading: boolean;
  items: FinancePackageItemRecord[];
  onOpen: (document: DocumentRecord) => void;
  onDownload: (item: FinancePackageItemRecord) => void;
  onEdit: (item: FinancePackageItemRecord) => void;
  onUseLatest: (item: FinancePackageItemRecord) => void;
  onRemove: (item: FinancePackageItemRecord) => void;
}) {
  if (loading) return <div className="finance-pane-loading"><Spin /></div>;
  if (!items.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前目录暂无文件" />;
  return (
    <div className="finance-file-list">
      {items.map((item) => {
        const isOutdated = !!item.document.currentVersionId && item.versionId !== item.document.currentVersionId;
        return (
          <article className="finance-file-row" key={item.id}>
            <div className="finance-file-main">
              <Button type="link" className="finance-file-title" onClick={() => onOpen(item.document)}>
                {item.exportFileName || item.version.originalFileName}
              </Button>
              <div className="finance-file-meta">
                <Tag color="blue">{MATERIAL_TYPE_LABELS[item.materialType]}</Tag>
                <Text type="secondary">{item.version.versionLabel}</Text>
                <Text type="secondary">{formatFileSize(item.version.fileSize)}</Text>
                {isOutdated && <Tag color="orange">已有新版本</Tag>}
              </div>
              {item.exportFileName && item.exportFileName !== item.version.originalFileName && (
                <Text type="secondary" className="finance-original-name">原文件：{item.version.originalFileName}</Text>
              )}
            </div>
            <Space className="finance-file-actions" wrap>
              {isOutdated && (
                <Tooltip title="改用最新版本">
                  <Button size="small" icon={<SyncOutlined />} aria-label="改用最新版本" onClick={() => onUseLatest(item)} />
                </Tooltip>
              )}
              <Tooltip title="查看详情"><Button size="small" icon={<EyeOutlined />} aria-label="查看文件详情" onClick={() => onOpen(item.document)} /></Tooltip>
              <Tooltip title="下载锁定版本"><Button size="small" icon={<DownloadOutlined />} aria-label="下载锁定版本" onClick={() => onDownload(item)} /></Tooltip>
              <Tooltip title="整理"><Button size="small" icon={<EditOutlined />} aria-label="整理归集文件" onClick={() => onEdit(item)} /></Tooltip>
              <Tooltip title="移出归集"><Button size="small" danger icon={<DeleteOutlined />} aria-label="移出归集" onClick={() => onRemove(item)} /></Tooltip>
            </Space>
          </article>
        );
      })}
    </div>
  );
}

function CandidateDrawer({
  open,
  loading,
  submitting,
  candidates,
  total,
  page,
  keyword,
  destination,
  categories,
  departments,
  tags,
  filters,
  materialType,
  groupOptions,
  selectedIds,
  onKeywordChange,
  onSearch,
  onPageChange,
  onDestinationChange,
  onFiltersChange,
  onMaterialTypeChange,
  onResetFilters,
  onSelectionChange,
  onOpenDocument,
  onAdd,
  onClose,
}: {
  open: boolean;
  loading: boolean;
  submitting: boolean;
  candidates: FinancePackageCandidate[];
  total: number;
  page: number;
  keyword: string;
  destination: string;
  categories: CategoryNode[];
  departments: DepartmentRecord[];
  tags: TagRecord[];
  filters: CandidateFilters;
  materialType?: FinanceMaterialType;
  groupOptions: Array<{ value: string; label: string }>;
  selectedIds: string[];
  onKeywordChange: (value: string) => void;
  onSearch: () => void;
  onPageChange: (page: number) => void;
  onDestinationChange: (value: string) => void;
  onFiltersChange: (filters: CandidateFilters) => void;
  onMaterialTypeChange: (value: FinanceMaterialType | undefined) => void;
  onResetFilters: () => void;
  onSelectionChange: (ids: string[]) => void;
  onOpenDocument: (document: DocumentRecord) => void;
  onAdd: () => void;
  onClose: () => void;
}) {
  const categoryOptions = toFinanceCategoryOptions(categories);
  const columns: ColumnsType<FinancePackageCandidate> = [
    {
      title: "文件名称",
      key: "document",
      render: (_, candidate) => (
        <div className="finance-candidate-file">
          <Button type="link" onClick={() => onOpenDocument(candidate.document)}>{candidate.document.title}</Button>
          <Text type="secondary">{candidate.document.currentVersion?.originalFileName}</Text>
        </div>
      ),
    },
    {
      title: "原文件分类",
      width: 170,
      render: (_, candidate) => getFinanceCategoryPathText(categories, candidate.document),
    },
    {
      title: "材料类型",
      width: 110,
      render: (_, candidate) => <Tag color="blue">{MATERIAL_TYPE_LABELS[candidate.materialType]}</Tag>,
    },
    {
      title: "部门 / 标签",
      width: 210,
      render: (_, candidate) => (
        <Space size={[4, 4]} wrap>
          {candidate.document.department?.name && <Tag>{candidate.document.department.name}</Tag>}
          {(candidate.document.documentTags ?? []).map(({ tag }) => <Tag color="green" key={tag.id}>{tag.name}</Tag>)}
          {!candidate.document.department?.name && !candidate.document.documentTags?.length && <Text type="secondary">未设置</Text>}
        </Space>
      ),
    },
    {
      title: "上传时间",
      width: 120,
      render: (_, candidate) => formatDate(candidate.document.createdAt),
    },
  ];
  return (
    <Drawer
      title="加入归集文件"
      open={open}
      width={820}
      onClose={onClose}
      extra={<Button type="primary" icon={<FileAddOutlined />} loading={submitting} onClick={onAdd}>加入所选</Button>}
    >
      <div className="finance-candidate-toolbar">
        <Input.Search
          value={keyword}
          placeholder="搜索文件名、分类、标签或正文"
          allowClear
          enterButton
          onChange={(event) => onKeywordChange(event.target.value)}
          onSearch={onSearch}
        />
        <Select
          value={destination}
          aria-label="目标交付目录"
          placeholder="目标交付目录"
          options={[{ value: ROOT_GROUP_KEY, label: "总目录" }, ...groupOptions]}
          onChange={onDestinationChange}
        />
      </div>
      <div className="finance-candidate-filter-panel">
        <div className="finance-candidate-filter-grid">
          <Cascader
            value={filters.categoryPath}
            options={categoryOptions}
            allowClear
            changeOnSelect
            showSearch
            placeholder="原文件分类"
            aria-label="原文件分类"
            onChange={(value) => onFiltersChange({ ...filters, categoryPath: value.map(String) })}
          />
          <Select
            allowClear
            value={filters.materialType}
            options={MATERIAL_TYPE_OPTIONS}
            placeholder="材料类型"
            aria-label="材料类型筛选"
            onChange={(value) => onFiltersChange({ ...filters, materialType: value as FinanceMaterialType | undefined })}
          />
          <Select
            allowClear
            value={filters.departmentId}
            options={departments.map((department) => ({ label: department.name, value: department.id }))}
            placeholder="所属部门"
            aria-label="所属部门"
            onChange={(value) => onFiltersChange({ ...filters, departmentId: value })}
          />
          <Select
            allowClear
            value={filters.tagId}
            options={tags.map((tag) => ({ label: tag.name, value: tag.id }))}
            placeholder="文件标签"
            aria-label="文件标签"
            onChange={(value) => onFiltersChange({ ...filters, tagId: value })}
          />
          <Input
            type="date"
            value={filters.uploadedFrom ?? ""}
            aria-label="上传开始日期"
            title="上传开始日期"
            onChange={(event) => onFiltersChange({ ...filters, uploadedFrom: event.target.value || undefined })}
          />
          <Input
            type="date"
            value={filters.uploadedTo ?? ""}
            aria-label="上传结束日期"
            title="上传结束日期"
            onChange={(event) => onFiltersChange({ ...filters, uploadedTo: event.target.value || undefined })}
          />
        </div>
        <div className="finance-candidate-filter-actions">
          <Select
            allowClear
            value={materialType}
            options={MATERIAL_TYPE_OPTIONS}
            placeholder="统一材料类型（可选）"
            aria-label="统一材料类型"
            onChange={(value) => onMaterialTypeChange(value as FinanceMaterialType | undefined)}
          />
          <Button icon={<FilterOutlined />} onClick={onSearch}>应用筛选</Button>
          <Tooltip title="清除筛选">
            <Button icon={<ClearOutlined />} aria-label="清除筛选" onClick={onResetFilters} />
          </Tooltip>
        </div>
      </div>
      <Table
        rowKey={(candidate) => candidate.document.id}
        tableLayout="fixed"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={candidates}
        rowSelection={{ selectedRowKeys: selectedIds, onChange: (keys) => onSelectionChange(keys.map(String)) }}
        pagination={{ current: page, pageSize: 50, total, showSizeChanger: false, onChange: onPageChange }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有可加入的候选文件" /> }}
      />
    </Drawer>
  );
}

function AnalysisReview({
  job,
  drafts,
  groups,
  onOpenDocument,
  onChange,
}: {
  job: FinanceAnalysisJobDetail | null;
  drafts: Record<string, AnalysisDraft>;
  groups: FinancePackageGroupRecord[];
  onOpenDocument: (document: DocumentRecord) => void;
  onChange: (suggestionId: string, patch: Partial<AnalysisDraft>) => void;
}) {
  if (!job) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="正在准备智能识别" />;
  }
  if (job.status === "PENDING" || job.status === "RUNNING") {
    const percent = job.totalCount ? Math.round((job.processedCount / job.totalCount) * 100) : 0;
    return (
      <div className="finance-analysis-progress">
        <Spin />
        <Title level={4}>正在读取文件内容并生成建议</Title>
        <Text type="secondary">已处理 {job.processedCount} / {job.totalCount} 份文件（{percent}%）</Text>
        <Text type="secondary">识别结果生成后仍需人工确认，当前不会改变归集目录。</Text>
      </div>
    );
  }
  if (job.status === "FAILED") {
    return <Alert type="error" showIcon message="智能识别失败" description={job.errorMessage ?? "服务未返回具体原因"} />;
  }
  if (!job.suggestions.length) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有生成可确认的建议" />;
  }

  const groupOptions = [
    { value: ROOT_GROUP_KEY, label: "总目录（不创建事项目录）" },
    ...groups.map((group) => ({ value: group.id, label: getGroupPathLabel(groups, group.id) })),
  ];
  return (
    <div className="finance-analysis-review">
      <Alert
        type="info"
        showIcon
        message={`已生成 ${job.suggestions.length} 份建议，请逐项检查后确认`}
        description={job.errorMessage ?? `模型：${job.model ?? "未记录"} · 请求 ${job.requestCount} 次${job.totalTokens === null ? "" : ` · token ${job.totalTokens}`} · 结果仅作为草稿，不会自动修改原文件分类`}
      />
      <div className="finance-analysis-list">
        {job.suggestions.map((suggestion) => {
          const draft = drafts[suggestion.id] ?? createAnalysisDraft(suggestion);
          const fields = suggestion.extractedFields;
          return (
            <article className={`finance-analysis-card${draft.decision === "REJECT" ? " is-rejected" : ""}`} key={suggestion.id}>
              <div className="finance-analysis-card-header">
                <div className="finance-analysis-file">
                  <Button type="link" onClick={() => onOpenDocument(suggestion.document)}>{suggestion.document.title}</Button>
                  <Text type="secondary">{suggestion.version.originalFileName}</Text>
                </div>
                <Space wrap>
                  <Tag color={suggestion.confidence !== null && suggestion.confidence >= 0.75 ? "green" : "orange"}>
                    置信度 {suggestion.confidence === null ? "未评估" : `${Math.round(suggestion.confidence * 100)}%`}
                  </Tag>
                  <Select
                    value={draft.decision}
                    aria-label={`${suggestion.document.title}处理决定`}
                    options={[{ value: "CONFIRM", label: "纳入归集" }, { value: "REJECT", label: "暂不处理" }]}
                    onChange={(value) => onChange(suggestion.id, { decision: value as AnalysisDraft["decision"] })}
                  />
                </Space>
              </div>
              <div className="finance-analysis-fields">
                <Tag color="blue">{MATERIAL_TYPE_LABELS[draft.materialType]}</Tag>
                {fields.expensePerson && <Tag>报销人：{fields.expensePerson}</Tag>}
                {fields.documentDate && <Tag>日期：{fields.documentDate}</Tag>}
                {fields.amount !== null && <Tag>金额：{fields.amount}</Tag>}
                {fields.merchant && <Tag>商户：{fields.merchant}</Tag>}
                {fields.project && <Tag>项目：{fields.project}</Tag>}
                {!fields.expensePerson && !fields.documentDate && fields.amount === null && !fields.merchant && !fields.project && <Text type="secondary">未识别到结构化字段</Text>}
              </div>
              <div className="finance-analysis-edit-grid">
                <Input
                  value={draft.groupName}
                  aria-label={`${suggestion.document.title}建议目录`}
                  addonBefore="事项目录"
                  disabled={draft.decision === "REJECT"}
                  onChange={(event) => onChange(suggestion.id, { groupName: event.target.value })}
                />
                <Select
                  allowClear
                  value={draft.groupId}
                  placeholder="选择已有目录；不选则新建建议目录"
                  aria-label={`${suggestion.document.title}目标目录`}
                  options={groupOptions}
                  disabled={draft.decision === "REJECT"}
                  onChange={(value) => onChange(suggestion.id, { groupId: value })}
                />
                <Select
                  value={draft.materialType}
                  options={MATERIAL_TYPE_OPTIONS}
                  aria-label={`${suggestion.document.title}材料类型`}
                  disabled={draft.decision === "REJECT"}
                  onChange={(value) => onChange(suggestion.id, { materialType: value as FinanceMaterialType })}
                />
                <Input
                  value={draft.exportFileName}
                  aria-label={`${suggestion.document.title}导出文件名`}
                  addonBefore="导出名称"
                  disabled={draft.decision === "REJECT"}
                  onChange={(event) => onChange(suggestion.id, { exportFileName: event.target.value })}
                />
              </div>
              <Text type="secondary">依据：{suggestion.reasons.join("；")}</Text>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function createAnalysisDraft(suggestion: FinanceAnalysisSuggestionRecord): AnalysisDraft {
  return {
    decision: "CONFIRM",
    groupName: suggestion.suggestedGroupName,
    materialType: suggestion.materialType,
    exportFileName: suggestion.suggestedFileName,
    remark: "",
  };
}

function getGroupPathLabel(groups: FinancePackageGroupRecord[], groupId: string) {
  const byId = new Map(groups.map((group) => [group.id, group]));
  const names: string[] = [];
  let current = byId.get(groupId);
  while (current) {
    names.unshift(current.name);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return names.join(" / ");
}

function SummaryItem({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return <div className={`finance-summary-item${wide ? " is-wide" : ""}`}><Text type="secondary">{label}</Text><Text strong>{value}</Text></div>;
}

function buildGroupTree(
  groups: FinancePackageGroupRecord[],
  items: FinancePackageItemRecord[],
  onEdit: (group: FinancePackageGroupRecord) => void,
  onDelete: (group: FinancePackageGroupRecord) => void,
  parentId: string | null = null,
): DataNode[] {
  return groups
    .filter((group) => group.parentId === parentId)
    .sort((left, right) => left.sort - right.sort || left.name.localeCompare(right.name, "zh-CN"))
    .map((group) => ({
      key: group.id,
      title: (
        <div className="finance-tree-title">
          <span>{group.name}</span>
          <span className="finance-tree-actions">
            <Tag>{items.filter((item) => item.groupId === group.id).length}</Tag>
            <Button type="text" size="small" icon={<EditOutlined />} aria-label={`编辑${group.name}`} onClick={(event) => { event.stopPropagation(); onEdit(group); }} />
            <Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label={`删除${group.name}`} onClick={(event) => { event.stopPropagation(); onDelete(group); }} />
          </span>
        </div>
      ),
      children: buildGroupTree(groups, items, onEdit, onDelete, group.id),
    }));
}

function buildGroupOptions(groups: FinancePackageGroupRecord[]) {
  const options: Array<{ value: string; label: string }> = [];
  const visit = (parentId: string | null, depth: number) => {
    groups
      .filter((group) => group.parentId === parentId)
      .sort((left, right) => left.sort - right.sort || left.name.localeCompare(right.name, "zh-CN"))
      .forEach((group) => {
        options.push({ value: group.id, label: `${"　".repeat(depth)}${group.name}` });
        visit(group.id, depth + 1);
      });
  };
  visit(null, 0);
  return options;
}

function toFinanceCategoryOptions(nodes: CategoryNode[]): NonNullable<CascaderProps["options"]> {
  return nodes.map((node) => ({
    value: node.id,
    label: node.name,
    children: node.children?.length ? toFinanceCategoryOptions(node.children) : undefined,
  }));
}

function getFinanceCategoryPathText(categories: CategoryNode[], document: DocumentRecord) {
  const targetId = document.subcategoryId ?? document.categoryId;
  const path = findFinanceCategoryPath(categories, targetId);
  return path.length ? path.map((category) => category.name).join(" / ") : "未分类";
}

function findFinanceCategoryPath(nodes: CategoryNode[], targetId: string): CategoryNode[] {
  for (const node of nodes) {
    if (node.id === targetId) {
      return [node];
    }
    const childPath = findFinanceCategoryPath(node.children ?? [], targetId);
    if (childPath.length) {
      return [node, ...childPath];
    }
  }
  return [];
}

function getCurrentChinaPeriod() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 7);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function isFormValidationError(error: unknown) {
  return !!error && typeof error === "object" && "errorFields" in error;
}
