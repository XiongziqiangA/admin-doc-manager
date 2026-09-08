import { ConfigService } from "@nestjs/config";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { DocumentContentParserService } from "./document-content.parser";
import { CONTENT_INDEX_STATUS } from "./document-content.types";

describe("DocumentContentParserService", () => {
  it("normalizes and truncates text content", async () => {
    const directory = await mkdtemp(join(tmpdir(), "admin-docs-parser-"));
    try {
      const filePath = join(directory, "notes.txt");
      await writeFile(filePath, "\uFEFFfirst\r\nsecond\r\nthird", "utf8");
      const config = { get: vi.fn().mockReturnValue(12) } as unknown as ConfigService;
      const service = new DocumentContentParserService(config);

      const result = await service.extract(filePath, ".txt");

      expect(result).toEqual({
        extractedText: "first\nsecond",
        textLength: 12,
        parser: "text",
        status: CONTENT_INDEX_STATUS.READY,
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("marks formats without a text parser as unsupported", async () => {
    const config = { get: vi.fn().mockReturnValue(500_000) } as unknown as ConfigService;
    const service = new DocumentContentParserService(config);

    await expect(service.extract("missing.ofd", ".ofd")).resolves.toEqual({
      extractedText: "",
      textLength: 0,
      parser: "none",
      status: CONTENT_INDEX_STATUS.UNSUPPORTED,
    });
  });
});
