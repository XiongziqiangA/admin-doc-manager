import { BadRequestException, Injectable, OnModuleInit, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { FinanceAiSettingsService } from "./finance-ai-settings.service";

export const FINANCE_AI_PROMPT_VERSION = "finance-classification-v1";

export interface FinanceAiStatus {
  enabled: boolean;
  configured: boolean;
  model: string;
  baseUrl: string;
  promptVersion: string;
}

export interface FinanceAiUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
}

export interface FinanceAiCompletion {
  data: unknown;
  usage: FinanceAiUsage;
  durationMs: number;
}

export interface FinanceAiModelList {
  models: string[];
  durationMs: number;
}

export interface FinanceAiVerification {
  success: true;
  model: string;
  durationMs: number;
  endpoint: "models+chat/completions" | "chat/completions";
  modelListed: boolean;
}

@Injectable()
export class OpenAiCompatibleService implements OnModuleInit {
  private enabled: boolean;
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private readonly timeoutMs: number;
  private readonly maxOutputTokens: number;

  constructor(
    configService: ConfigService,
    @Optional() private readonly settingsService?: FinanceAiSettingsService,
  ) {
    this.enabled = configService.get<string>("FINANCE_AI_ENABLED", "false").toLowerCase() === "true";
    this.apiKey = configService.get<string>("OPENAI_API_KEY", "").trim();
    this.baseUrl = this.normalizeBaseUrl(configService.get<string>("OPENAI_BASE_URL", "https://api.openai.com/v1"));
    this.model = configService.get<string>("OPENAI_MODEL", "gpt-4o-mini").trim() || "gpt-4o-mini";
    this.timeoutMs = this.readPositiveInt(configService.get<string>("FINANCE_AI_TIMEOUT_MS", "60000"), 60_000, 5_000, 120_000);
    this.maxOutputTokens = this.readPositiveInt(
      configService.get<string>("FINANCE_AI_MAX_OUTPUT_TOKENS", "1800"),
      1_800,
      256,
      8_000,
    );
  }

  async onModuleInit() {
    await this.reload();
  }

  async reload() {
    if (!this.settingsService) {
      return;
    }
    const settings = await this.settingsService.getRuntimeConfig();
    this.enabled = settings.enabled;
    this.apiKey = settings.apiKey;
    this.baseUrl = this.normalizeBaseUrl(settings.baseUrl);
    this.model = settings.model;
  }

  isConfigured() {
    return this.enabled && Boolean(this.apiKey) && Boolean(this.model);
  }

  status(): FinanceAiStatus {
    return {
      enabled: this.enabled,
      configured: this.isConfigured(),
      model: this.model,
      baseUrl: this.baseUrl,
      promptVersion: FINANCE_AI_PROMPT_VERSION,
    };
  }

  async completeJson(systemPrompt: string, userPrompt: string): Promise<FinanceAiCompletion> {
    if (!this.isConfigured()) {
      throw new BadRequestException("财务 AI 未配置，请在后端环境变量中设置 FINANCE_AI_ENABLED、OPENAI_API_KEY、OPENAI_BASE_URL 和 OPENAI_MODEL");
    }

    return this.requestCompletion(systemPrompt, userPrompt, true);
  }

  async testConnection() {
    return this.verifyConnection();
  }

  async verifyConnection(): Promise<FinanceAiVerification> {
    if (!this.isConfigured()) {
      throw new BadRequestException("财务 AI 未配置，请先保存有效的启用状态、API Key 和模型名称");
    }

    const startedAt = Date.now();
    let endpoint: FinanceAiVerification["endpoint"] = "chat/completions";
    try {
      const modelList = await this.requestModels();
      if (!modelList.models.includes(this.model)) {
        throw new Error(`当前选择的模型“${this.model}”未在中转站模型列表中，请选择列表中的模型或确认模型名称`);
      }
      endpoint = "models+chat/completions";
    } catch (error) {
      if (!(error instanceof ModelsEndpointUnsupportedError)) {
        throw error;
      }
    }

    await this.requestCompletion(
      "你是连接测试助手。只需返回 OK，不要输出其他内容。",
      "请回复 OK。",
      false,
      1,
    );
    return {
      success: true,
      model: this.model,
      durationMs: Date.now() - startedAt,
      endpoint,
      modelListed: endpoint === "models+chat/completions",
    };
  }

  async listModels(): Promise<FinanceAiModelList> {
    if (!this.isConfigured()) {
      throw new BadRequestException("财务 AI 未配置，请先保存有效的启用状态、API Key 和模型名称");
    }

    return this.requestModels();
  }

  private async requestModels(): Promise<FinanceAiModelList> {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        method: "GET",
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: controller.signal,
      });

      if (!response.ok) {
        if (response.status === 404 || response.status === 405) {
          throw new ModelsEndpointUnsupportedError();
        }
        throw new Error(`中转站模型列表请求失败（HTTP ${response.status}），请检查地址和 API Key`);
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new Error("中转站返回的模型列表格式无法识别，请手动填写模型名称");
      }

      const models = parseModelIds(payload);
      if (models.length === 0) {
        throw new Error("中转站未返回可用模型，请手动填写模型名称");
      }
      return { models, durationMs: Date.now() - startedAt };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`获取模型列表超时（${this.timeoutMs}ms），请检查中转站网络连接`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async requestCompletion(
    systemPrompt: string,
    userPrompt: string,
    parseJson: boolean,
    maxTokens = this.maxOutputTokens,
  ): Promise<FinanceAiCompletion> {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0,
          max_tokens: maxTokens,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`中转站聊天接口请求失败（HTTP ${response.status}），请检查模型名称、请求参数和中转站上游服务`);
      }

      const payload: unknown = await response.json();
      const content = getMessageContent(payload);
      if (!content) {
        throw new Error("中转站聊天接口返回空响应，请检查模型是否可用");
      }
      return {
        data: parseJson ? parseJsonContent(content) : content,
        usage: getUsage(payload),
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`中转站聊天接口请求超时（${this.timeoutMs}ms），请检查模型服务是否可用`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private normalizeBaseUrl(value: string) {
    const normalized = value.trim().replace(/\/+$/, "");
    return normalized.replace(/\/chat\/completions$/i, "") || "https://api.openai.com/v1";
  }

  private readPositiveInt(value: string, fallback: number, min: number, max: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return Math.min(max, Math.max(min, Math.floor(parsed)));
  }
}

class ModelsEndpointUnsupportedError extends Error {
  constructor() {
    super("中转站不支持模型列表接口，请手动填写模型名称");
    this.name = "ModelsEndpointUnsupportedError";
  }
}

function parseModelIds(payload: unknown): string[] {
  if (!payload || typeof payload !== "object" || !("data" in payload) || !Array.isArray(payload.data)) {
    throw new Error("中转站返回的模型列表格式无法识别，请手动填写模型名称");
  }

  return [...new Set(
    payload.data
      .map((item) => (item && typeof item === "object" && "id" in item && typeof item.id === "string" ? item.id.trim() : ""))
      .filter(Boolean),
  )].sort((left, right) => left.localeCompare(right));
}

function getMessageContent(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("choices" in payload) || !Array.isArray(payload.choices)) {
    return "";
  }
  const message = payload.choices[0];
  if (!message || typeof message !== "object" || !("message" in message) || !message.message || typeof message.message !== "object") {
    return "";
  }
  const content = "content" in message.message ? message.message.content : undefined;
  if (typeof content === "string") {
    return content.trim();
  }
  if (Array.isArray(content)) {
    return content
      .filter((part): part is { text: string } => Boolean(part && typeof part === "object" && "text" in part && typeof part.text === "string"))
      .map((part) => part.text)
      .join("\n")
      .trim();
  }
  return "";
}

function getUsage(payload: unknown): FinanceAiUsage {
  if (!payload || typeof payload !== "object" || !("usage" in payload) || !payload.usage || typeof payload.usage !== "object") {
    return { promptTokens: null, completionTokens: null, totalTokens: null };
  }
  return {
    promptTokens: readUsageNumber(payload.usage, "prompt_tokens"),
    completionTokens: readUsageNumber(payload.usage, "completion_tokens"),
    totalTokens: readUsageNumber(payload.usage, "total_tokens"),
  };
}

function readUsageNumber(value: object, key: string) {
  const raw = key in value ? value[key as keyof typeof value] : undefined;
  return typeof raw === "number" && Number.isInteger(raw) && raw >= 0 ? raw : null;
}

export function parseJsonContent(content: string): unknown {
  const normalized = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(normalized) as unknown;
  } catch {
    const candidate = findJsonObject(normalized);
    if (!candidate) {
      throw new Error("AI provider returned invalid JSON");
    }
    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      throw new Error("AI provider returned invalid JSON");
    }
  }
}

function findJsonObject(value: string) {
  const start = value.indexOf("{");
  if (start < 0) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < value.length; index += 1) {
    const character = value[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return value.slice(start, index + 1);
      }
    }
  }
  return null;
}
