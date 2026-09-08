import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { StorageService } from "./storage.service";

function createStorageService(root: string) {
  return new StorageService({
    get: () => root,
  } as never);
}

describe("StorageService.deleteDocumentFiles", () => {
  it("deletes stored files and ignores files that are already missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "admin-docs-storage-"));
    const service = createStorageService(root);
    const storageKey = "documents/2026/07/test.pdf";
    const absolutePath = join(root, "documents", "2026", "07", "test.pdf");

    try {
      await mkdir(join(root, "documents", "2026", "07"), { recursive: true });
      await writeFile(absolutePath, "pdf");

      const deletedCount = await service.deleteDocumentFiles([storageKey, storageKey, "documents/missing.pdf"]);

      await expect(readFile(absolutePath)).rejects.toMatchObject({ code: "ENOENT" });
      expect(deletedCount).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
