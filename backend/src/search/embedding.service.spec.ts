import { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EmbeddingService } from "./embedding.service";

function createConfig(values: Record<string, string>) {
  return {
    get: vi.fn((key: string, fallback: string) => values[key] ?? fallback),
  } as unknown as ConfigService;
}

describe("EmbeddingService", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not call the provider when semantic search is disabled", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const service = new EmbeddingService(createConfig({
      AI_SEARCH_ENABLED: "false",
      OPENAI_API_KEY: "test-key",
    }));

    await expect(service.embed("annual contract")).resolves.toBeNull();
    expect(service.isEnabled()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the configured model and returns a valid vector", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: [0.25, -0.5] }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const service = new EmbeddingService(createConfig({
      AI_SEARCH_ENABLED: "true",
      OPENAI_API_KEY: "test-key",
      OPENAI_BASE_URL: "https://embedding.example/v1/",
      EMBEDDING_MODEL: "test-embedding-model",
    }));

    await expect(service.embed("annual contract")).resolves.toEqual({
      embedding: [0.25, -0.5],
      model: "test-embedding-model",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://embedding.example/v1/embeddings",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer test-key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ input: "annual contract", model: "test-embedding-model" }),
      }),
    );
  });

  it("rejects malformed provider vectors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: [0.25, "invalid"] }] }),
    }));
    const service = new EmbeddingService(createConfig({
      AI_SEARCH_ENABLED: "true",
      OPENAI_API_KEY: "test-key",
    }));

    await expect(service.embed("annual contract")).rejects.toThrow("invalid vector");
  });
});
