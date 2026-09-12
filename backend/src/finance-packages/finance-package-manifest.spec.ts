import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { buildFinancePackageManifestXlsx } from "./finance-package-manifest";

describe("finance package manifest", () => {
  it("creates a readable Excel manifest with Chinese paths and version data", async () => {
    const buffer = await buildFinancePackageManifestXlsx([
      {
        documentNo: "CW-2026-001",
        title: "临平酒店住宿",
        originalFileName: "18000-临平桔子酒店发票.pdf",
        exportFileName: "18000-临平桔子酒店发票.pdf",
        outputPath: "我界报销单(打包）/临平赛场桔子酒店/18000-临平桔子酒店发票.pdf",
        materialType: "发票",
        versionLabel: "V1.0 - 2026-08-18",
        fileSize: 70402,
        checksum: "abc123",
        status: "已导出",
      },
    ]);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const sheet = workbook.getWorksheet("文件清单");
    const rows: unknown[][] = [];
    sheet?.eachRow((row) => rows.push((row.values as unknown[]).slice(1)));

    expect(rows[0]).toEqual([
      "文件编号",
      "文件名称",
      "原始文件名",
      "导出文件名",
      "交付包路径",
      "材料类型",
      "版本",
      "文件大小（字节）",
      "SHA-256",
      "状态",
    ]);
    expect(rows[1][4]).toContain("临平赛场桔子酒店");
    expect(rows[1][5]).toBe("发票");
  });
});
