import {
  DeleteOutlined,
  EditOutlined,
  FolderAddOutlined,
  MergeCellsOutlined,
  PlusOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import {
  Alert,
  Button,
  Col,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  Tree,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import {
  createCategory,
  createDepartment,
  createPartner,
  createTag,
  deleteCategory,
  deleteDepartment,
  deletePartner,
  deleteTag,
  formatApiError,
  listCategories,
  listDepartments,
  listPartners,
  listTags,
  mergeTags,
  updateCategory,
  updateDepartment,
  updatePartner,
  updateTag,
} from "./api";
import type {
  CategoryNode,
  DepartmentRecord,
  PartnerRecord,
  PartnerStatus,
  PartnerType,
  PublicUser,
  TagRecord,
} from "./types";

interface TreeItem {
  title: string;
  key: string;
  children?: TreeItem[];
}

export function CategoryManagementPage({
  currentUser,
  categories,
  loading,
}: {
  currentUser: PublicUser;
  categories: CategoryNode[];
  loading: boolean;
}) {
  const [records, setRecords] = useState<CategoryNode[]>(categories);
  const [tableLoading, setTableLoading] = useState(loading);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryNode | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();
  const isAdmin = currentUser.role === "ADMIN";

  useEffect(() => setRecords(categories), [categories]);
  useEffect(() => setTableLoading(loading), [loading]);

  const flatRecords = useMemo(() => flattenCategories(records), [records]);
  const primaryCategories = flatRecords.filter((item) => item.level === 1);
  const secondLevel = flatRecords.filter((item) => item.level === 2);
  const treeData = useMemo(() => toCategoryTree(records), [records]);

  const reload = async () => {
    setTableLoading(true);
    try {
      setRecords(await listCategories());
    } catch (error) {
      message.error(formatApiError(error));
    } finally {
      setTableLoading(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ parentId: primaryCategories[0]?.id, sort: 0 });
    setModalOpen(true);
  };

  const openEdit = (record: CategoryNode) => {
    setEditing(record);
    form.setFieldsValue({ name: record.name, parentId: record.parentId, sort: record.sort });
    setModalOpen(true);
  };

  const submit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      if (editing) {
        await updateCategory(editing.id, { name: values.name, sort: values.sort });
        message.success("分类已更新");
      } else {
        await createCategory(values);
        message.success("二级分类已创建");
      }
      setModalOpen(false);
      form.resetFields();
      await reload();
    } catch (error) {
      if (error !== undefined) {
        message.error(formatApiError(error));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const remove = (record: CategoryNode) => {
    Modal.confirm({
      title: "删除二级分类",
      content: `确认删除“${record.name}”？一级分类和系统分类不会被删除。`,
      okText: "删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteCategory(record.id);
          message.success("分类已删除");
          await reload();
        } catch (error) {
          message.error(formatApiError(error));
        }
      },
    });
  };

  const columns: ColumnsType<CategoryNode> = [
    { title: "二级分类", dataIndex: "name" },
    {
      title: "所属一级分类",
      dataIndex: "parentId",
      render: (value) => primaryCategories.find((item) => item.id === value)?.name ?? "-",
    },
    { title: "排序", dataIndex: "sort", width: 120 },
    {
      title: "操作",
      width: 180,
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} disabled={!isAdmin} onClick={() => openEdit(record)}>
            编辑
          </Button>
          <Button size="small" danger icon={<DeleteOutlined />} disabled={!isAdmin} onClick={() => remove(record)}>
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div className="page-stack">
      <PageHeader
        title="分类管理"
        lead="一级分类固定不变；管理员可以在一级分类下维护二级树形分类，用于文件上传和检索。"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={reload}>
              刷新
            </Button>
            <Button type="primary" icon={<FolderAddOutlined />} disabled={!isAdmin} onClick={openCreate}>
              新增二级分类
            </Button>
          </Space>
        }
      />
      {!isAdmin ? <Alert type="info" showIcon message="员工可以查看分类；新增、编辑和删除由管理员处理。" /> : null}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <section className="page-band">
            {treeData.length ? <Tree treeData={treeData} defaultExpandAll /> : <Empty description="暂无分类" />}
          </section>
        </Col>
        <Col xs={24} lg={16}>
          <section className="page-band">
            <Table rowKey="id" loading={tableLoading} dataSource={secondLevel} columns={columns} pagination={false} />
          </section>
        </Col>
      </Row>

      <Modal
        title={editing ? "编辑二级分类" : "新增二级分类"}
        open={modalOpen}
        onOk={submit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={submitting}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="parentId" label="所属一级分类" rules={[{ required: true, message: "请选择一级分类" }]}>
            <Select disabled={Boolean(editing)} options={primaryCategories.map((item) => ({ label: item.name, value: item.id }))} />
          </Form.Item>
          <Form.Item name="name" label="分类名称" rules={[{ required: true, message: "请输入分类名称" }]}>
            <Input maxLength={50} />
          </Form.Item>
          <Form.Item name="sort" label="排序">
            <InputNumber min={0} precision={0} className="full-width-control" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export function DepartmentManagementPage({
  currentUser,
  departments,
  loading,
}: {
  currentUser: PublicUser;
  departments: DepartmentRecord[];
  loading: boolean;
}) {
  const [records, setRecords] = useState<DepartmentRecord[]>(departments);
  const [tableLoading, setTableLoading] = useState(loading);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DepartmentRecord | null>(null);
  const [form] = Form.useForm();
  const isAdmin = currentUser.role === "ADMIN";

  useEffect(() => setRecords(departments), [departments]);
  useEffect(() => setTableLoading(loading), [loading]);

  const reload = async () => {
    setTableLoading(true);
    try {
      setRecords(await listDepartments());
    } catch (error) {
      message.error(formatApiError(error));
    } finally {
      setTableLoading(false);
    }
  };

  const submit = async () => {
    try {
      const values = await form.validateFields();
      if (editing) {
        await updateDepartment(editing.id, values);
        message.success("部门已更新");
      } else {
        await createDepartment(values);
        message.success("部门已创建");
      }
      setModalOpen(false);
      form.resetFields();
      await reload();
    } catch (error) {
      if (error !== undefined) {
        message.error(formatApiError(error));
      }
    }
  };

  const openModal = (record?: DepartmentRecord) => {
    setEditing(record ?? null);
    form.resetFields();
    if (record) {
      form.setFieldsValue(record);
    }
    setModalOpen(true);
  };

  const remove = (record: DepartmentRecord) => {
    Modal.confirm({
      title: "删除部门",
      content: `确认删除“${record.name}”？部门只作为文件元数据，不影响历史文件归属。`,
      okText: "删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteDepartment(record.id);
          message.success("部门已删除");
          await reload();
        } catch (error) {
          message.error(formatApiError(error));
        }
      },
    });
  };

  const columns: ColumnsType<DepartmentRecord> = [
    { title: "部门名称", dataIndex: "name" },
    {
      title: "上级部门",
      dataIndex: "parentId",
      render: (value) => records.find((item) => item.id === value)?.name ?? "-",
    },
    { title: "备注", dataIndex: "managerNote", render: (value) => value || "-" },
    {
      title: "操作",
      width: 180,
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} disabled={!isAdmin} onClick={() => openModal(record)}>
            编辑
          </Button>
          <Button size="small" danger icon={<DeleteOutlined />} disabled={!isAdmin} onClick={() => remove(record)}>
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div className="page-stack">
      <PageHeader
        title="部门管理"
        lead="部门目前只作为文件元数据和用户资料字段，不参与文件访问权限控制。"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={reload}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} disabled={!isAdmin} onClick={() => openModal()}>
              新增部门
            </Button>
          </Space>
        }
      />
      {!isAdmin ? <Alert type="info" showIcon message="员工可以查看部门；新增、编辑和删除由管理员处理。" /> : null}
      <section className="page-band">
        <Table rowKey="id" loading={tableLoading} dataSource={records} columns={columns} pagination={false} />
      </section>

      <Modal title={editing ? "编辑部门" : "新增部门"} open={modalOpen} onOk={submit} onCancel={() => setModalOpen(false)} okText="保存" cancelText="取消" destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="部门名称" rules={[{ required: true, message: "请输入部门名称" }]}>
            <Input maxLength={50} />
          </Form.Item>
          <Form.Item name="parentId" label="上级部门">
            <Select
              allowClear
              options={records
                .filter((item) => item.id !== editing?.id)
                .map((item) => ({ label: item.name, value: item.id }))}
            />
          </Form.Item>
          <Form.Item name="managerNote" label="备注">
            <Input.TextArea rows={3} maxLength={200} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export function PartnerManagementPage({
  currentUser,
  partners,
  loading,
}: {
  currentUser: PublicUser;
  partners: PartnerRecord[];
  loading: boolean;
}) {
  const [records, setRecords] = useState<PartnerRecord[]>(partners);
  const [tableLoading, setTableLoading] = useState(loading);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PartnerRecord | null>(null);
  const [form] = Form.useForm();
  const isAdmin = currentUser.role === "ADMIN";

  useEffect(() => setRecords(partners), [partners]);
  useEffect(() => setTableLoading(loading), [loading]);

  const reload = async () => {
    setTableLoading(true);
    try {
      const result = await listPartners();
      setRecords(result.items);
    } catch (error) {
      message.error(formatApiError(error));
    } finally {
      setTableLoading(false);
    }
  };

  const openModal = (record?: PartnerRecord) => {
    setEditing(record ?? null);
    form.resetFields();
    form.setFieldsValue(record ?? { type: "CUSTOMER", status: "ACTIVE" });
    setModalOpen(true);
  };

  const submit = async () => {
    try {
      const values = await form.validateFields();
      if (editing) {
        await updatePartner(editing.id, values);
        message.success("合作单位已更新");
      } else {
        await createPartner(values);
        message.success("合作单位已创建");
      }
      setModalOpen(false);
      form.resetFields();
      await reload();
    } catch (error) {
      if (error !== undefined) {
        message.error(formatApiError(error));
      }
    }
  };

  const remove = (record: PartnerRecord) => {
    Modal.confirm({
      title: "删除合作单位",
      content: `确认删除“${record.companyName}”？删除后不会从历史文件中物理清除。`,
      okText: "删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deletePartner(record.id);
          message.success("合作单位已删除");
          await reload();
        } catch (error) {
          message.error(formatApiError(error));
        }
      },
    });
  };

  const columns: ColumnsType<PartnerRecord> = [
    { title: "单位名称", dataIndex: "companyName" },
    { title: "类型", dataIndex: "type", render: (value: PartnerType) => partnerTypeLabel(value) },
    { title: "联系人", dataIndex: "contactName", render: (value) => value || "-" },
    { title: "电话", dataIndex: "phone", render: (value) => value || "-" },
    { title: "邮箱", dataIndex: "email", render: (value) => value || "-" },
    { title: "状态", dataIndex: "status", render: (value: PartnerStatus) => (value === "ACTIVE" ? <Tag color="green">正常</Tag> : <Tag>停用</Tag>) },
    {
      title: "操作",
      width: 180,
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} disabled={!isAdmin} onClick={() => openModal(record)}>
            编辑
          </Button>
          <Button size="small" danger icon={<DeleteOutlined />} disabled={!isAdmin} onClick={() => remove(record)}>
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div className="page-stack">
      <PageHeader
        title="合作单位"
        lead="维护客户、供应商、合作伙伴和其他单位，文件可以关联多个合作单位。"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={reload}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} disabled={!isAdmin} onClick={() => openModal()}>
              新增合作单位
            </Button>
          </Space>
        }
      />
      {!isAdmin ? <Alert type="info" showIcon message="员工可以查看合作单位；新增、编辑和删除由管理员处理。" /> : null}
      <section className="page-band">
        <Table rowKey="id" loading={tableLoading} dataSource={records} columns={columns} pagination={{ pageSize: 20 }} scroll={{ x: 1000 }} />
      </section>

      <Modal title={editing ? "编辑合作单位" : "新增合作单位"} open={modalOpen} onOk={submit} onCancel={() => setModalOpen(false)} okText="保存" cancelText="取消" destroyOnClose width={720}>
        <Form form={form} layout="vertical">
          <Form.Item name="companyName" label="单位名称" rules={[{ required: true, message: "请输入单位名称" }]}>
            <Input maxLength={100} />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="type" label="类型" rules={[{ required: true, message: "请选择类型" }]}>
                <Select options={partnerTypeOptions} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="status" label="状态">
                <Select options={partnerStatusOptions} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="contactName" label="联系人">
                <Input maxLength={50} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="phone" label="电话">
                <Input maxLength={30} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="email" label="邮箱" rules={[{ type: "email", message: "邮箱格式不正确" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="address" label="地址">
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={3} maxLength={500} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export function TagManagementPage({
  currentUser,
  tags,
  loading,
}: {
  currentUser: PublicUser;
  tags: TagRecord[];
  loading: boolean;
}) {
  const [records, setRecords] = useState<TagRecord[]>(tags);
  const [tableLoading, setTableLoading] = useState(loading);
  const [modalOpen, setModalOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [editing, setEditing] = useState<TagRecord | null>(null);
  const [form] = Form.useForm();
  const [mergeForm] = Form.useForm();
  const isAdmin = currentUser.role === "ADMIN";

  useEffect(() => setRecords(tags), [tags]);
  useEffect(() => setTableLoading(loading), [loading]);

  const reload = async () => {
    setTableLoading(true);
    try {
      const result = await listTags();
      setRecords(result);
    } catch (error) {
      message.error(formatApiError(error));
    } finally {
      setTableLoading(false);
    }
  };

  const openModal = (record?: TagRecord) => {
    setEditing(record ?? null);
    form.resetFields();
    form.setFieldsValue(record ? { name: record.name } : {});
    setModalOpen(true);
  };

  const submit = async () => {
    try {
      const values = await form.validateFields();
      if (editing) {
        await updateTag(editing.id, values);
        message.success("标签已更新");
      } else {
        await createTag(values);
        message.success("标签已创建");
      }
      setModalOpen(false);
      form.resetFields();
      await reload();
    } catch (error) {
      if (error !== undefined) {
        message.error(formatApiError(error));
      }
    }
  };

  const submitMerge = async () => {
    try {
      const values = await mergeForm.validateFields();
      await mergeTags(values.sourceId, values.targetId);
      message.success("标签已合并");
      setMergeOpen(false);
      mergeForm.resetFields();
      await reload();
    } catch (error) {
      if (error !== undefined) {
        message.error(formatApiError(error));
      }
    }
  };

  const remove = (record: TagRecord) => {
    Modal.confirm({
      title: "删除标签",
      content: `确认删除“${record.name}”？`,
      okText: "删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteTag(record.id);
          message.success("标签已删除");
          await reload();
        } catch (error) {
          message.error(formatApiError(error));
        }
      },
    });
  };

  const columns: ColumnsType<TagRecord> = [
    { title: "标签名称", dataIndex: "name", render: (value) => <Tag>{value}</Tag> },
    { title: "标准化名称", dataIndex: "normalized" },
    { title: "创建时间", dataIndex: "createdAt", render: (value) => formatDate(value) },
    {
      title: "操作",
      width: 180,
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} disabled={!isAdmin} onClick={() => openModal(record)}>
            编辑
          </Button>
          <Button size="small" danger icon={<DeleteOutlined />} disabled={!isAdmin} onClick={() => remove(record)}>
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div className="page-stack">
      <PageHeader
        title="标签管理"
        lead="员工可以在上传文件时创建标签；管理员可以统一改名、删除或合并标签。"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={reload}>
              刷新
            </Button>
            <Button icon={<MergeCellsOutlined />} disabled={!isAdmin} onClick={() => setMergeOpen(true)}>
              合并标签
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
              新增标签
            </Button>
          </Space>
        }
      />
      {!isAdmin ? <Alert type="info" showIcon message="员工可新增标签；标签改名、删除和合并由管理员统一处理。" /> : null}
      <section className="page-band">
        <Table rowKey="id" loading={tableLoading} dataSource={records} columns={columns} pagination={{ pageSize: 20 }} />
      </section>

      <Modal title={editing ? "编辑标签" : "新增标签"} open={modalOpen} onOk={submit} onCancel={() => setModalOpen(false)} okText="保存" cancelText="取消" destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="标签名称" rules={[{ required: true, message: "请输入标签名称" }]}>
            <Input maxLength={30} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="合并标签" open={mergeOpen} onOk={submitMerge} onCancel={() => setMergeOpen(false)} okText="合并" cancelText="取消" destroyOnClose>
        <Form form={mergeForm} layout="vertical">
          <Form.Item name="sourceId" label="被合并标签" rules={[{ required: true, message: "请选择被合并标签" }]}>
            <Select options={records.map((item) => ({ label: item.name, value: item.id }))} />
          </Form.Item>
          <Form.Item name="targetId" label="合并到标签" rules={[{ required: true, message: "请选择目标标签" }]}>
            <Select options={records.map((item) => ({ label: item.name, value: item.id }))} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

function PageHeader({ title, lead, extra }: { title: string; lead: string; extra: ReactNode }) {
  return (
    <section className="page-band">
      <div className="page-band-header">
        <div>
          <Typography.Title level={2} className="page-title">
            {title}
          </Typography.Title>
          <Typography.Paragraph className="page-lead">{lead}</Typography.Paragraph>
        </div>
        {extra}
      </div>
    </section>
  );
}

const partnerTypeOptions = [
  { label: "客户", value: "CUSTOMER" },
  { label: "供应商", value: "SUPPLIER" },
  { label: "合作伙伴", value: "PARTNER" },
  { label: "其他", value: "OTHER" },
];

const partnerStatusOptions = [
  { label: "正常", value: "ACTIVE" },
  { label: "停用", value: "DISABLED" },
];

function partnerTypeLabel(type: PartnerType) {
  return partnerTypeOptions.find((item) => item.value === type)?.label ?? type;
}

function flattenCategories(nodes: CategoryNode[]): CategoryNode[] {
  return nodes.flatMap((node) => [node, ...flattenCategories(node.children ?? [])]);
}

function toCategoryTree(nodes: CategoryNode[]): TreeItem[] {
  return nodes.map((node) => ({
    title: `${node.name}${node.code ? ` · ${node.code}` : ""}`,
    key: node.id,
    children: node.children?.length ? toCategoryTree(node.children) : undefined,
  }));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(new Date(value));
}
