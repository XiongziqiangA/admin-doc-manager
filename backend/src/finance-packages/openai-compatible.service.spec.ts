import { BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OpenAiCompatibleService, parseJsonContent } from "./openai-compatible.service";

function createConfig(values: Record<string, string> = {}) {
  return {
    get: vi.fn((key: string, fallback: string) => values[key] ?? fallback),
  } as unknown as ConfigService;
}

describe("OpenAiCompatibleService", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is disabled by default and never sends a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const service = new OpenAiCompatibleService(createConfig({ OPENAI_API_KEY: "secret" }));

    expect(service.status()).toMatchObject({ enabled: false, configured: false });
    await expect(service.completeJson("system", "user")).rejects.toBeInstanceOf(BadRequestException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls an OpenAI-compatible proxy and parses a fenced JSON response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "```json\n{\"documents\": []}\n```" } }], usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const service = new OpenAiCompatibleService(createConfig({
      FINANCE_AI_ENABLED: "true",
      OPENAI_API_KEY: "proxy-secret",
      OPENAI_BASE_URL: "https://proxy.example/v1/",
      OPENAI_MODEL: "proxy-model",
    }));

    await expect(service.completeJson("system", "user")).resolves.toMatchObject({
      data: { documents: [] },
      usage: { promptTokens: 12, completionTokens: 8, totalTokens: 20 },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://proxy.example/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer proxy-secret",
          "Content-Type": "application/json",
        },
        body: expect.stringContaining('"model":"proxy-model"'),
      }),
    );
  });

  it("loads the administrator's persisted configuration before serving requests", async () => {
    const settings = {
      getRuntimeConfig: vi.fn().mockResolvedValue({
        enabled: true,
        apiKey: "saved-secret",
        baseUrl: "https://saved-proxy.example/v1",
        model: "saved-model",
      }),
    };
    const service = new OpenAiCompatibleService(createConfig(), settings as never);

    await service.onModuleInit();

    expect(service.status()).toMatchObject({
      enabled: true,
      configured: true,
      baseUrl: "https://saved-proxy.example/v1",
      model: "saved-model",
    });
  });

  it("loads model identifiers from an OpenAI-compatible models endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: "gpt-5.5" }, { id: "gpt-5.6-luna" }, { id: "gpt-5.6-sol" }, { id: "gpt-5.5" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const service = new OpenAiCompatibleService(createConfig({
      FINANCE_AI_ENABLED: "true",
      OPENAI_API_KEY: "proxy-secret",
      OPENAI_BASE_URL: "https://proxy.example/v1",
      OPENAI_MODEL: "gpt-5.5",
    }));

    await expect(service.listModels()).resolves.toMatchObject({ models: ["gpt-5.5", "gpt-5.6-luna", "gpt-5.6-sol"] });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://proxy.example/v1/models",
      expect.objectContaining({ method: "GET", headers: { Authorization: "Bearer proxy-secret" } }),
    );
  });

  it("verifies credentials and the selected model with the provider", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ id: "gpt-5.5" }, { id: "gpt-5.6-luna" }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: "OK" } }] }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const service = new OpenAiCompatibleService(createConfig({
      FINANCE_AI_ENABLED: "true",
      OPENAI_API_KEY: "proxy-secret",
      OPENAI_BASE_URL: "https://proxy.example/v1",
      OPENAI_MODEL: "gpt-5.6-luna",
    }));

    await expect(service.verifyConnection()).resolves.toMatchObject({
      success: true,
      model: "gpt-5.6-luna",
      endpoint: "models+chat/completions",
      modelListed: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports when a provider does not offer a models endpoint", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const service = new OpenAiCompatibleService(createConfig({
      FINANCE_AI_ENABLED: "true",
      OPENAI_API_KEY: "proxy-secret",
      OPENAI_MODEL: "provider-specific-model",
    }));

    await expect(service.listModels()).rejects.toThrow("不支持模型列表接口");
  });

  it("falls back to a minimal completion when the models endpoint is unsupported", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: "OK" } }] }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const service = new OpenAiCompatibleService(createConfig({
      FINANCE_AI_ENABLED: "true",
      OPENAI_API_KEY: "proxy-secret",
      OPENAI_MODEL: "provider-specific-model",
    }));

    await expect(service.verifyConnection()).resolves.toMatchObject({
      success: true,
      endpoint: "chat/completions",
      modelListed: false,
    });
  });

  it("rejects a selected model that the provider does not list", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: "gpt-5.5" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const service = new OpenAiCompatibleService(createConfig({
      FINANCE_AI_ENABLED: "true",
      OPENAI_API_KEY: "proxy-secret",
      OPENAI_MODEL: "gpt-5.6-sol",
    }));

    await expect(service.verifyConnection()).rejects.toThrow("未在中转站模型列表中");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not include the provider response body in provider errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 502, text: async () => "proxy key leaked" }));
    const service = new OpenAiCompatibleService(createConfig({
      FINANCE_AI_ENABLED: "true",
      OPENAI_API_KEY: "proxy-secret",
    }));

    await expect(service.completeJson("system", "user")).rejects.toThrow("聊天接口请求失败（HTTP 502）");
    await expect(service.completeJson("system", "user")).rejects.not.toThrow("proxy key leaked");
  });

  it("rejects malformed JSON and supports JSON embedded in explanatory text", () => {
    expect(parseJsonContent("模型说明：{\"ok\":true}")).toEqual({ ok: true });
    expect(() => parseJsonContent("这不是 JSON")).toThrow("invalid JSON");
  });
});
