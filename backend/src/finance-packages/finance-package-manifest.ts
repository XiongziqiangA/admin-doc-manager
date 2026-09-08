import * as XLSX from "xlsx";

export interface FinancePackageManifestRow {
  documentNo: string;
  title: string;
  originalFileName: string;
  exportFileName: string;
  outputPath: string;
  materialType: string;
  versionLabel: string;
  fileSize: number;
  checksum: string;
  status: string;
}

export function buildFinancePackageManifestXlsx(rows: FinancePackageManifestRow[]) {
  const values = rows.map((row) => ({
    文件编号: row.documentNo,
    文件名称: row.title,
    原始文件名: row.originalFileName,
    导出文件名: row.exportFileName,
    交付包路径: row.outputPath,
    材料类型: row.materialType,
    版本: row.versionLabel,
    "文件大小（字节）": row.fileSize,
    "SHA-256": row.checksum,
    状态: row.status,
  }));
  const sheet = XLSX.utils.json_to_sheet(values, {
    header: [
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
    ],
  });
  sheet["!cols"] = [
    { wch: 18 },
    { wch: 28 },
    { wch: 36 },
    { wch: 36 },
    { wch: 64 },
    { wch: 12 },
    { wch: 22 },
    { wch: 16 },
    { wch: 66 },
    { wch: 12 },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "文件清单");
  const output = XLSX.write(workbook, { type: "buffer", bookType: "xlsx", compression: true });
  return Buffer.isBuffer(output) ? output : Buffer.from(output);
}
