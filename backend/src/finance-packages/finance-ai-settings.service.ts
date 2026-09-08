import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { PrismaService } from "../prisma/prisma.service";
import { UpdateFinanceAiSettingsDto } from "./dto/update-finance-ai-settings.dto";

const SETTINGS_ID = "default";
const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";
const CIPHER_VERSION = "v1";

export interface FinanceAiRuntimeConfig {
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface FinanceAiPublicConfig extends Omit<FinanceAiRuntimeConfig, "apiKey"> {
  configured: boolean;
  apiKeyConfigured: boolean;
  source: "database" | "environment";
  promptVersion: string;
  lastTestAt: Date | null;
  lastTestOk: boolean | null;
  lastTestMessage: string | null;
  lastTestStatus: string | null;
  lastTestModel: string | null;
  lastTestDurationMs: number | null;
  lastTestEndpoint: string | null;
}

@Injectable()
export class FinanceAiSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async getRuntimeConfig(): Promise<FinanceAiRuntimeConfig> {
    const saved = await this.findSavedSettings();
    if (saved) {
      return {
        enabled: saved.enabled,
        apiKey: this.decryptApiKey(saved.apiKeyEncrypted),
        baseUrl: normalizeBaseUrl(saved.baseUrl),
        model: saved.model.trim() || DEFAULT_MODEL,
      };
    }
    return this.getEnvironmentConfig();
  }

  async getPublicConfig(promptVersion: string): Promise<FinanceAiPublicConfig> {
    const saved = await this.findSavedSettings();
    const runtime = saved ? await this.getRuntimeConfig() : this.getEnvironmentConfig();
    return {
      enabled: runtime.enabled,
      configured: runtime.enabled && Boolean(runtime.apiKey),
      apiKeyConfigured: Boolean(runtime.apiKey),
      baseUrl: runtime.baseUrl,
      model: runtime.model,
      source: saved ? "database" : "environment",
      promptVersion,
      lastTestAt: saved?.lastTestAt ?? null,
      lastTestOk: saved?.lastTestOk ?? null,
      lastTestMessage: saved?.lastTestMessage ?? null,
      lastTestStatus: saved?.lastTestStatus ?? null,
      lastTestModel: saved?.lastTestModel ?? null,
      lastTestDurationMs: saved?.lastTestDuration ?? null,
      lastTestEndpoint: saved?.lastTestEndpoint ?? null,
    };
  }

  async update(dto: UpdateFinanceAiSettingsDto, promptVersion: string) {
    const baseUrl = normalizeBaseUrl(dto.baseUrl);
    validateBaseUrl(baseUrl);
    const model = dto.model.trim();
    if (!model) {
      throw new BadRequestException("模型名称不能为空");
    }

    const existing = await this.findSavedSettings();
    const environmentConfig = existing ? null : this.getEnvironmentConfig();
    let apiKeyEncrypted = existing?.apiKeyEncrypted ?? null;
    if (dto.apiKey?.trim()) {
      apiKeyEncrypted = this.encryptApiKey(dto.apiKey.trim());
    } else if (dto.clearApiKey) {
      apiKeyEncrypted = null;
    } else if (!existing && environmentConfig?.apiKey) {
      apiKeyEncrypted = this.encryptApiKey(environmentConfig.apiKey);
    }

    const saved = existing
      ? await this.prisma.aiProviderSetting.update({
          where: { id: SETTINGS_ID },
          data: {
            enabled: dto.enabled,
            baseUrl,
            model,
            apiKeyEncrypted,
            lastTestAt: null,
            lastTestOk: null,
            lastTestMessage: null,
            lastTestStatus: null,
            lastTestModel: null,
            lastTestDuration: null,
            lastTestEndpoint: null,
          },
        })
      : await this.prisma.aiProviderSetting.create({
          data: {
            id: SETTINGS_ID,
            enabled: dto.enabled,
            baseUrl,
            model,
            apiKeyEncrypted,
            lastTestAt: null,
            lastTestOk: null,
            lastTestMessage: null,
            lastTestStatus: null,
            lastTestModel: null,
            lastTestDuration: null,
            lastTestEndpoint: null,
          },
        });

    return this.toPublicConfig(saved, promptVersion);
  }

  async reset(promptVersion: string) {
    const existing = await this.findSavedSettings();
    if (existing) {
      await this.prisma.aiProviderSetting.delete({ where: { id: SETTINGS_ID } });
    }
    return this.getPublicConfig(promptVersion);
  }

  async recordTest(
    ok: boolean,
    message: string,
    testedAt = new Date(),
    details?: { status: string; model?: string; durationMs?: number; endpoint?: string },
  ): Promise<void> {
    const existing = await this.findSavedSettings();
    if (!existing) {
      return;
    }

    const data: {
      lastTestAt: Date;
      lastTestOk: boolean;
      lastTestMessage: string;
      lastTestStatus?: string;
      lastTestModel?: string | null;
      lastTestDuration?: number | null;
      lastTestEndpoint?: string | null;
    } = {
      lastTestAt: testedAt,
      lastTestOk: ok,
      lastTestMessage: message.trim().slice(0, 500),
    };
    if (details) {
      data.lastTestStatus = details.status;
      data.lastTestModel = details.model ?? null;
      data.lastTestDuration = details.durationMs ?? null;
      data.lastTestEndpoint = details.endpoint ?? null;
    }

    await this.prisma.aiProviderSetting.update({
      where: { id: SETTINGS_ID },
      data,
    });
  }

  private async findSavedSettings() {
    return this.prisma.aiProviderSetting.findUnique({ where: { id: SETTINGS_ID } });
  }

  private getEnvironmentConfig(): FinanceAiRuntimeConfig {
    const enabled = this.configService.get<string>("FINANCE_AI_ENABLED", "false").toLowerCase() === "true";
    const apiKey = this.configService.get<string>("OPENAI_API_KEY", "").trim();
    const rawBaseUrl = this.configService.get<string>("OPENAI_BASE_URL", DEFAULT_BASE_URL);
    const baseUrl = normalizeBaseUrl(rawBaseUrl);
    validateBaseUrl(baseUrl);
    return {
      enabled,
      apiKey,
      baseUrl,
      model: this.configService.get<string>("OPENAI_MODEL", DEFAULT_MODEL).trim() || DEFAULT_MODEL,
    };
  }

  private toPublicConfig(
    settings: {
      enabled: boolean;
      baseUrl: string;
      model: string;
      apiKeyEncrypted: string | null;
      lastTestAt?: Date | null;
      lastTestOk?: boolean | null;
      lastTestMessage?: string | null;
      lastTestStatus?: string | null;
      lastTestModel?: string | null;
      lastTestDuration?: number | null;
      lastTestEndpoint?: string | null;
    },
    promptVersion: string,
  ): FinanceAiPublicConfig {
    const apiKeyConfigured = Boolean(this.decryptApiKey(settings.apiKeyEncrypted));
    return {
      enabled: settings.enabled,
      configured: settings.enabled && apiKeyConfigured,
      apiKeyConfigured,
      baseUrl: normalizeBaseUrl(settings.baseUrl),
      model: settings.model,
      source: "database",
      promptVersion,
      lastTestAt: settings.lastTestAt ?? null,
      lastTestOk: settings.lastTestOk ?? null,
      lastTestMessage: settings.lastTestMessage ?? null,
      lastTestStatus: settings.lastTestStatus ?? null,
      lastTestModel: settings.lastTestModel ?? null,
      lastTestDurationMs: settings.lastTestDuration ?? null,
      lastTestEndpoint: settings.lastTestEndpoint ?? null,
    };
  }

  private encryptApiKey(apiKey: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.getEncryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
    return [CIPHER_VERSION, iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(".");
  }

  private decryptApiKey(value: string | null) {
    if (!value) {
      return "";
    }
    try {
      const [version, ivValue, tagValue, encryptedValue] = value.split(".");
      if (version !== CIPHER_VERSION || !ivValue || !tagValue || !encryptedValue) {
        return "";
      }
      const decipher = createDecipheriv("aes-256-gcm", this.getEncryptionKey(), Buffer.from(ivValue, "base64"));
      decipher.setAuthTag(Buffer.from(tagValue, "base64"));
      return Buffer.concat([decipher.update(Buffer.from(encryptedValue, "base64")), decipher.final()]).toString("utf8");
    } catch {
      return "";
    }
  }

  private getEncryptionKey() {
    const secret = this.configService.get<string>("JWT_SECRET", "").trim();
    if (!secret) {
      throw new BadRequestException("未配置 JWT_SECRET，无法安全保存 API Key");
    }
    return createHash("sha256").update(secret, "utf8").digest();
  }
}

export function normalizeBaseUrl(value: string) {
  const normalized = value.trim().replace(/\/+$/, "");
  return normalized.replace(/\/chat\/completions$/i, "") || DEFAULT_BASE_URL;
}

function validateBaseUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BadRequestException("中转站地址不是有效的 URL");
  }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new BadRequestException("中转站地址必须是 http/https 基础地址，不能包含账号、密码、查询参数或片段");
  }
}
