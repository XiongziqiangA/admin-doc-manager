import ExcelJS from "exceljs";

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

export async function buildFinancePackageManifestXlsx(rows: FinancePackageManifestRow[]) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("文件清单");
  sheet.columns = [
    { header: "文件编号", key: "documentNo", width: 18 },
    { header: "文件名称", key: "title", width: 28 },
    { header: "原始文件名", key: "originalFileName", width: 36 },
    { header: "导出文件名", key: "exportFileName", width: 36 },
    { header: "交付包路径", key: "outputPath", width: 64 },
    { header: "材料类型", key: "materialType", width: 12 },
    { header: "版本", key: "versionLabel", width: 22 },
    { header: "文件大小（字节）", key: "fileSize", width: 16 },
    { header: "SHA-256", key: "checksum", width: 66 },
    { header: "状态", key: "status", width: 12 },
  ];
  sheet.addRows(rows.map((row) => ({
    documentNo: row.documentNo,
    title: row.title,
    originalFileName: row.originalFileName,
    exportFileName: row.exportFileName,
    outputPath: row.outputPath,
    materialType: row.materialType,
    versionLabel: row.versionLabel,
    fileSize: row.fileSize,
    checksum: row.checksum,
    status: row.status,
  })));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
