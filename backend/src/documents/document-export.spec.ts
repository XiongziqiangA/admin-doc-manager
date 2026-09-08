import { describe, expect, it } from "vitest";

import {
  buildExportManifestCsv,
  buildReadableExportFileName,
  buildUniqueZipEntryName,
  getCategoryDescendantIds,
  getCategoryPathNames,
  sanitizeZipSegment,
} from "./document-export";

describe("document export helpers", () => {
  it("sanitizes zip path segments without losing readable Chinese names", () => {
    expect(sanitizeZipSegment("../合同:模板?.pdf")).toBe("_合同_模板_.pdf");
    expect(sanitizeZipSegment("公众号相关资料")).toBe("公众号相关资料");
    expect(sanitizeZipSegment("CON")).toBe("未命名");
  });

  it("builds category paths from nested categories", () => {
    expect(
      getCategoryPathNames(
        [
          { id: "cat-1", name: "其他资料", parentId: null },
          { id: "cat-2", name: "公众号相关资料", parentId: "cat-1" },
          { id: "cat-3", name: "2026 年推文", parentId: "cat-2" },
        ],
        "cat-1",
        "cat-3",
      ),
    ).toEqual(["其他资料", "公众号相关资料", "2026 年推文"]);
  });

  it("collects all descendant category IDs for category exports", () => {
    expect(
      getCategoryDescendantIds(
        [
          { id: "cat-1", name: "其他资料", parentId: null },
          { id: "cat-2", name: "公众号相关资料", parentId: "cat-1" },
          { id: "cat-3", name: "2026 年推文", parentId: "cat-2" },
          { id: "cat-4", name: "行政制度", parentId: null },
        ],
        "cat-1",
      ).sort(),
    ).toEqual(["cat-1", "cat-2", "cat-3"]);
  });

  it("keeps exported file names readable and preserves extensions", () => {
    expect(
      buildReadableExportFileName({
        documentNo: "QT-20260818-001",
        title: "公众号排期",
        originalFileName: "公众号排期.xlsx",
        fileExt: ".xlsx",
      }),
    ).toBe("QT-20260818-001_公众号排期.xlsx");
  });

  it("deduplicates zip entry names within the same category folder", () => {
    const usedNames = new Set<string>();
    const first = buildUniqueZipEntryName(["其他资料"], "资料.pdf", usedNames);
    const second = buildUniqueZipEntryName(["其他资料"], "资料.pdf", usedNames);

    expect(first).toBe("其他资料/资料.pdf");
    expect(second).toBe("其他资料/资料 (2).pdf");
  });

  it("creates an Excel-friendly manifest CSV", () => {
    const csv = buildExportManifestCsv([
      {
        documentNo: "XZ-001",
        title: "制度,流程",
        originalFileName: "制度.pdf",
        categoryPath: "行政制度/流程",
        tags: ["制度", "流程"],
        versionLabel: "V1.0 - 2026-08-18",
        fileSize: 128,
        updatedAt: new Date("2026-08-18T08:30:00"),
        status: "已导出",
      },
    ]);

    expect(csv.startsWith("\uFEFF文件编号")).toBe(true);
    expect(csv).toContain('"制度,流程"');
    expect(csv).toContain("制度、流程");
  });
});
