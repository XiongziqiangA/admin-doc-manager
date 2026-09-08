import { extname } from "node:path";

const ALLOWED_EXTENSIONS = new Set([
  ".7z",
  ".avi",
  ".aac",
  ".accdb",
  ".ai",
  ".amr",
  ".bak",
  ".bmp",
  ".bz2",
  ".caj",
  ".ceb",
  ".cer",
  ".cdr",
  ".crt",
  ".csv",
  ".dat",
  ".db",
  ".dbf",
  ".dgn",
  ".docm",
  ".pdf",
  ".doc",
  ".docx",
  ".dot",
  ".dotm",
  ".dotx",
  ".dps",
  ".dpt",
  ".dwf",
  ".dwfx",
  ".dwg",
  ".dxf",
  ".eml",
  ".eps",
  ".et",
  ".ett",
  ".flac",
  ".gif",
  ".gz",
  ".heic",
  ".heif",
  ".ics",
  ".iif",
  ".indd",
  ".jfif",
  ".key",
  ".log",
  ".m4v",
  ".mdb",
  ".xls",
  ".xlsb",
  ".xlsm",
  ".xlsx",
  ".xlt",
  ".xltm",
  ".xltx",
  ".jpg",
  ".jpeg",
  ".json",
  ".m4a",
  ".mind",
  ".mkv",
  ".mm",
  ".md",
  ".mov",
  ".mp3",
  ".mp4",
  ".msg",
  ".numbers",
  ".odp",
  ".ods",
  ".odt",
  ".ofd",
  ".ofx",
  ".pages",
  ".p12",
  ".pfx",
  ".png",
  ".pot",
  ".potm",
  ".potx",
  ".pps",
  ".ppsm",
  ".ppsx",
  ".psd",
  ".ppt",
  ".pptm",
  ".pptx",
  ".qif",
  ".rar",
  ".rtf",
  ".skp",
  ".sldm",
  ".sldx",
  ".sqlite",
  ".sqlite3",
  ".tar",
  ".tif",
  ".tiff",
  ".tsv",
  ".txt",
  ".vcf",
  ".vsd",
  ".vsdx",
  ".vss",
  ".vssx",
  ".vst",
  ".vstx",
  ".wav",
  ".webp",
  ".webm",
  ".wma",
  ".wmv",
  ".wps",
  ".wpt",
  ".xml",
  ".xmind",
  ".xz",
  ".zip",
]);

const PREVIEWABLE_EXTENSIONS = new Set([
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".txt",
  ".md",
  ".log",
  ".csv",
  ".tsv",
  ".xml",
  ".json",
]);

export function getNormalizedExtension(fileName: string): string {
  return extname(fileName).toLowerCase();
}

export function isAllowedDocumentFile(fileName: string): boolean {
  return ALLOWED_EXTENSIONS.has(getNormalizedExtension(fileName));
}

export function isPreviewableFile(fileName: string): boolean {
  return PREVIEWABLE_EXTENSIONS.has(getNormalizedExtension(fileName));
}

export function normalizeUploadedFileName(fileName: string): string {
  if (!/[\u0080-\u00ff]/.test(fileName)) {
    return fileName;
  }

  const decoded = Buffer.from(fileName, "latin1").toString("utf8");
  if (decoded.includes("\uFFFD")) {
    return fileName;
  }

  return decoded;
}
