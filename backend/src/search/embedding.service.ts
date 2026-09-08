import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export interface EmbeddingResult {
  embedding: number[];
  model: string;
}

@Injectable()
export class EmbeddingService {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly maxInputCharacters: number;

  constructor(configService: ConfigService) {
    const enabled = configService.get<string>("AI_SEARCH_ENABLED", "false").toLowerCase() === "true";
    this.apiKey = enabled ? configService.get<string>("OPENAI_API_KEY", "").trim() : "";
    this.baseUrl = configService.get<string>("OPENAI_BASE_URL", "https://api.openai.com/v1").replace(/\/$/, "");
    this.model = configService.get<string>("EMBEDDING_MODEL", "text-embedding-3-small");
    this.maxInputCharacters = Number(configService.get("EMBEDDING_MAX_INPUT_CHARS", 8_000)) || 8_000;
  }

  isEnabled() {
    return Boolean(this.apiKey);
  }

  async embed(input: string): Promise<EmbeddingResult | null> {
    if (!this.apiKey || !input.trim()) {
      return null;
    }

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: input.slice(0, this.maxInputCharacters),
        model: this.model,
      }),
    });
    if (!response.ok) {
      throw new Error(`Embedding API request failed with status ${response.status}`);
    }

    const payload: unknown = await response.json();
    const item = this.getFirstEmbedding(payload);
    if (!item) {
      throw new Error("Embedding API returned an invalid vector");
    }
    return { embedding: item, model: this.model };
  }

  private getFirstEmbedding(payload: unknown) {
    if (!payload || typeof payload !== "object" || !("data" in payload) || !Array.isArray(payload.data)) {
      return null;
    }
    const first = payload.data[0];
    if (!first || typeof first !== "object" || !("embedding" in first) || !Array.isArray(first.embedding)) {
      return null;
    }
    const rawEmbedding = first.embedding;
    const vector = rawEmbedding.filter((value: unknown): value is number => typeof value === "number" && Number.isFinite(value));
    return vector.length === rawEmbedding.length && vector.length > 0 ? vector : null;
  }
}
