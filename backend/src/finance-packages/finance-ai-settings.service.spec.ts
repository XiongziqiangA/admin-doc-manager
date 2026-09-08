import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { FinanceAiSettingsService } from "./finance-ai-settings.service";

function createConfig(values: Record<string, string> = {}) {
  return {
    get: vi.fn((key: string, fallback: string) => values[key] ?? fallback),
  } as never;
}

function createPrisma() {
  return {
    aiProviderSetting: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
}

describe("FinanceAiSettingsService", () => {
  it("falls back to environment configuration when no database setting exists", async () => {
    const prisma = createPrisma();
    prisma.aiProviderSetting.findUnique.mockResolvedValue(null);
    const service = new FinanceAiSettingsService(prisma as never, createConfig({
      FINANCE_AI_ENABLED: "true",
      OPENAI_API_KEY: "env-secret",
      OPENAI_BASE_URL: "https://proxy.example/v1/",
      OPENAI_MODEL: "proxy-model",
      JWT_SECRET: "a-secret-long-enough-for-tests",
    }));

    await expect(service.getRuntimeConfig()).resolves.toEqual({
      enabled: true,
      apiKey: "env-secret",
      baseUrl: "https://proxy.example/v1",
      model: "proxy-model",
    });
    await expect(service.getPublicConfig("test")).resolves.toMatchObject({
      enabled: true,
      configured: true,
      apiKeyConfigured: true,
      source: "environment",
    });
  });

  it("encrypts a saved API key and never returns the key in public settings", async () => {
    const prisma = createPrisma();
    prisma.aiProviderSetting.findUnique.mockResolvedValue(null);
    prisma.aiProviderSetting.create.mockImplementation(async ({ data }) => ({
      id: "default",
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    const service = new FinanceAiSettingsService(prisma as never, createConfig({ JWT_SECRET: "a-secret-long-enough-for-tests" }));

    const result = await service.update({
      enabled: true,
      baseUrl: "https://proxy.example/v1",
      model: "proxy-model",
      apiKey: "saved-secret",
    }, "test");

    expect(result).toMatchObject({ enabled: true, configured: true, apiKeyConfigured: true, source: "database" });
    expect(JSON.stringify(result)).not.toContain("saved-secret");
    expect(prisma.aiProviderSetting.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: "default",
        enabled: true,
        baseUrl: "https://proxy.example/v1",
        model: "proxy-model",
        apiKeyEncrypted: expect.stringMatching(/^v1\./),
      }),
    });

    const saved = prisma.aiProviderSetting.create.mock.calls[0][0].data;
    prisma.aiProviderSetting.findUnique.mockResolvedValue(saved);
    await expect(service.getRuntimeConfig()).resolves.toEqual({
      enabled: true,
      apiKey: "saved-secret",
      baseUrl: "https://proxy.example/v1",
      model: "proxy-model",
    });
  });

  it("preserves an environment API key when saving other settings from the desktop", async () => {
    const prisma = createPrisma();
    prisma.aiProviderSetting.findUnique.mockResolvedValue(null);
    prisma.aiProviderSetting.create.mockImplementation(async ({ data }) => ({ ...data }));
    const service = new FinanceAiSettingsService(prisma as never, createConfig({
      OPENAI_API_KEY: "environment-secret",
      JWT_SECRET: "a-secret-long-enough-for-tests",
    }));

    await service.update({ enabled: true, baseUrl: "https://proxy.example/v1", model: "proxy-model" }, "test");

    expect(prisma.aiProviderSetting.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ apiKeyEncrypted: expect.stringMatching(/^v1\./) }),
    });
    const saved = prisma.aiProviderSetting.create.mock.calls[0][0].data;
    prisma.aiProviderSetting.findUnique.mockResolvedValue(saved);
    await expect(service.getRuntimeConfig()).resolves.toMatchObject({ enabled: true, apiKey: "environment-secret" });
  });

  it("keeps the existing key unless the administrator explicitly clears it", async () => {
    const prisma = createPrisma();
    const service = new FinanceAiSettingsService(prisma as never, createConfig({ JWT_SECRET: "a-secret-long-enough-for-tests" }));
    prisma.aiProviderSetting.findUnique.mockResolvedValue(null);
    prisma.aiProviderSetting.create.mockImplementation(async ({ data }) => ({ ...data }));
    await service.update({ enabled: true, baseUrl: "https://proxy.example/v1", model: "proxy-model", apiKey: "saved-secret" }, "test");
    const encrypted = prisma.aiProviderSetting.create.mock.calls[0][0].data.apiKeyEncrypted;
    const existing = {
      id: "default",
      enabled: true,
      baseUrl: "https://proxy.example/v1",
      model: "proxy-model",
      apiKeyEncrypted: encrypted,
    };
    prisma.aiProviderSetting.findUnique.mockResolvedValue(existing);
    prisma.aiProviderSetting.update.mockImplementation(async ({ data }) => ({ ...existing, ...data }));

    await service.update({ enabled: false, baseUrl: existing.baseUrl, model: existing.model }, "test");
    expect(prisma.aiProviderSetting.update).toHaveBeenLastCalledWith({ where: { id: "default" }, data: expect.objectContaining({ apiKeyEncrypted: encrypted }) });

    await service.update({ enabled: false, baseUrl: existing.baseUrl, model: existing.model, clearApiKey: true }, "test");
    expect(prisma.aiProviderSetting.update).toHaveBeenLastCalledWith({ where: { id: "default" }, data: expect.objectContaining({ apiKeyEncrypted: null }) });
  });

  it("requires JWT_SECRET before encrypting a key", async () => {
    const prisma = createPrisma();
    prisma.aiProviderSetting.findUnique.mockResolvedValue(null);
    const service = new FinanceAiSettingsService(prisma as never, createConfig());

    await expect(service.update({
      enabled: true,
      baseUrl: "https://proxy.example/v1",
      model: "proxy-model",
      apiKey: "saved-secret",
    }, "test")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("can remove the database override and return to environment configuration", async () => {
    const prisma = createPrisma();
    prisma.aiProviderSetting.findUnique
      .mockResolvedValueOnce({ id: "default" })
      .mockResolvedValueOnce(null);
    prisma.aiProviderSetting.delete.mockResolvedValue({ id: "default" });
    const service = new FinanceAiSettingsService(prisma as never, createConfig({
      FINANCE_AI_ENABLED: "true",
      OPENAI_API_KEY: "env-secret",
      OPENAI_BASE_URL: "https://proxy.example/v1",
      OPENAI_MODEL: "proxy-model",
      JWT_SECRET: "a-secret-long-enough-for-tests",
    }));

    await expect(service.reset("test")).resolves.toMatchObject({ source: "environment", configured: true });
    expect(prisma.aiProviderSetting.delete).toHaveBeenCalledWith({ where: { id: "default" } });
  });

  it("stores a safe result for the last connection test", async () => {
    const prisma = createPrisma();
    prisma.aiProviderSetting.findUnique.mockResolvedValue({ id: "default" });
    prisma.aiProviderSetting.update.mockResolvedValue({});
    const service = new FinanceAiSettingsService(prisma as never, createConfig({ JWT_SECRET: "a-secret-long-enough-for-tests" }));

    await service.recordTest(true, "连接成功");

    expect(prisma.aiProviderSetting.update).toHaveBeenCalledWith({
      where: { id: "default" },
      data: { lastTestAt: expect.any(Date), lastTestOk: true, lastTestMessage: "连接成功" },
    });
  });
});
