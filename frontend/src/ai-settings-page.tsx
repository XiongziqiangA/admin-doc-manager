import {
  ApiOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  ExperimentOutlined,
  LockOutlined,
  ReloadOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import { Alert, AutoComplete, Badge, Button, Form, Input, Modal, Space, Spin, Switch, Typography, message } from "antd";
import { useEffect, useState } from "react";

import {
  formatApiError,
  getFinanceAiConfig,
  listFinanceAiModels,
  resetFinanceAiConfig,
  testFinanceAiConfig,
  updateFinanceAiConfig,
  verifyFinanceAiConfig,
} from "./api";
import type { FinanceAiConfig, FinanceAiVerification } from "./types";

const { Title, Text } = Typography;

interface AiSettingsFormValues {
  enabled: boolean;
  baseUrl: string;
  model: string;
  apiKey?: string;
  clearApiKey?: boolean;
}

interface AiTestFeedback {
  ok: boolean;
  model: string;
  durationMs: number | null;
  testedAt: string;
  message: string;
  endpoint?: string;
  modelListed?: boolean;
  status?: string;
}

export function AiSettingsPage() {
  const [form] = Form.useForm<AiSettingsFormValues>();
  const [config, setConfig] = useState<FinanceAiConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [testFeedback, setTestFeedback] = useState<AiTestFeedback | null>(null);

  const applyConfig = (result: FinanceAiConfig) => {
    setConfig(result);
  };

  useEffect(() => {
    if (loading || !config) return;
    form.resetFields();
    form.setFieldsValue({
      enabled: config.enabled,
      baseUrl: config.baseUrl,
      model: config.model,
      apiKey: undefined,
      clearApiKey: false,
    });
  }, [config, form, loading]);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const result = await getFinanceAiConfig();
      applyConfig(result);
      setTestFeedback(null);
    } catch (error) {
      message.error(`加载 AI 接口配置失败：${formatApiError(error)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadConfig();
  }, []);

  const saveConfig = async (): Promise<FinanceAiConfig | null> => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const result = await updateFinanceAiConfig({
        enabled: values.enabled,
        baseUrl: values.baseUrl.trim(),
        model: values.model.trim(),
        apiKey: values.apiKey?.trim() || undefined,
        clearApiKey: values.clearApiKey,
      });
      applyConfig(result);
      setModels([]);
      setTestFeedback(null);
      message.success("AI 接口配置已保存");
      return result;
    } catch (error) {
      if (isFormValidationError(error)) return null;
      message.error(`保存 AI 接口配置失败：${formatApiError(error)}`);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const testConfig = async () => {
    try {
      const values = await form.validateFields(["enabled", "baseUrl", "model"]);
      if (!values.enabled) {
        message.warning("请先启用 AI 接口");
        return;
      }
      if (!config?.apiKeyConfigured && !values.apiKey?.trim()) {
        message.warning("请先填写 API Key 并保存");
        return;
      }
      if (form.isFieldsTouched()) {
        message.warning("请先保存当前配置，再测试连接");
        return;
      }
      setTesting(true);
      await applyVerificationResult(await testFinanceAiConfig());
    } catch (error) {
      if (isFormValidationError(error)) return;
      await handleVerificationError(error);
    } finally {
      setTesting(false);
    }
  };

  const saveAndTestConfig = async () => {
    const enabled = form.getFieldValue("enabled");
    if (!enabled) {
      message.warning("请先启用 AI 接口，再保存并测试连接");
      return;
    }
    const saved = await saveConfig();
    if (!saved) return;
    await verifySavedConfig();
  };

  const verifySavedConfig = async () => {
    setTesting(true);
    try {
      await applyVerificationResult(await verifyFinanceAiConfig());
    } catch (error) {
      await handleVerificationError(error);
    } finally {
      setTesting(false);
    }
  };

  const applyVerificationResult = async (result: FinanceAiVerification) => {
    applyConfig(result.config);
    setTestFeedback({
      ok: true,
      model: result.model,
      durationMs: result.durationMs,
      testedAt: result.testedAt,
      message: result.message,
      endpoint: result.endpoint,
      modelListed: result.modelListed,
      status: "CONNECTED",
    });
    message.success("AI 接口验证成功");
  };

  const handleVerificationError = async (error: unknown) => {
    const errorMessage = formatApiError(error);
    setTestFeedback({
      ok: false,
      model: form.getFieldValue("model") || "-",
      durationMs: null,
      testedAt: new Date().toISOString(),
      message: errorMessage,
      status: getVerificationStatus(errorMessage),
    });
    try {
      applyConfig(await getFinanceAiConfig());
    } catch {
      // Keep the local failure feedback when the follow-up refresh is unavailable.
    }
    message.error(`AI 接口验证失败：${errorMessage}`);
  };

  const loadModels = async () => {
    try {
      await form.validateFields(["baseUrl"]);
      if (form.isFieldTouched("baseUrl") || form.isFieldTouched("apiKey")) {
        message.warning("请先保存当前中转站地址和 API Key，再获取模型列表");
        return;
      }
      if (!config?.enabled) {
        message.warning("请先启用 AI 接口并保存配置，再获取模型列表");
        return;
      }
      if (!config?.apiKeyConfigured && !form.getFieldValue("apiKey")?.trim()) {
        message.warning("请先填写 API Key 并保存");
        return;
      }
      setModelsLoading(true);
      const result = await listFinanceAiModels();
      setModels(result.models);
      message.success(`已获取 ${result.models.length} 个可用模型`);
    } catch (error) {
      if (isFormValidationError(error)) return;
      message.error(`获取模型列表失败：${formatApiError(error)}`);
    } finally {
      setModelsLoading(false);
    }
  };

  const resetConfig = () => {
    Modal.confirm({
      title: "恢复环境变量配置？",
      content: "这会删除桌面端保存的 AI 配置，改用 .env.production 中的配置，不会影响文件和业务数据。",
      okText: "恢复",
      cancelText: "取消",
      onOk: async () => {
        try {
          const result = await resetFinanceAiConfig();
          applyConfig(result);
          setModels([]);
          setTestFeedback(null);
          message.success("已恢复环境变量配置");
        } catch (error) {
          message.error(`恢复环境变量配置失败：${formatApiError(error)}`);
        }
      },
    });
  };

  if (loading) {
    return <div className="loading-state"><Spin size="large" /></div>;
  }

  return (
    <div className="page-stack ai-settings-page">
      <section className="page-band">
        <div className="page-band-header">
          <div>
            <Title level={2} className="page-title"><ApiOutlined /> AI 接口配置</Title>
            <Typography.Paragraph className="page-lead">配置 OpenAI 兼容中转站，用于财务文件内容识别和归集建议。</Typography.Paragraph>
          </div>
          <Badge
            status={connectionBadgeStatus(config, testFeedback)}
            text={connectionBadgeText(config, testFeedback)}
          />
        </div>
      </section>

      <div className="ai-settings-grid">
        <section className="page-band ai-settings-form-panel">
          <div className="section-toolbar">
            <div>
              <Title level={4} className="section-title">中转站参数</Title>
              <Text type="secondary">API Key 只提交到后端并以加密形式保存。</Text>
            </div>
            <LockOutlined className="ai-settings-lock-icon" />
          </div>
          <Form form={form} layout="vertical" requiredMark={false} className="ai-settings-form">
            <Form.Item name="enabled" label="启用财务智能识别" valuePropName="checked">
              <Switch checkedChildren="启用" unCheckedChildren="关闭" />
            </Form.Item>
            <Form.Item
              name="baseUrl"
              label="中转站基础地址"
              rules={[{ required: true, message: "请输入中转站基础地址" }, { type: "url", message: "请输入有效的 URL" }]}
              extra="填写到 /v1；不要填写完整的 /chat/completions。"
            >
              <Input placeholder="https://你的中转站地址/v1" />
            </Form.Item>
            <Form.Item
              name="model"
              label="模型名称"
              rules={[{ required: true, message: "请输入模型名称" }]}
              extra={models.length ? `已从中转站获取 ${models.length} 个模型，也可以手动填写未列出的模型。` : "可先保存配置，再获取中转站实际提供的模型列表。"}
            >
              <div className="ai-model-field">
                <AutoComplete
                  className="ai-model-input"
                  options={models.map((model) => ({ value: model, label: model }))}
                  showSearch
                  filterOption={(input, option) => String(option?.value ?? "").toLowerCase().includes(input.toLowerCase())}
                  placeholder="例如：gpt-5.5、gpt-5.6-luna、gpt-5.6-sol"
                />
                <Button htmlType="button" icon={<ReloadOutlined />} loading={modelsLoading} onClick={() => void loadModels()}>
                  获取模型列表
                </Button>
              </div>
            </Form.Item>
            <Form.Item
              name="apiKey"
              label="API Key"
              extra={config?.apiKeyConfigured ? "当前已有 Key；留空表示保留，不会显示原 Key。" : "首次使用请填写 Key。"}
            >
              <Input.Password autoComplete="new-password" placeholder={config?.apiKeyConfigured ? "已配置，留空保持不变" : "请输入中转站 API Key"} />
            </Form.Item>
            {config?.apiKeyConfigured && (
              <Form.Item name="clearApiKey" valuePropName="checked">
                <div className="ai-settings-clear-key-control">
                  <Switch checkedChildren="清除" unCheckedChildren="保留" />
                  <Text className="ai-settings-inline-label">清除当前 API Key</Text>
                </div>
              </Form.Item>
            )}
            <Space wrap className="ai-settings-actions">
              <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void saveConfig()}>保存配置</Button>
              <Button type="primary" icon={<CheckCircleOutlined />} loading={saving || testing} onClick={() => void saveAndTestConfig()}>保存并测试连接</Button>
              <Button icon={<ExperimentOutlined />} loading={testing} onClick={() => void testConfig()}>重新测试</Button>
              {config?.source === "database" && <Button onClick={resetConfig}>恢复环境变量</Button>}
            </Space>
          </Form>
        </section>

        <section className="page-band ai-settings-status-panel">
          <Title level={4} className="section-title">当前状态</Title>
          <div className="ai-settings-status-list">
            <StatusRow label="配置状态" value={config?.configured ? "已配置" : "未配置"} ok={Boolean(config?.configured)} />
            <StatusRow label="连接状态" value={connectionStatusText(config, testFeedback)} ok={connectionIsHealthy(config, testFeedback)} />
            <StatusRow label="配置来源" value={config?.source === "database" ? "桌面端配置" : "环境变量"} />
            <StatusRow label="模型" value={config?.model ?? "-"} />
            <StatusRow label="API Key" value={config?.apiKeyConfigured ? "已配置" : "未配置"} ok={Boolean(config?.apiKeyConfigured)} />
          </div>
          <ConnectionFeedback config={config} feedback={testFeedback} />
          <Alert
            className="ai-settings-alert"
            type="warning"
            showIcon
            message="外发边界"
            description="启用后，财务文件的文件名、分类、标签和已解析正文可能发送到中转站。请确认中转站的数据保留和隐私条款。"
          />
          <Alert
            className="ai-settings-alert"
            type="info"
            showIcon
            icon={<CheckCircleOutlined />}
            message="人工确认"
            description="AI 只生成建议，不会自动修改文件、正式分类、标签或历史版本。"
          />
        </section>
      </div>
    </div>
  );
}

function StatusRow({ label, value, ok = false }: { label: string; value: string; ok?: boolean }) {
  return <div className="ai-settings-status-row"><Text type="secondary">{label}</Text><Text strong type={ok ? "success" : undefined}>{value}</Text></div>;
}

function ConnectionFeedback({ config, feedback }: { config: FinanceAiConfig | null; feedback: AiTestFeedback | null }) {
  const persisted = config?.lastTestAt
    ? {
        ok: config.lastTestOk === true,
        model: config.lastTestModel || config.model,
        durationMs: config.lastTestDurationMs,
        testedAt: config.lastTestAt,
        message: config.lastTestMessage || (config.lastTestOk ? "最近一次连接测试成功" : "最近一次连接测试失败"),
        endpoint: config.lastTestEndpoint || undefined,
        modelListed: undefined,
        status: config.lastTestStatus || undefined,
      }
    : null;
  const result = feedback ?? persisted;
  if (!result) {
    return (
      <Alert
        className="ai-settings-alert"
        type="warning"
        showIcon
        icon={<ClockCircleOutlined />}
        message="尚未测试连接"
        description="配置完整只代表参数已保存；请点击“保存并测试连接”或“重新测试”确认中转站、API Key 和模型真实可用。"
      />
    );
  }

  return (
    <Alert
      className="ai-settings-alert"
      type={result.ok ? "success" : "error"}
      showIcon
      icon={result.ok ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
      message={result.ok ? "API 已连接" : "API 连接失败"}
      description={(
        <div className="ai-settings-test-detail">
          <span>{result.message}</span>
          <span>测试模型：{result.model}</span>
          {result.durationMs !== null && <span>测试耗时：{result.durationMs} ms</span>}
          {result.endpoint && <span>验证接口：{formatVerificationEndpoint(result.endpoint)}</span>}
          {result.modelListed !== undefined && <span>模型列表校验：{result.modelListed ? "通过" : "中转站未提供列表，已直接测试模型"}</span>}
          {result.status && <span>验证状态码：{result.status}</span>}
          <span>测试时间：{formatTestTime(result.testedAt)}</span>
        </div>
      )}
    />
  );
}

function connectionBadgeStatus(config: FinanceAiConfig | null, feedback: AiTestFeedback | null): "success" | "error" | "warning" | "default" {
  if (!config?.configured) return "default";
  if (feedback?.ok === true) return "success";
  if (feedback?.ok === false) return "error";
  if (config.lastTestOk === true) return "success";
  if (config.lastTestOk === false) return "error";
  return "warning";
}

function connectionBadgeText(config: FinanceAiConfig | null, feedback: AiTestFeedback | null) {
  if (!config?.configured) return "未配置";
  if (feedback?.ok === true) return "已连接";
  if (feedback?.ok === false) return "连接失败";
  if (config.lastTestOk === true) return "已连接";
  if (config.lastTestOk === false) return "连接失败";
  return "未测试";
}

function connectionStatusText(config: FinanceAiConfig | null, feedback: AiTestFeedback | null) {
  if (feedback) return feedback.ok ? "已连接" : "连接失败";
  if (!config?.configured) return "未配置";
  if (config.lastTestOk === true) return "已连接";
  if (config.lastTestOk === false) return "连接失败";
  return "未测试";
}

function connectionIsHealthy(config: FinanceAiConfig | null, feedback: AiTestFeedback | null) {
  return feedback?.ok === true || (!feedback && config?.lastTestOk === true);
}

function formatTestTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}

function formatVerificationEndpoint(value: string) {
  return value === "models+chat/completions" ? "模型列表 + 对话接口" : value === "chat/completions" ? "对话接口" : value;
}

function getVerificationStatus(message: string) {
  if (message.includes("Key") || message.includes("401") || message.includes("403")) return "AUTH_FAILED";
  if (message.includes("模型")) return "MODEL_NOT_FOUND";
  if (message.includes("429") || message.includes("额度")) return "RATE_LIMITED";
  if (message.includes("超时")) return "TIMEOUT";
  if (message.includes("网络") || message.includes("连接")) return "NETWORK_ERROR";
  return "FAILED";
}

function isFormValidationError(error: unknown) {
  return !!error && typeof error === "object" && "errorFields" in error;
}
