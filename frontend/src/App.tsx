import {
  AccountBookOutlined,
  ApiOutlined,
  AppstoreOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  EyeOutlined,
  FileExcelOutlined,
  FileImageOutlined,
  FilePdfOutlined,
  FileTextOutlined,
  FileUnknownOutlined,
  FileWordOutlined,
  FileZipOutlined,
  FolderOpenOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  PlusOutlined,
  PrinterOutlined,
  ReloadOutlined,
  RobotOutlined,
  SettingOutlined,
  SwapOutlined,
  UndoOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import {
  Alert,
  Button,
  Cascader,
  Checkbox,
  Col,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Layout,
  List,
  Menu,
  Modal,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Tree,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { DefaultOptionType } from "antd/es/cascader";
import type { DataNode } from "antd/es/tree";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  clearStoredAuth,
  createCategory,
  deleteCategory,
  deleteDocument,
  downloadDocumentBlob,
  exportDocumentsBlob,
  formatApiError,
  findDuplicateDocuments,
  getDocument,
  getStoredToken,
  getStoredUser,
  listDocumentVersions,
  listCategories,
  listDepartments,
  listDocuments,
  listPartners,
  listTags,
  login,
  permanentlyDeleteDocument,
  rebuildDocumentContentIndex,
  restoreDocument,
  searchWithAssistant,
  setStoredAuth,
  updateCategory,
  updateDocument,
  uploadDocument,
  uploadDocumentVersion,
} from "./api";
import type {
  CategoryNode,
  DepartmentRecord,
  DocumentVersionRecord,
  DocumentRecord,
  DocumentListQuery,
  PartnerRecord,
  PublicUser,
  SearchAssistantResponse,
  TagRecord,
} from "./types";
import { FinancePackagesPage } from "./finance-packages-page";
import { AiSettingsPage } from "./ai-settings-page";
import { BusinessMattersPage } from "./business-matters-page";

declare global {
  interface Window {
    adminDocsDesktop?: {
      pickFiles: () => Promise<DesktopPickedFile[]>;
      uploadDocument: (payload: DesktopUploadPayload) => Promise<DocumentRecord>;
      uploadDocumentVersion: (payload: DesktopVersionUploadPayload) => Promise<DocumentVersionRecord>;
      openDocumentFile: (payload: DesktopOpenDocumentPayload) => Promise<{ filePath: string }>;
      printDocumentFile: (payload: DesktopOpenDocumentPayload) => Promise<{ filePath: string }>;
      getSavedLogin: () => Promise<SavedLoginCredentials | null>;
      saveLogin: (payload: SavedLoginCredentials) => Promise<boolean>;
      clearSavedLogin: () => Promise<boolean>;
      debug: (event: string, details?: Record<string, unknown>) => void;
      onDroppedFiles: (callback: (payload: DesktopDroppedFiles) => void) => () => void;
    };
  }
}

interface DesktopPickedFile {
  id: string;
  name: string;
  size: number;
  type: string;
}

interface DesktopDroppedFiles {
  files: DesktopPickedFile[];
  rejectedCount: number;
}

interface DesktopUploadPayload {
  fileId: string;
  accessToken: string;
  fields: {
    categoryId: string;
    subcategoryId?: string;
    departmentId?: string;
    title?: string;
    remark?: string;
    tagNames?: string[];
  };
}

interface DesktopVersionUploadPayload {
  documentId: string;
  fileId: string;
  accessToken: string;
  changeNote?: string;
}

interface DesktopOpenDocumentPayload {
  documentId: string;
  versionId?: string;
  accessToken: string;
  fileName?: string;
}

interface SavedLoginCredentials {
  username: string;
  password: string;
}

type UploadSelectedFile = File | DesktopPickedFile;
type DuplicateUploadDecision =
  | { action: "skip" }
  | { action: "update"; document: DocumentRecord };

interface DuplicateUploadPromptState {
  file: UploadSelectedFile;
  matches: DocumentRecord[];
}

const acceptedUploadExtensions = [
  ".pdf",
  ".ofd",
  ".ceb",
  ".doc",
  ".docx",
  ".docm",
  ".dot",
  ".dotx",
  ".dotm",
  ".wps",
  ".wpt",
  ".rtf",
  ".txt",
  ".md",
  ".log",
  ".odt",
  ".pages",
  ".xls",
  ".xlsx",
  ".xlsm",
  ".xlsb",
  ".xlt",
  ".xltx",
  ".xltm",
  ".csv",
  ".tsv",
  ".et",
  ".ett",
  ".ods",
  ".numbers",
  ".ppt",
  ".pptx",
  ".pptm",
  ".pot",
  ".potx",
  ".potm",
  ".pps",
  ".ppsx",
  ".ppsm",
  ".dps",
  ".dpt",
  ".odp",
  ".key",
  ".jpg",
  ".jpeg",
  ".jfif",
  ".png",
  ".gif",
  ".bmp",
  ".tif",
  ".tiff",
  ".webp",
  ".heic",
  ".heif",
  ".psd",
  ".ai",
  ".eps",
  ".cdr",
  ".indd",
  ".zip",
  ".rar",
  ".7z",
  ".tar",
  ".gz",
  ".bz2",
  ".xz",
  ".xml",
  ".json",
  ".dat",
  ".dbf",
  ".db",
  ".mdb",
  ".accdb",
  ".sqlite",
  ".sqlite3",
  ".bak",
  ".ofx",
  ".qif",
  ".iif",
  ".eml",
  ".msg",
  ".ics",
  ".vcf",
  ".cer",
  ".crt",
  ".pfx",
  ".p12",
  ".xmind",
  ".mind",
  ".mm",
  ".vsd",
  ".vsdx",
  ".vss",
  ".vssx",
  ".vst",
  ".vstx",
  ".dwg",
  ".dxf",
  ".dwf",
  ".dwfx",
  ".dgn",
  ".skp",
  ".mp3",
  ".wav",
  ".m4a",
  ".aac",
  ".flac",
  ".amr",
  ".wma",
  ".mp4",
  ".mov",
  ".avi",
  ".wmv",
  ".mkv",
  ".m4v",
  ".webm",
  ".caj",
];
const acceptedUploadFileTypes = acceptedUploadExtensions.join(",");

const { Header, Sider, Content } = Layout;

const text = {
  brand: "\u4f01\u4e1a\u884c\u653f\u8d44\u6599\u7ba1\u7406\u7cfb\u7edf",
  loginTitle: "\u6b22\u8fce\u767b\u5f55",
  loginDesc: "\u96c6\u4e2d\u7ba1\u7406\u4f01\u4e1a\u884c\u653f\u6587\u4ef6\u3001\u5206\u7c7b\u548c\u5386\u53f2\u7248\u672c\u3002",
  username: "\u8d26\u53f7",
  password: "\u5bc6\u7801",
  login: "\u767b\u5f55",
  loginSuccess: "\u767b\u5f55\u6210\u529f",
  requiredUsername: "\u8bf7\u8f93\u5165\u8d26\u53f7",
  requiredPassword: "\u8bf7\u8f93\u5165\u5bc6\u7801",
  rememberLogin: "\u8bb0\u4f4f\u8d26\u53f7\u5bc6\u7801",
  dashboard: "\u5de5\u4f5c\u53f0",
  documents: "\u6587\u4ef6\u4e2d\u5fc3",
  recycleBin: "\u56de\u6536\u7ad9",
  categories: "\u5206\u7c7b\u7ba1\u7406",
  financePackages: "财务归集",
  aiSettings: "AI 接口配置",
  admin: "\u7ba1\u7406\u5458",
  employee: "\u5458\u5de5",
  logout: "\u9000\u51fa\u767b\u5f55",
  refresh: "\u5237\u65b0",
  refreshed: "\u6570\u636e\u5df2\u5237\u65b0",
  uploadFile: "\u4e0a\u4f20\u6587\u4ef6",
  viewFiles: "\u67e5\u770b\u6587\u4ef6",
  viewAll: "\u67e5\u770b\u5168\u90e8",
  totalFiles: "\u6587\u4ef6\u603b\u6570",
  primaryCategories: "\u4e00\u7ea7\u5206\u7c7b",
  recentUpdate: "\u6700\u8fd1\u66f4\u65b0",
  recentFiles: "\u6700\u8fd1\u6587\u4ef6",
  fileCategories: "\u6587\u4ef6\u5206\u7c7b",
  dashboardLead: "\u6587\u4ef6\u3001\u5206\u7c7b\u548c\u7248\u672c\u4fe1\u606f\u96c6\u4e2d\u5728\u8fd9\u91cc\uff0c\u4e0a\u4f20\u540e\u53ef\u7ee7\u7eed\u7f16\u8f91\u6587\u4ef6\u540d\u79f0\u4e0e\u6807\u7b7e\u3002",
  noDocuments: "\u8fd8\u6ca1\u6709\u4e0a\u4f20\u6587\u4ef6",
  noCategories: "\u6682\u65e0\u5206\u7c7b",
  categoryLoading: "\u5206\u7c7b\u52a0\u8f7d\u4e2d\u6216\u6682\u65f6\u4e3a\u7a7a",
  fileCenterLead: "\u6d4f\u89c8\u3001\u641c\u7d22\u548c\u4e0b\u8f7d\u4f01\u4e1a\u884c\u653f\u8d44\u6599\u3002",
  recycleLead: "\u5df2\u5220\u9664\u7684\u6587\u4ef6\u4f1a\u5148\u4fdd\u7559\u5728\u8fd9\u91cc\uff0c\u53ef\u6062\u590d\uff1b\u5f7b\u5e95\u5220\u9664\u540e\u4f1a\u540c\u6b65\u6e05\u7406\u5b58\u50a8\u6587\u4ef6\u3002",
  searchPlaceholder: "\u8f93\u5165\u90e8\u5206\u6587\u4ef6\u540d\u3001\u7f16\u53f7\u3001\u6807\u7b7e\u6216\u5206\u7c7b",
  allCategories: "\u5168\u90e8\u5206\u7c7b",
  allTags: "\u5168\u90e8\u6807\u7b7e",
  allPartners: "\u5168\u90e8\u5408\u4f5c\u5355\u4f4d",
  fileName: "\u6587\u4ef6\u540d\u79f0",
  fileDetail: "\u6587\u4ef6\u8be6\u60c5",
  editDocument: "\u7f16\u8f91\u6587\u4ef6",
  saveDocument: "\u4fdd\u5b58\u6587\u4ef6",
  moveDocument: "\u79fb\u52a8\u5206\u7c7b",
  moveDocumentTitle: "\u79fb\u52a8\u6587\u4ef6\u5206\u7c7b",
  moveDocumentHint: "\u4ec5\u8c03\u6574\u6587\u4ef6\u7684\u5206\u7c7b\u4f4d\u7f6e\uff0c\u6587\u4ef6\u5185\u5bb9\u3001\u7248\u672c\u3001\u6807\u7b7e\u548c\u5386\u53f2\u8bb0\u5f55\u4fdd\u6301\u4e0d\u53d8\u3002",
  documentMoved: "\u6587\u4ef6\u5df2\u79fb\u52a8\u5230\u65b0\u5206\u7c7b",
  moveDocumentFailed: "\u79fb\u52a8\u6587\u4ef6\u5206\u7c7b\u5931\u8d25",
  documentAlreadyInCategory: "\u6587\u4ef6\u5df2\u5728\u6b64\u5206\u7c7b\u4e2d",
  documentNo: "\u6587\u4ef6\u7f16\u53f7",
  category: "\u5206\u7c7b",
  version: "\u7248\u672c",
  currentVersion: "\u5f53\u524d\u7248\u672c",
  historicalVersions: "\u5386\u53f2\u7248\u672c",
  noHistoricalVersions: "\u6682\u65e0\u5386\u53f2\u7248\u672c",
  preview: "\u67e5\u770b",
  previewFailed: "\u67e5\u770b\u6587\u4ef6\u5931\u8d25",
  openFile: "\u6253\u5f00\u6587\u4ef6",
  openFileFailed: "\u6253\u5f00\u6587\u4ef6\u5931\u8d25",
  openFileRequiresDesktop: "\u7f51\u9875\u7248\u53ef\u9884\u89c8 PDF \u548c\u56fe\u7247\uff1b\u6240\u6709\u683c\u5f0f\u76f4\u63a5\u6253\u5f00\u8bf7\u4f7f\u7528\u684c\u9762\u5e94\u7528\u3002",
  print: "\u6253\u5370",
  printStarted: "\u5df2\u6253\u5f00\u6253\u5370\u5bf9\u8bdd\u6846",
  printFailed: "\u6253\u5370\u5931\u8d25",
  printPopupBlocked: "\u6253\u5370\u9884\u89c8\u7a97\u53e3\u88ab\u6d4f\u89c8\u5668\u62e6\u622a，\u8bf7\u5141\u8bb8\u5f39\u7a97\u540e\u91cd\u8bd5",
  printUnsupported: "\u5f53\u524d\u4ec5\u652f\u6301 PDF\u3001\u56fe\u7247\u548c\u6587\u672c\u6587\u4ef6\u76f4\u63a5\u6253\u5370；Office/OFD \u8bf7\u5148\u6253\u5f00\u540e\u6253\u5370",
  updateLatestFile: "\u66f4\u65b0\u6700\u65b0\u6587\u4ef6",
  updateVersionDrawerTitle: "\u66f4\u65b0\u6587\u4ef6\u7248\u672c",
  saveVersionUpdate: "\u4fdd\u5b58\u65b0\u7248\u672c",
  versionUpdateHint: "\u4e0a\u4f20\u540e\u5c06\u4f5c\u4e3a\u8be5\u6587\u4ef6\u7684\u6700\u65b0\u7248\u672c\uff0c\u539f\u5386\u53f2\u7248\u672c\u4f1a\u4fdd\u7559\u3002",
  versionChangeNote: "\u7248\u672c\u8bf4\u660e",
  versionUpdated: "\u6587\u4ef6\u5df2\u66f4\u65b0\u4e3a\u6700\u65b0\u7248\u672c",
  versionUpdateFailed: "\u66f4\u65b0\u6587\u4ef6\u5931\u8d25",
  originalFileName: "\u539f\u59cb\u6587\u4ef6\u540d",
  fileSize: "\u6587\u4ef6\u5927\u5c0f",
  mimeType: "\u6587\u4ef6\u7c7b\u578b",
  creator: "\u4e0a\u4f20\u4eba",
  createdAt: "\u521b\u5efa\u65f6\u95f4",
  updatedAt: "\u66f4\u65b0\u65f6\u95f4",
  deletedAt: "\u5220\u9664\u65f6\u95f4",
  actions: "\u64cd\u4f5c",
  download: "\u4e0b\u8f7d",
  delete: "\u5220\u9664",
  moveToRecycle: "\u79fb\u5165\u56de\u6536\u7ad9",
  restore: "\u6062\u590d",
  permanentlyDelete: "\u5f7b\u5e95\u5220\u9664",
  fixed: "\u56fa\u5b9a",
  custom: "\u81ea\u5b9a\u4e49",
  categoryLead: "\u7ba1\u7406\u5458\u53ef\u4ee5\u7ef4\u62a4\u4e00\u7ea7\u5206\u7c7b\u548c\u4e8c\u7ea7\u5206\u7c7b\uff0c\u5220\u9664\u524d\u9700\u786e\u4fdd\u6ca1\u6709\u4e0b\u7ea7\u5206\u7c7b\u548c\u5173\u8054\u6587\u4ef6\u3002",
  addPrimaryCategory: "\u65b0\u589e\u4e00\u7ea7\u5206\u7c7b",
  addSubcategory: "\u65b0\u589e\u4e0b\u7ea7\u5206\u7c7b",
  addChildCategory: "\u65b0\u589e\u4e0b\u7ea7\u5206\u7c7b",
  editCategory: "\u7f16\u8f91\u5206\u7c7b",
  deleteCategory: "\u5220\u9664\u5206\u7c7b",
  categoryLevel: "\u5206\u7c7b\u5c42\u7ea7",
  primaryCategory: "\u4e00\u7ea7\u5206\u7c7b",
  categoryCode: "\u7f16\u53f7\u524d\u7f00",
  enterCategoryCode: "\u8bf7\u8f93\u5165\u7f16\u53f7\u524d\u7f00",
  categoryCodeHint: "\u7528\u4e8e\u751f\u6210\u6587\u4ef6\u7f16\u53f7\uff0c\u4f8b\u5982 XZ\u3001RS\u3002",
  employeeCategoryHint: "\u5458\u5de5\u53ef\u4ee5\u67e5\u770b\u5206\u7c7b\uff0c\u65b0\u589e\u548c\u7ef4\u62a4\u5206\u7c7b\u7531\u7ba1\u7406\u5458\u5904\u7406\u3002",
  categoryTree: "\u5206\u7c7b\u6811",
  categoryPath: "\u5206\u7c7b\u8def\u5f84",
  subcategory: "\u5177\u4f53\u5206\u7c7b",
  childCategories: "\u4e0b\u7ea7\u5206\u7c7b",
  categoryFiles: "\u5206\u7c7b\u5185\u6587\u4ef6",
  noCategoryFiles: "\u8be5\u5206\u7c7b\u4e0b\u6682\u65e0\u6587\u4ef6",
  filesInCategory: "\u5206\u7c7b\u6587\u4ef6",
  childCategoryCount: "\u5b50\u5206\u7c7b",
  monthNewFiles: "\u672c\u6708\u65b0\u589e",
  latestUpdate: "\u6700\u540e\u66f4\u65b0",
  fileType: "\u7c7b\u578b",
  basicInfo: "\u57fa\u672c\u4fe1\u606f",
  fileInfo: "\u6587\u4ef6\u4fe1\u606f",
  parentCategory: "\u6240\u5c5e\u4e00\u7ea7\u5206\u7c7b",
  parentCategoryGeneral: "\u4e0a\u7ea7\u5206\u7c7b",
  sort: "\u6392\u5e8f",
  status: "\u72b6\u6001",
  save: "\u4fdd\u5b58",
  cancel: "\u53d6\u6d88",
  uploadDrawerTitle: "\u4e0a\u4f20\u884c\u653f\u6587\u4ef6",
  saveUpload: "\u4fdd\u5b58\u4e0a\u4f20",
  duplicateFileTitle: "\u53d1\u73b0\u91cd\u590d\u6587\u4ef6\u540d",
  duplicateFileHint: "\u7cfb\u7edf\u4e2d\u5df2\u6709\u540c\u540d\u6587\u4ef6\uff0c\u8bf7\u5148\u786e\u8ba4\u518d\u7edd\u5bf9\u4e0a\u4f20\u3002",
  duplicateFileSelected: "\u4f60\u8f93\u5165\u7684\u6587\u4ef6",
  duplicateFileExisting: "\u7cfb\u7edf\u4e2d\u5df2\u6709\u540c\u540d\u6587\u4ef6",
  duplicateFileNoChange: "\u4e0d\u505a\u53d8\u52a8",
  duplicateFileUpdateVersion: "\u66f4\u65b0\u65b0\u7248\u672c",
  duplicateFileViewDetail: "\u67e5\u770b\u8be6\u60c5",
  duplicateFileSkippedPrefix: "\u5df2\u8df3\u8fc7 ",
  duplicateFileSkippedSuffix: " \u4efd\u91cd\u590d\u6587\u4ef6",
  selectFile: "\u9009\u62e9\u6587\u4ef6",
  reselectFile: "\u91cd\u65b0\u9009\u62e9\u6587\u4ef6",
  selectFiles: "\u9009\u62e9\u6587\u4ef6",
  reselectFiles: "\u91cd\u65b0\u9009\u62e9\u6587\u4ef6",
  supportedFiles: "\u652f\u6301 Office/WPS\u3001PDF/OFD\u3001\u8868\u683c\u6570\u636e\u3001\u56fe\u7247\u626b\u63cf\u4ef6\u3001\u538b\u7f29\u5305\u3001\u90ae\u4ef6\u3001CAD \u548c\u5e38\u89c1\u97f3\u89c6\u9891\u6587\u4ef6",
  selectedFilesCountPrefix: "\u5df2\u9009\u62e9 ",
  selectedFilesCountSuffix: " \u4e2a\u6587\u4ef6",
  moreFilesPrefix: "\u8fd8\u6709 ",
  moreFilesSuffix: " \u4e2a\u6587\u4ef6",
  choosePrimaryCategory: "\u8bf7\u9009\u62e9\u4e00\u7ea7\u5206\u7c7b",
  chooseCategoryPath: "\u8bf7\u9009\u62e9\u5206\u7c7b\u8def\u5f84",
  chooseSubcategory: "\u8bf7\u9009\u62e9\u4e0b\u7ea7\u5206\u7c7b",
  noSubcategory: "\u5f53\u524d\u5206\u7c7b\u6682\u65e0\u4e0b\u7ea7\u5206\u7c7b",
  maxCategoryLevel: "\u6700\u591a\u652f\u6301\u56db\u7ea7\u5206\u7c7b",
  defaultFileName: "\u9ed8\u8ba4\u4f7f\u7528\u4e0a\u4f20\u65f6\u7684\u6587\u4ef6\u540d\u79f0",
  batchFileNameHint: "\u6279\u91cf\u4e0a\u4f20\u65f6\u5c06\u4f7f\u7528\u5404\u81ea\u7684\u539f\u6587\u4ef6\u540d\u79f0",
  batchOrganize: "\u6279\u91cf\u6574\u7406",
  selectedDocumentsPrefix: "\u5df2\u9009\u62e9 ",
  selectedDocumentsSuffix: " \u4efd\u6587\u4ef6",
  batchMoveToRecycle: "\u6279\u91cf\u79fb\u5165\u56de\u6536\u7ad9",
  batchExport: "\u6279\u91cf\u5bfc\u51fa",
  exportCategoryFiles: "\u5bfc\u51fa\u5f53\u524d\u5206\u7c7b",
  chooseDocumentsToExport: "\u8bf7\u5148\u9009\u62e9\u9700\u8981\u5bfc\u51fa\u7684\u6587\u4ef6",
  noFilesToExport: "\u5f53\u524d\u6ca1\u6709\u53ef\u5bfc\u51fa\u7684\u6587\u4ef6",
  exportSuccess: "\u5bfc\u51fa\u6587\u4ef6\u5df2\u751f\u6210",
  exportFailed: "\u5bfc\u51fa\u5931\u8d25",
  batchOrganizeTitle: "\u6279\u91cf\u6574\u7406\u6587\u4ef6",
  batchOrganizeDesc: "\u672a\u9009\u62e9\u7684\u5b57\u6bb5\u4fdd\u6301\u539f\u72b6\uff1b\u6807\u7b7e\u4f1a\u8ffd\u52a0\u5230\u5df2\u6709\u6807\u7b7e\u540e\u5e76\u81ea\u52a8\u53bb\u91cd\u3002",
  batchApply: "\u5e94\u7528\u6574\u7406",
  chooseDocumentsFirst: "\u8bf7\u5148\u9009\u62e9\u9700\u8981\u6574\u7406\u7684\u6587\u4ef6",
  batchNoChanges: "\u8bf7\u81f3\u5c11\u9009\u62e9\u4e00\u9879\u8981\u6574\u7406\u7684\u5185\u5bb9",
  batchOrganizedPrefix: "\u5df2\u6574\u7406 ",
  batchOrganizedSuffix: " \u4efd\u6587\u4ef6",
  batchOrganizePartialPrefix: "\u90e8\u5206\u6574\u7406\u5b8c\u6210\uff1a",
  batchOrganizePartialMiddle: " \u4efd\u6210\u529f\uff0c",
  batchOrganizePartialSuffix: " \u4efd\u5931\u8d25",
  batchOrganizeFailed: "\u6279\u91cf\u6574\u7406\u5931\u8d25",
  batchDeleteFile: "\u6279\u91cf\u5220\u9664\u6587\u4ef6",
  batchDeleteConfirmPrefix: "\u786e\u5b9a\u5c06\u9009\u4e2d\u7684 ",
  batchDeleteConfirmSuffix: " \u4efd\u6587\u4ef6\u79fb\u5165\u56de\u6536\u7ad9\u5417\uff1f\u53ef\u4ee5\u5728\u56de\u6536\u7ad9\u6062\u590d\u3002",
  batchDeletedPrefix: "\u5df2\u79fb\u5165\u56de\u6536\u7ad9 ",
  batchDeletedSuffix: " \u4efd\u6587\u4ef6",
  batchDeletePartialPrefix: "\u90e8\u5206\u5220\u9664\u5b8c\u6210\uff1a",
  batchDeletePartialMiddle: " \u4efd\u6210\u529f\uff0c",
  batchDeletePartialSuffix: " \u4efd\u5931\u8d25",
  batchDeleteFailed: "\u6279\u91cf\u5220\u9664\u5931\u8d25",
  department: "\u5f52\u5c5e\u90e8\u95e8",
  optional: "\u53ef\u9009",
  tags: "\u6807\u7b7e",
  tagPlaceholder: "\u591a\u4e2a\u6807\u7b7e\u7528\u9017\u53f7\u5206\u9694\uff0c\u53ef\u7559\u7a7a",
  remark: "\u5907\u6ce8",
  uploadSuccess: "\u6587\u4ef6\u4e0a\u4f20\u6210\u529f",
  droppedFilesAddedPrefix: "\u5df2\u6dfb\u52a0 ",
  droppedFilesAddedSuffix: " \u4e2a\u62d6\u5165\u6587\u4ef6\uff0c\u8bf7\u9009\u62e9\u5206\u7c7b\u540e\u4fdd\u5b58\u4e0a\u4f20",
  droppedFilesRejectedPrefix: "\u5df2\u5ffd\u7565 ",
  droppedFilesRejectedSuffix: " \u4e2a\u4e0d\u652f\u6301\u6216\u65e0\u6cd5\u8bfb\u53d6\u7684\u6587\u4ef6",
  loginBeforeDropUpload: "\u8bf7\u5148\u767b\u5f55\u540e\u518d\u62d6\u5165\u6587\u4ef6",
  uploadBatchSuccessPrefix: "\u5df2\u6210\u529f\u4e0a\u4f20 ",
  uploadBatchSuccessSuffix: " \u4e2a\u6587\u4ef6",
  uploadBatchPartialPrefix: "\u90e8\u5206\u4e0a\u4f20\u6210\u529f\uff1a",
  uploadBatchPartialMiddle: " \u4e2a\u6210\u529f\uff0c",
  uploadBatchPartialSuffix: " \u4e2a\u5931\u8d25",
  uploadBatchResultPrefix: "\u4e0a\u4f20\u5b8c\u6210\uff1a",
  uploadBatchResultSuccess: " \u4e2a\u6210\u529f",
  uploadBatchResultSkipped: " \u4e2a\u8df3\u8fc7",
  uploadBatchResultFailed: " \u4e2a\u5931\u8d25",
  chooseFileFirst: "\u8bf7\u5148\u9009\u62e9\u6587\u4ef6",
  uploadFailed: "\u6587\u4ef6\u4e0a\u4f20\u5931\u8d25",
  loadDocumentFailed: "\u6587\u4ef6\u8be6\u60c5\u52a0\u8f7d\u5931\u8d25",
  documentSaved: "\u6587\u4ef6\u4fe1\u606f\u5df2\u4fdd\u5b58",
  saveDocumentFailed: "\u4fdd\u5b58\u6587\u4ef6\u4fe1\u606f\u5931\u8d25",
  loadDocumentsFailed: "\u6587\u4ef6\u5217\u8868\u52a0\u8f7d\u5931\u8d25",
  loadCategoriesFailed: "\u5206\u7c7b\u52a0\u8f7d\u5931\u8d25",
  deleteFile: "\u5220\u9664\u6587\u4ef6",
  deleteConfirmPrefix: "\u786e\u5b9a\u5220\u9664\u201c",
  deleteConfirmSuffix: "\u201d\u5417\uff1f\u6587\u4ef6\u5c06\u79fb\u5165\u56de\u6536\u7ad9\uff0c\u53ef\u4ee5\u6062\u590d\u3002",
  deleted: "\u6587\u4ef6\u5df2\u79fb\u5165\u56de\u6536\u7ad9",
  deleteFailed: "\u5220\u9664\u5931\u8d25",
  restoreFile: "\u6062\u590d\u6587\u4ef6",
  restoreConfirmPrefix: "\u786e\u5b9a\u6062\u590d\u201c",
  restoreConfirmSuffix: "\u201d\u5417\uff1f",
  restored: "\u6587\u4ef6\u5df2\u6062\u590d",
  restoreFailed: "\u6062\u590d\u5931\u8d25",
  permanentDeleteFile: "\u5f7b\u5e95\u5220\u9664\u6587\u4ef6",
  permanentDeleteConfirmPrefix: "\u786e\u5b9a\u5f7b\u5e95\u5220\u9664\u201c",
  permanentDeleteConfirmSuffix: "\u201d\u5417\uff1f\u8fd9\u4f1a\u5220\u9664\u6570\u636e\u8bb0\u5f55\u548c storage \u4e2d\u7684\u771f\u5b9e\u6587\u4ef6\uff0c\u4e0d\u53ef\u6062\u590d\u3002",
  permanentlyDeleted: "\u6587\u4ef6\u5df2\u5f7b\u5e95\u5220\u9664",
  permanentDeleteFailed: "\u5f7b\u5e95\u5220\u9664\u5931\u8d25",
  downloadFailed: "\u4e0b\u8f7d\u5931\u8d25",
  noRecycleDocuments: "\u56de\u6536\u7ad9\u6682\u65e0\u6587\u4ef6",
  searchHint: "\u53ef\u8f93\u5165\u6587\u4ef6\u540d\u3001\u7f16\u53f7\u3001\u6807\u7b7e\u6216\u5206\u7c7b",
  searchResultCountPrefix: "\u5171\u627e\u5230 ",
  searchResultCountSuffix: " \u4efd\u6587\u4ef6",
  aiSearch: "AI \u6587\u4ef6\u68c0\u7d22",
  aiSearchTitle: "AI \u6587\u4ef6\u68c0\u7d22\u52a9\u624b",
  aiSearchPlaceholder: "\u4f8b\u5982\uff1a\u627e\u51fa\u548c\u6211\u754c\u667a\u80fd\u6709\u5173\u7684\u5408\u540c",
  aiSearchSubmit: "\u5f00\u59cb\u68c0\u7d22",
  aiSearchModeSemantic: "\u8bed\u4e49\u68c0\u7d22",
  aiSearchModeKeyword: "\u5173\u952e\u8bcd\u68c0\u7d22",
  aiSearchNoResults: "\u6682\u65e0\u76f8\u5173\u6587\u4ef6",
  aiSearchEmptyQuery: "\u8bf7\u8f93\u5165\u68c0\u7d22\u5185\u5bb9",
  aiSearchFailed: "AI \u68c0\u7d22\u5931\u8d25",
  rebuildIndex: "\u91cd\u5efa\u6587\u4ef6\u7d22\u5f15",
  rebuildIndexSuccess: "\u6587\u4ef6\u7d22\u5f15\u5df2\u91cd\u5efa",
  rebuildIndexFailed: "\u91cd\u5efa\u6587\u4ef6\u7d22\u5f15\u5931\u8d25",
  indexReadyCount: "\u5df2\u5c31\u7eea",
  indexUnsupportedCount: "\u4e0d\u652f\u6301",
  embeddingFailedCount: "\u5411\u91cf\u5931\u8d25",
  indexFailedCount: "\u5931\u8d25",
  matchedBy: "\u5339\u914d\u6765\u6e90",
  subcategoryCreated: "\u5b50\u5206\u7c7b\u5df2\u521b\u5efa",
  categorySaved: "\u5206\u7c7b\u5df2\u4fdd\u5b58",
  createCategoryFailed: "\u521b\u5efa\u5206\u7c7b\u5931\u8d25",
  saveCategoryFailed: "\u4fdd\u5b58\u5206\u7c7b\u5931\u8d25",
  deleteCategoryConfirmPrefix: "\u786e\u5b9a\u5220\u9664\u5206\u7c7b\u201c",
  deleteCategoryConfirmSuffix: "\u201d\u5417\uff1f\u5982\u679c\u5df2\u5173\u8054\u6587\u4ef6\u6216\u4e0b\u7ea7\u5206\u7c7b\uff0c\u7cfb\u7edf\u4f1a\u963b\u6b62\u5220\u9664\u3002",
  categoryDeleted: "\u5206\u7c7b\u5df2\u5220\u9664",
  deleteCategoryFailed: "\u5220\u9664\u5206\u7c7b\u5931\u8d25",
  enterCategoryName: "\u8bf7\u8f93\u5165\u5206\u7c7b\u540d\u79f0",
  categoryName: "\u5206\u7c7b\u540d\u79f0",
  none: "\u6682\u65e0",
  pieces: "\u4efd",
  items: "\u4e2a",
};

type PageKey = "dashboard" | "documents" | "recycle" | "categories" | "finance" | "ai-settings" | "business-matters";
const WEB_REMEMBERED_USERNAME_KEY = "enterprise-admin-docs.remembered-username";

interface LoginFormValues {
  username: string;
  password: string;
  rememberCredentials?: boolean;
}

interface UploadFormValues {
  title?: string;
  categoryPath: string[];
  departmentId?: string;
  tagNames?: string;
  remark?: string;
}

interface DocumentEditFormValues {
  title: string;
  categoryPath: string[];
  departmentId?: string;
  tagNames?: string;
  remark?: string;
}

interface DocumentMoveFormValues {
  categoryPath: string[];
}

interface BatchOrganizeFormValues {
  categoryPath?: string[];
  departmentId?: string;
  tagNames?: string;
}

type CategoryModalMode = "create-primary" | "create-child" | "edit";

interface CategoryFormValues {
  name: string;
  code?: string;
  parentId?: string;
  sort?: number;
}

function isFulfilled<T>(result: PromiseSettledResult<T>): result is PromiseFulfilledResult<T> {
  return result.status === "fulfilled";
}

function flattenCategories(nodes: CategoryNode[]): CategoryNode[] {
  return nodes.flatMap((node) => [node, ...flattenCategories(node.children ?? [])]);
}

function findCategory(nodes: CategoryNode[], id?: string): CategoryNode | undefined {
  if (!id) {
    return undefined;
  }
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }
    const child = findCategory(node.children ?? [], id);
    if (child) {
      return child;
    }
  }
  return undefined;
}

function findCategoryPath(nodes: CategoryNode[], id?: string): CategoryNode[] {
  if (!id) {
    return [];
  }
  for (const node of nodes) {
    if (node.id === id) {
      return [node];
    }
    const childPath = findCategoryPath(node.children ?? [], id);
    if (childPath.length) {
      return [node, ...childPath];
    }
  }
  return [];
}

function getCategoryPathIds(categories: CategoryNode[], categoryId?: string, subcategoryId?: string | null) {
  const targetId = subcategoryId ?? categoryId;
  return findCategoryPath(categories, targetId).map((item) => item.id);
}

function resolveCategorySelection(categoryPath?: string[]) {
  if (!categoryPath?.length) {
    return { categoryId: undefined, subcategoryId: undefined };
  }
  return {
    categoryId: categoryPath[0],
    subcategoryId: categoryPath.length > 1 ? categoryPath[categoryPath.length - 1] : null,
  };
}

function toCategoryOptions(nodes: CategoryNode[]): DefaultOptionType[] {
  return nodes.map((node) => ({
    label: node.name,
    value: node.id,
    children: node.children?.length ? toCategoryOptions(node.children) : undefined,
  }));
}

function getParentCategoryOptions(nodes: CategoryNode[]) {
  return flattenCategories(nodes)
    .filter((node) => node.level < 4)
    .map((node) => ({
      label: `${"\u3000".repeat(Math.max(0, node.level - 1))}${node.name}`,
      value: node.id,
    }));
}

function collectCategoryIds(node: CategoryNode): string[] {
  return [node.id, ...(node.children ?? []).flatMap(collectCategoryIds)];
}

function getDocumentTagNames(document: DocumentRecord) {
  return document.documentTags?.map((item) => item.tag.name).filter(Boolean) ?? [];
}

function parseTagNames(value?: string) {
  return (
    value
      ?.split(/[,，]/)
      .map((item) => item.trim())
      .filter(Boolean) ?? []
  );
}

function mergeTagNames(existing: string[], added: string[]) {
  const names: string[] = [];
  const normalizedNames = new Set<string>();
  for (const rawName of [...existing, ...added]) {
    const name = rawName.trim();
    const normalized = name.toLocaleLowerCase("zh-CN");
    if (!name || normalizedNames.has(normalized)) {
      continue;
    }
    normalizedNames.add(normalized);
    names.push(name);
  }
  return names;
}

function formatDate(value?: string | null) {
  if (!value) {
    return "-";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatSize(size?: number | null) {
  if (!size) {
    return "-";
  }
  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.ceil(size / 1024))} KB`;
  }
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function isDesktopPickedFile(file: UploadSelectedFile): file is DesktopPickedFile {
  return "id" in file;
}

function getCategoryDocuments(category: CategoryNode, documents: DocumentRecord[]) {
  const ids = new Set(collectCategoryIds(category));
  return documents.filter((document) =>
    category.level === 1 ? document.categoryId === category.id : Boolean(document.subcategoryId && ids.has(document.subcategoryId)),
  );
}

function getCategoryPathText(categories: CategoryNode[], categoryId?: string, subcategoryId?: string | null) {
  const path = findCategoryPath(categories, subcategoryId ?? categoryId);
  return path.length ? path.map((item) => item.name).join(" / ") : "-";
}

function isCurrentMonth(value: string) {
  const date = new Date(value);
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function getLatestUpdatedAt(documents: DocumentRecord[]) {
  return documents.reduce<string | undefined>((latest, document) => {
    if (!latest || new Date(document.updatedAt).getTime() > new Date(latest).getTime()) {
      return document.updatedAt;
    }
    return latest;
  }, undefined);
}

function getFileTypeMeta(document: DocumentRecord) {
  const ext =
    document.currentVersion?.fileExt?.toLowerCase() ??
    document.currentVersion?.originalFileName.split(".").pop()?.toLowerCase() ??
    "";
  if (ext === "pdf") {
    return { label: "PDF", color: "red", icon: <FilePdfOutlined /> };
  }
  if (["doc", "docx"].includes(ext)) {
    return { label: "Word", color: "blue", icon: <FileWordOutlined /> };
  }
  if (["xls", "xlsx"].includes(ext)) {
    return { label: "Excel", color: "green", icon: <FileExcelOutlined /> };
  }
  if (["jpg", "jpeg", "png"].includes(ext)) {
    return { label: "\u56fe\u7247", color: "purple", icon: <FileImageOutlined /> };
  }
  if (["zip", "rar"].includes(ext)) {
    return { label: "\u538b\u7f29\u5305", color: "orange", icon: <FileZipOutlined /> };
  }
  return { label: ext ? ext.toUpperCase() : "\u672a\u77e5", color: "default", icon: <FileUnknownOutlined /> };
}

const printableFileExtensions = new Set([
  "pdf",
  "jpg",
  "jpeg",
  "png",
  "txt",
  "md",
  "log",
  "csv",
  "tsv",
  "xml",
  "json",
]);

function getVersionExtension(version: DocumentVersionRecord) {
  return (version.fileExt || version.originalFileName.split(".").pop() || "").replace(/^\./, "").toLowerCase();
}

function isPrintableVersion(version?: DocumentVersionRecord | null) {
  return Boolean(version && printableFileExtensions.has(getVersionExtension(version)));
}

function renderPrintPreview(printWindow: Window, blob: Blob, fileName: string) {
  const blobUrl = URL.createObjectURL(blob);
  const previewDocument = printWindow.document;
  printWindow.opener = null;
  previewDocument.title = fileName;
  previewDocument.head.replaceChildren();
  previewDocument.body.replaceChildren();

  const style = previewDocument.createElement("style");
  style.textContent = "html,body{height:100%;margin:0}body{background:#f5f6f8}iframe{display:block;width:100%;height:100%;border:0;background:#fff}@media print{body{background:#fff}iframe{height:100vh}}";
  previewDocument.head.append(style);

  const frame = previewDocument.createElement("iframe");
  frame.title = fileName;
  frame.src = blobUrl;
  previewDocument.body.append(frame);

  let printed = false;
  const print = () => {
    if (printed || printWindow.closed) {
      return;
    }
    printed = true;
    printWindow.focus();
    printWindow.print();
  };
  frame.addEventListener("load", () => window.setTimeout(print, 300), { once: true });
  window.setTimeout(print, 1500);
  printWindow.addEventListener("afterprint", () => URL.revokeObjectURL(blobUrl), { once: true });
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 10 * 60 * 1000);
}

function toTreeData(nodes: CategoryNode[], documents: DocumentRecord[]): DataNode[] {
  return nodes.map((node) => ({
    key: node.id,
    title: (
      <div className={`category-tree-title category-tree-title-${node.level === 1 ? "primary" : "child"}`}>
        <Space size={8}>
          {node.level === 1 ? <FolderOpenOutlined /> : <FileTextOutlined />}
          <span>{node.name}</span>
        </Space>
        <Tag color={node.level === 1 ? "blue" : "default"}>{getCategoryDocuments(node, documents).length}</Tag>
      </div>
    ),
    children: node.children?.length ? toTreeData(node.children, documents) : undefined,
  }));
}

export default function App() {
  const [user, setUser] = useState<PublicUser | null>(getStoredUser());
  const [page, setPage] = useState<PageKey>("dashboard");
  const [collapsed, setCollapsed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [recycleDocuments, setRecycleDocuments] = useState<DocumentRecord[]>([]);
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [departments, setDepartments] = useState<DepartmentRecord[]>([]);
  const [tags, setTags] = useState<TagRecord[]>([]);
  const [partners, setPartners] = useState<PartnerRecord[]>([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [desktopDropActive, setDesktopDropActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<UploadSelectedFile[]>([]);
  const [duplicatePrompt, setDuplicatePrompt] = useState<DuplicateUploadPromptState | null>(null);
  const [versionUpdateTarget, setVersionUpdateTarget] = useState<DocumentRecord | null>(null);
  const [versionUpdating, setVersionUpdating] = useState(false);
  const [selectedVersionFile, setSelectedVersionFile] = useState<UploadSelectedFile | null>(null);
  const [detailDocument, setDetailDocument] = useState<DocumentRecord | null>(null);
  const [detailVersions, setDetailVersions] = useState<DocumentVersionRecord[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [documentEditOpen, setDocumentEditOpen] = useState(false);
  const [documentSaving, setDocumentSaving] = useState(false);
  const [moveDocumentTarget, setMoveDocumentTarget] = useState<DocumentRecord | null>(null);
  const [documentMoving, setDocumentMoving] = useState(false);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [batchOrganizeOpen, setBatchOrganizeOpen] = useState(false);
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [batchSubmitting, setBatchSubmitting] = useState(false);
  const [exportingDocuments, setExportingDocuments] = useState(false);
  const [documentQuery, setDocumentQuery] = useState("");
  const [selectedCategoryPath, setSelectedCategoryPath] = useState<string[]>([]);
  const [selectedTagId, setSelectedTagId] = useState<string | undefined>();
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | undefined>();
  const [documentTotalCount, setDocumentTotalCount] = useState(0);
  const [documentSearchDocuments, setDocumentSearchDocuments] = useState<DocumentRecord[]>([]);
  const [documentSearchLoading, setDocumentSearchLoading] = useState(false);
  const [documentSearchTotal, setDocumentSearchTotal] = useState(0);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantQuery, setAssistantQuery] = useState("");
  const [assistantResult, setAssistantResult] = useState<SearchAssistantResponse | null>(null);
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [rebuildingIndex, setRebuildingIndex] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [categoryModalMode, setCategoryModalMode] = useState<CategoryModalMode>("create-child");
  const [editingCategory, setEditingCategory] = useState<CategoryNode | null>(null);
  const [categoryDeleteTarget, setCategoryDeleteTarget] = useState<CategoryNode | null>(null);
  const [categorySubmitting, setCategorySubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DocumentRecord | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<DocumentRecord | null>(null);
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState<DocumentRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [recycleActionLoading, setRecycleActionLoading] = useState(false);
  const [categoryForm] = Form.useForm<CategoryFormValues>();
  const [documentEditForm] = Form.useForm<DocumentEditFormValues>();
  const [documentMoveForm] = Form.useForm<DocumentMoveFormValues>();
  const [batchForm] = Form.useForm<BatchOrganizeFormValues>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const versionFileInputRef = useRef<HTMLInputElement>(null);
  const duplicateDecisionResolverRef = useRef<((decision: DuplicateUploadDecision) => void) | null>(null);

  const fetchAllDocuments = async (recycle = false, query: Omit<DocumentListQuery, "page" | "pageSize"> = {}) => {
    const pageSize = 100;
    const collected: DocumentRecord[] = [];
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
      const result = await listDocuments({ ...query, page, pageSize }, recycle);
      collected.push(...result.items);
      totalPages = result.pagination.totalPages || 1;
      if (!result.items.length) {
        break;
      }
      page += 1;
    }

    return collected;
  };

  const uploadFileAsDocument = async (
    file: UploadSelectedFile,
    fields: {
      categoryId: string;
      subcategoryId?: string;
      departmentId?: string;
      title?: string;
      remark?: string;
      tagNames: string[];
    },
  ) => {
    if (isDesktopPickedFile(file) && window.adminDocsDesktop) {
      await window.adminDocsDesktop.uploadDocument({
        fileId: file.id,
        accessToken: getStoredToken() ?? "",
        fields,
      });
      return;
    }

    const formData = new FormData();
    formData.append("file", file as File);
    formData.append("categoryId", fields.categoryId);
    if (fields.subcategoryId) {
      formData.append("subcategoryId", fields.subcategoryId);
    }
    if (fields.departmentId) {
      formData.append("departmentId", fields.departmentId);
    }
    if (fields.title) {
      formData.append("title", fields.title);
    }
    if (fields.remark) {
      formData.append("remark", fields.remark);
    }
    fields.tagNames.forEach((tagName) => formData.append("tagNames", tagName));
    await uploadDocument(formData);
  };

  const uploadFileAsVersion = async (file: UploadSelectedFile, documentId: string, changeNote?: string) => {
    if (isDesktopPickedFile(file) && window.adminDocsDesktop) {
      await window.adminDocsDesktop.uploadDocumentVersion({
        documentId,
        fileId: file.id,
        accessToken: getStoredToken() ?? "",
        changeNote,
      });
      return;
    }

    const formData = new FormData();
    formData.append("file", file as File);
    if (changeNote) {
      formData.append("changeNote", changeNote);
    }
    await uploadDocumentVersion(documentId, formData);
  };

  const promptDuplicateUpload = (file: UploadSelectedFile, matches: DocumentRecord[]) =>
    new Promise<DuplicateUploadDecision>((resolve) => {
      duplicateDecisionResolverRef.current = resolve;
      setDuplicatePrompt({ file, matches });
    });

  const resolveDuplicatePrompt = (decision: DuplicateUploadDecision) => {
    duplicateDecisionResolverRef.current?.(decision);
    duplicateDecisionResolverRef.current = null;
    setDuplicatePrompt(null);
  };

  const loadData = async () => {
    if (!getStoredToken()) {
      return;
    }
    setLoading(true);
    try {
      const currentUser = getStoredUser();
      const results = await Promise.allSettled([
        fetchAllDocuments(false, { sortBy: "updatedAt", sortOrder: "desc" }),
        currentUser?.role === "ADMIN"
          ? fetchAllDocuments(true, { sortBy: "updatedAt", sortOrder: "desc" })
          : Promise.resolve([] as DocumentRecord[]),
        listCategories(),
        listPartners(),
        listTags(),
        listDepartments(),
      ]);

      const [documentsResult, recycleResult, categoriesResult, partnersResult, tagsResult, departmentsResult] = results;
      if (isFulfilled(documentsResult)) {
        setDocuments(documentsResult.value);
        setDocumentTotalCount(documentsResult.value.length);
      } else {
        message.error(`${text.loadDocumentsFailed}: ${formatApiError(documentsResult.reason)}`);
      }
      if (isFulfilled(recycleResult)) {
        setRecycleDocuments(recycleResult.value);
      }
      if (isFulfilled(categoriesResult)) {
        setCategories(categoriesResult.value);
      } else {
        message.error(`${text.loadCategoriesFailed}: ${formatApiError(categoriesResult.reason)}`);
      }
      if (isFulfilled(partnersResult)) {
        setPartners(partnersResult.value.items);
      }
      if (isFulfilled(tagsResult)) {
        setTags(tagsResult.value);
      }
      if (isFulfilled(departmentsResult)) {
        setDepartments(departmentsResult.value);
      }
    } finally {
      setLoading(false);
    }
  };

  const runAssistantSearch = async () => {
    const query = assistantQuery.trim();
    if (!query) {
      message.warning(text.aiSearchEmptyQuery);
      return;
    }
    setAssistantLoading(true);
    try {
      setAssistantResult(await searchWithAssistant(query));
    } catch (error) {
      message.error(`${text.aiSearchFailed}: ${formatApiError(error)}`);
    } finally {
      setAssistantLoading(false);
    }
  };

  const handleRebuildIndex = async () => {
    setRebuildingIndex(true);
    try {
      const result = await rebuildDocumentContentIndex();
      message.success(
        `${text.rebuildIndexSuccess}：${result.ready} ${text.indexReadyCount}，${result.unsupported} ${text.indexUnsupportedCount}，${result.failed} ${text.indexFailedCount}，${result.embeddingFailed} ${text.embeddingFailedCount}`,
      );
    } catch (error) {
      message.error(`${text.rebuildIndexFailed}: ${formatApiError(error)}`);
    } finally {
      setRebuildingIndex(false);
    }
  };

  useEffect(() => {
    const handleLogout = () => setUser(null);
    window.addEventListener("auth:logout", handleLogout);
    return () => window.removeEventListener("auth:logout", handleLogout);
  }, []);

  useEffect(() => {
    const syncSidebar = () => {
      if (window.innerWidth < 960) {
        setCollapsed(true);
      }
    };
    syncSidebar();
    window.addEventListener("resize", syncSidebar);
    return () => window.removeEventListener("resize", syncSidebar);
  }, []);

  useEffect(() => {
    const unsubscribe = window.adminDocsDesktop?.onDroppedFiles((payload) => {
      window.adminDocsDesktop?.debug("renderer-drop-received", {
        fileCount: payload.files.length,
        rejectedCount: payload.rejectedCount,
      });
      setDesktopDropActive(false);
      if (!user) {
        message.warning(text.loginBeforeDropUpload);
        return;
      }
      if (payload.files.length) {
        setSelectedFiles(payload.files);
        setUploadOpen(true);
        message.success(`${text.droppedFilesAddedPrefix}${payload.files.length}${text.droppedFilesAddedSuffix}`);
      }
      if (payload.rejectedCount) {
        message.warning(`${text.droppedFilesRejectedPrefix}${payload.rejectedCount}${text.droppedFilesRejectedSuffix}`);
      }
    });
    return unsubscribe;
  }, [user]);

  useEffect(() => {
    if (!user || !window.adminDocsDesktop) {
      return;
    }
    let dragDepth = 0;
    const hasFiles = (event: DragEvent) => {
      const items = Array.from(event.dataTransfer?.items ?? []);
      if (items.some((item) => item.kind === "file")) {
        return true;
      }
      return Array.from(event.dataTransfer?.types ?? []).includes("Files");
    };
    const handleDragEnter = (event: DragEvent) => {
      if (hasFiles(event)) {
        dragDepth += 1;
        setDesktopDropActive(true);
      }
    };
    const handleDragLeave = (event: DragEvent) => {
      if (hasFiles(event)) {
        dragDepth = Math.max(0, dragDepth - 1);
        if (!dragDepth) {
          setDesktopDropActive(false);
        }
      }
    };
    const handleDrop = () => {
      dragDepth = 0;
      setDesktopDropActive(false);
    };
    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("drop", handleDrop);
    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("drop", handleDrop);
    };
  }, [user]);

  useEffect(() => {
    if (user) {
      void loadData();
    }
  }, [user]);

  useEffect(() => {
    if (!user || page !== "documents") {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setDocumentSearchLoading(true);
      try {
        const categorySelection = resolveCategorySelection(selectedCategoryPath);
        const result = await fetchAllDocuments(false, {
          keyword: documentQuery.trim() || undefined,
          categoryId: categorySelection.categoryId,
          subcategoryId: categorySelection.subcategoryId ?? undefined,
          tagId: selectedTagId,
          partnerId: selectedPartnerId,
          sortBy: "updatedAt",
          sortOrder: "desc",
        });
        if (!cancelled) {
          setDocumentSearchDocuments(result);
          setDocumentSearchTotal(result.length);
        }
      } catch (error) {
        if (!cancelled) {
          message.error(`${text.loadDocumentsFailed}: ${formatApiError(error)}`);
        }
      } finally {
        if (!cancelled) {
          setDocumentSearchLoading(false);
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [documentQuery, page, selectedCategoryPath, selectedPartnerId, selectedTagId, user]);

  const selectedDocuments = useMemo(
    () => {
      const byId = new Map([...documents, ...documentSearchDocuments].map((item) => [item.id, item]));
      return selectedDocumentIds.flatMap((id) => {
        const document = byId.get(id);
        return document ? [document] : [];
      });
    },
    [documentSearchDocuments, documents, selectedDocumentIds],
  );

  useEffect(() => {
    setSelectedDocumentIds((ids) => {
      const activeIds = new Set([...documents, ...documentSearchDocuments].map((item) => item.id));
      const nextIds = ids.filter((id) => activeIds.has(id));
      return nextIds.length === ids.length ? ids : nextIds;
    });
  }, [documentSearchDocuments, documents]);

  const handleLogin = async (values: LoginFormValues) => {
    setLoginLoading(true);
    setLoginError("");
    const username = values.username.trim();
    try {
      const result = await login(username, values.password);
      setStoredAuth(result.accessToken, result.user);
      try {
        if (values.rememberCredentials) {
          if (window.adminDocsDesktop) {
            await window.adminDocsDesktop.saveLogin({ username, password: values.password });
          } else {
            localStorage.setItem(WEB_REMEMBERED_USERNAME_KEY, username);
          }
        } else {
          await window.adminDocsDesktop?.clearSavedLogin();
          localStorage.removeItem(WEB_REMEMBERED_USERNAME_KEY);
        }
      } catch (saveError) {
        message.warning(saveError instanceof Error ? saveError.message : "账号密码保存失败");
      }
      setUser(result.user);
      message.success(text.loginSuccess);
    } catch (error) {
      const errorMessage = formatApiError(error);
      setLoginError(errorMessage);
      message.error(errorMessage);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    clearStoredAuth();
    setUser(null);
    setDocuments([]);
    setRecycleDocuments([]);
    setCategories([]);
    setDepartments([]);
    setTags([]);
    setPartners([]);
    setPage("dashboard");
  };

  const refresh = async () => {
    await loadData();
    message.success(text.refreshed);
  };

  const openDocumentDetail = async (record: DocumentRecord) => {
    setDetailDocument(record);
    setDetailVersions([]);
    setDetailLoading(true);
    try {
      const [detail, versions] = await Promise.all([getDocument(record.id), listDocumentVersions(record.id)]);
      setDetailDocument(detail);
      setDetailVersions(versions);
    } catch (error) {
      message.error(`${text.loadDocumentFailed}: ${formatApiError(error)}`);
    } finally {
      setDetailLoading(false);
    }
  };

  const openEditDocument = (record: DocumentRecord) => {
    documentEditForm.resetFields();
    documentEditForm.setFieldsValue({
      title: record.title,
      categoryPath: getCategoryPathIds(categories, record.categoryId, record.subcategoryId),
      departmentId: record.departmentId ?? undefined,
      tagNames: getDocumentTagNames(record).join(", "),
      remark: record.remark ?? undefined,
    });
    setDocumentEditOpen(true);
  };

  const saveDocument = async () => {
    if (!detailDocument) {
      return;
    }
    try {
      const values = await documentEditForm.validateFields();
      setDocumentSaving(true);
      const tagNames = parseTagNames(values.tagNames);
      const categorySelection = resolveCategorySelection(values.categoryPath);
      const updated = await updateDocument(detailDocument.id, {
        title: values.title.trim(),
        categoryId: categorySelection.categoryId,
        subcategoryId: categorySelection.subcategoryId,
        departmentId: values.departmentId ?? null,
        tagNames,
        remark: values.remark?.trim() ?? "",
      });
      message.success(text.documentSaved);
      setDetailDocument(updated);
      setDocumentEditOpen(false);
      documentEditForm.resetFields();
      await loadData();
    } catch (error) {
      if (error && typeof error === "object" && "errorFields" in error) {
        return;
      }
      message.error(`${text.saveDocumentFailed}: ${formatApiError(error)}`);
    } finally {
      setDocumentSaving(false);
    }
  };

  const openMoveDocument = (record: DocumentRecord) => {
    documentMoveForm.resetFields();
    documentMoveForm.setFieldsValue({
      categoryPath: getCategoryPathIds(categories, record.categoryId, record.subcategoryId),
    });
    setMoveDocumentTarget(record);
  };

  const moveDocument = async () => {
    if (!moveDocumentTarget) {
      return;
    }
    try {
      const values = await documentMoveForm.validateFields();
      const categorySelection = resolveCategorySelection(values.categoryPath);
      if (
        categorySelection.categoryId === moveDocumentTarget.categoryId &&
        categorySelection.subcategoryId === moveDocumentTarget.subcategoryId
      ) {
        message.info(text.documentAlreadyInCategory);
        return;
      }

      setDocumentMoving(true);
      const updated = await updateDocument(moveDocumentTarget.id, {
        categoryId: categorySelection.categoryId,
        subcategoryId: categorySelection.subcategoryId,
      });
      if (detailDocument?.id === updated.id) {
        setDetailDocument(updated);
      }
      message.success(text.documentMoved);
      setMoveDocumentTarget(null);
      documentMoveForm.resetFields();
      await loadData();
    } catch (error) {
      if (error && typeof error === "object" && "errorFields" in error) {
        return;
      }
      message.error(`${text.moveDocumentFailed}: ${formatApiError(error)}`);
    } finally {
      setDocumentMoving(false);
    }
  };

  const openBatchOrganize = () => {
    if (!selectedDocumentIds.length) {
      message.warning(text.chooseDocumentsFirst);
      return;
    }
    batchForm.resetFields();
    setBatchOrganizeOpen(true);
  };

  const confirmBatchOrganize = async () => {
    if (!selectedDocuments.length) {
      message.warning(text.chooseDocumentsFirst);
      return;
    }
    try {
      const values = await batchForm.validateFields();
      const tagNames = parseTagNames(values.tagNames);
      const categorySelection = resolveCategorySelection(values.categoryPath);
      const hasCategory = Boolean(categorySelection.categoryId);
      const hasDepartment = Boolean(values.departmentId);
      const hasTags = tagNames.length > 0;

      if (!hasCategory && !hasDepartment && !hasTags) {
        message.warning(text.batchNoChanges);
        return;
      }

      setBatchSubmitting(true);
      let successCount = 0;
      let failedCount = 0;

      for (const document of selectedDocuments) {
        const payload: Record<string, unknown> = {};
        if (hasCategory) {
          payload.categoryId = categorySelection.categoryId;
          payload.subcategoryId = categorySelection.subcategoryId;
        }
        if (hasDepartment) {
          payload.departmentId = values.departmentId;
        }
        if (hasTags) {
          payload.tagNames = mergeTagNames(getDocumentTagNames(document), tagNames);
        }

        try {
          await updateDocument(document.id, payload);
          successCount += 1;
        } catch {
          failedCount += 1;
        }
      }

      if (successCount > 0 && failedCount === 0) {
        message.success(`${text.batchOrganizedPrefix}${successCount}${text.batchOrganizedSuffix}`);
        setBatchOrganizeOpen(false);
        setSelectedDocumentIds([]);
        batchForm.resetFields();
      } else if (successCount > 0) {
        message.warning(
          `${text.batchOrganizePartialPrefix}${successCount}${text.batchOrganizePartialMiddle}${failedCount}${text.batchOrganizePartialSuffix}`,
        );
      } else {
        message.error(text.batchOrganizeFailed);
      }
      await loadData();
    } catch (error) {
      if (error && typeof error === "object" && "errorFields" in error) {
        return;
      }
      message.error(`${text.batchOrganizeFailed}: ${formatApiError(error)}`);
    } finally {
      setBatchSubmitting(false);
    }
  };

  const handleUpload = async (values: UploadFormValues) => {
    if (selectedFiles.length === 0) {
      message.warning(text.chooseFileFirst);
      return;
    }
    const categorySelection = resolveCategorySelection(values.categoryPath);
    if (!categorySelection.categoryId) {
      message.warning(text.chooseCategoryPath);
      return;
    }
    setUploading(true);
    try {
      const title = values.title?.trim();
      const remark = values.remark?.trim();
      const tagNames = parseTagNames(values.tagNames);
      const failedFiles: UploadSelectedFile[] = [];
      const failedReasons: string[] = [];
      let successCount = 0;
      let skippedCount = 0;

      for (const file of selectedFiles) {
        try {
          const fields = {
            categoryId: categorySelection.categoryId,
            subcategoryId: categorySelection.subcategoryId ?? undefined,
            departmentId: values.departmentId,
            title: selectedFiles.length === 1 ? title : undefined,
            remark,
            tagNames,
          };
          const duplicates = await findDuplicateDocuments(file.name.trim());
          if (duplicates.length > 0) {
            const decision = await promptDuplicateUpload(file, duplicates);
            if (decision.action === "skip") {
              skippedCount += 1;
              continue;
            }
            await uploadFileAsVersion(file, decision.document.id);
            successCount += 1;
            continue;
          }
          await uploadFileAsDocument(file, fields);
          successCount += 1;
        } catch (error) {
          failedFiles.push(file);
          failedReasons.push(formatApiError(error));
        }
      }

      const failedCount = failedFiles.length;
      const resultParts = [
        successCount > 0 ? `${successCount}${text.uploadBatchResultSuccess}` : null,
        skippedCount > 0 ? `${skippedCount}${text.uploadBatchResultSkipped}` : null,
        failedCount > 0 ? `${failedCount}${text.uploadBatchResultFailed}` : null,
      ].filter(Boolean);
      const resultMessage = `${text.uploadBatchResultPrefix}${resultParts.join("\uff0c")}`;

      if (failedCount === 0 && successCount > 0) {
        message.success(
          selectedFiles.length === 1 && skippedCount === 0
            ? text.uploadSuccess
            : resultMessage,
        );
        setUploadOpen(false);
        setSelectedFiles([]);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      } else if (failedCount === 0) {
        message.info(resultMessage);
        setUploadOpen(false);
        setSelectedFiles([]);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      } else if (successCount > 0 || skippedCount > 0) {
        message.warning(resultMessage);
        setSelectedFiles(failedFiles);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      } else {
        message.error(
          failedReasons.length === 1
            ? `${text.uploadFailed}: ${failedReasons[0]}`
            : `${text.uploadFailed}: ${failedReasons.slice(0, 3).join("；")}`,
        );
      }
      await loadData();
    } catch (error) {
      message.error(`${text.uploadFailed}: ${formatApiError(error)}`);
    } finally {
      setUploading(false);
    }
  };

  const openVersionUpdate = (record: DocumentRecord) => {
    setVersionUpdateTarget(record);
    setSelectedVersionFile(null);
    if (versionFileInputRef.current) {
      versionFileInputRef.current.value = "";
    }
  };

  const handleVersionUpdate = async (values: { changeNote?: string }) => {
    if (!versionUpdateTarget) {
      return;
    }
    if (!selectedVersionFile) {
      message.warning(text.chooseFileFirst);
      return;
    }

    setVersionUpdating(true);
    try {
      const changeNote = values.changeNote?.trim();
      await uploadFileAsVersion(selectedVersionFile, versionUpdateTarget.id, changeNote);

      message.success(text.versionUpdated);
      setVersionUpdateTarget(null);
      setSelectedVersionFile(null);
      if (versionFileInputRef.current) {
        versionFileInputRef.current.value = "";
      }
      await loadData();
      if (detailDocument?.id === versionUpdateTarget.id) {
        await openDocumentDetail(versionUpdateTarget);
      }
    } catch (error) {
      message.error(`${text.versionUpdateFailed}: ${formatApiError(error)}`);
    } finally {
      setVersionUpdating(false);
    }
  };

  const handleDownload = async (record: DocumentRecord) => {
    try {
      const blob = await downloadDocumentBlob(record.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = record.currentVersion?.originalFileName ?? record.title;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      message.error(`${text.downloadFailed}: ${formatApiError(error)}`);
    }
  };

  const saveBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportSelectedDocuments = async () => {
    if (!selectedDocumentIds.length) {
      message.warning(text.chooseDocumentsToExport);
      return;
    }
    setExportingDocuments(true);
    try {
      const result = await exportDocumentsBlob({ documentIds: selectedDocumentIds });
      saveBlob(result.blob, result.fileName);
      message.success(text.exportSuccess);
    } catch (error) {
      message.error(`${text.exportFailed}: ${formatApiError(error)}`);
    } finally {
      setExportingDocuments(false);
    }
  };

  const exportCategoryFiles = async (category: CategoryNode) => {
    const categoryDocuments = getCategoryDocuments(category, documents);
    if (!categoryDocuments.length) {
      message.warning(text.noFilesToExport);
      return;
    }
    setExportingDocuments(true);
    try {
      const result = await exportDocumentsBlob({ categoryId: category.id });
      saveBlob(result.blob, result.fileName);
      message.success(text.exportSuccess);
    } catch (error) {
      message.error(`${text.exportFailed}: ${formatApiError(error)}`);
    } finally {
      setExportingDocuments(false);
    }
  };

  const handleDownloadVersion = async (record: DocumentRecord, version: DocumentVersionRecord) => {
    try {
      const blob = await downloadDocumentBlob(record.id, version.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = version.originalFileName;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      message.error(`${text.downloadFailed}: ${formatApiError(error)}`);
    }
  };

  const handleOpenDocumentFile = async (record: DocumentRecord, version?: DocumentVersionRecord | null) => {
    const targetVersion = version ?? record.currentVersion;
    if (!window.adminDocsDesktop) {
      if (targetVersion) {
        await handlePreviewVersion(record, targetVersion);
      } else {
        message.warning(text.openFileRequiresDesktop);
      }
      return;
    }

    try {
      await window.adminDocsDesktop.openDocumentFile({
        documentId: record.id,
        versionId: targetVersion?.id,
        accessToken: getStoredToken() ?? "",
        fileName: targetVersion?.originalFileName ?? record.title,
      });
    } catch (error) {
      message.error(`${text.openFileFailed}: ${error instanceof Error ? error.message : formatApiError(error)}`);
    }
  };

  const handlePreviewVersion = async (record: DocumentRecord, version: DocumentVersionRecord) => {
    try {
      const blob = await downloadDocumentBlob(record.id, version.id, true);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      message.error(`${text.previewFailed}: ${formatApiError(error)}`);
    }
  };

  const handlePrintVersion = async (record: DocumentRecord, version: DocumentVersionRecord) => {
    if (!isPrintableVersion(version)) {
      message.warning(text.printUnsupported);
      return;
    }

    if (window.adminDocsDesktop) {
      try {
        await window.adminDocsDesktop.printDocumentFile({
          documentId: record.id,
          versionId: version.id,
          accessToken: getStoredToken() ?? "",
          fileName: version.originalFileName,
        });
        message.success(text.printStarted);
      } catch (error) {
        message.error(`${text.printFailed}: ${error instanceof Error ? error.message : formatApiError(error)}`);
      }
      return;
    }

    const printWindow = window.open("", "_blank", "width=1000,height=800");
    if (!printWindow) {
      message.error(text.printPopupBlocked);
      return;
    }

    try {
      const blob = await downloadDocumentBlob(record.id, version.id, true);
      renderPrintPreview(printWindow, blob, version.originalFileName);
      message.success(text.printStarted);
    } catch (error) {
      printWindow.close();
      message.error(`${text.printFailed}: ${formatApiError(error)}`);
    }
  };

  const handlePrintDocument = async (record: DocumentRecord) => {
    if (!record.currentVersion) {
      message.warning(text.printUnsupported);
      return;
    }
    await handlePrintVersion(record, record.currentVersion);
  };

  const handleDelete = (record: DocumentRecord) => {
    setDeleteTarget(record);
  };

  const openBatchDelete = () => {
    if (!selectedDocumentIds.length) {
      message.warning(text.chooseDocumentsFirst);
      return;
    }
    setBatchDeleteOpen(true);
  };

  const confirmBatchDelete = async () => {
    if (!selectedDocuments.length) {
      message.warning(text.chooseDocumentsFirst);
      return;
    }
    setDeleting(true);
    try {
      let successCount = 0;
      let failedCount = 0;
      for (const document of selectedDocuments) {
        try {
          await deleteDocument(document.id);
          successCount += 1;
        } catch {
          failedCount += 1;
        }
      }

      if (successCount > 0 && failedCount === 0) {
        message.success(`${text.batchDeletedPrefix}${successCount}${text.batchDeletedSuffix}`);
        setBatchDeleteOpen(false);
        setSelectedDocumentIds([]);
      } else if (successCount > 0) {
        message.warning(
          `${text.batchDeletePartialPrefix}${successCount}${text.batchDeletePartialMiddle}${failedCount}${text.batchDeletePartialSuffix}`,
        );
      } else {
        message.error(text.batchDeleteFailed);
      }
      if (detailDocument && selectedDocumentIds.includes(detailDocument.id)) {
        setDetailDocument(null);
        setDocumentEditOpen(false);
      }
      await loadData();
    } catch (error) {
      message.error(`${text.batchDeleteFailed}: ${formatApiError(error)}`);
    } finally {
      setDeleting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) {
      return;
    }
    setDeleting(true);
    try {
      await deleteDocument(deleteTarget.id);
      message.success(text.deleted);
      if (detailDocument?.id === deleteTarget.id) {
        setDetailDocument(null);
        setDocumentEditOpen(false);
      }
      setDeleteTarget(null);
      await loadData();
    } catch (error) {
      message.error(`${text.deleteFailed}: ${formatApiError(error)}`);
    } finally {
      setDeleting(false);
    }
  };

  const handleRestore = (record: DocumentRecord) => {
    setRestoreTarget(record);
  };

  const confirmRestore = async () => {
    if (!restoreTarget) {
      return;
    }
    setRecycleActionLoading(true);
    try {
      await restoreDocument(restoreTarget.id);
      message.success(text.restored);
      setRestoreTarget(null);
      await loadData();
    } catch (error) {
      message.error(`${text.restoreFailed}: ${formatApiError(error)}`);
    } finally {
      setRecycleActionLoading(false);
    }
  };

  const handlePermanentDelete = (record: DocumentRecord) => {
    setPermanentDeleteTarget(record);
  };

  const confirmPermanentDelete = async () => {
    if (!permanentDeleteTarget) {
      return;
    }
    setRecycleActionLoading(true);
    try {
      await permanentlyDeleteDocument(permanentDeleteTarget.id);
      message.success(text.permanentlyDeleted);
      setPermanentDeleteTarget(null);
      await loadData();
    } catch (error) {
      message.error(`${text.permanentDeleteFailed}: ${formatApiError(error)}`);
    } finally {
      setRecycleActionLoading(false);
    }
  };

  const openCreatePrimaryCategory = () => {
    setCategoryModalMode("create-primary");
    setEditingCategory(null);
    categoryForm.resetFields();
    categoryForm.setFieldsValue({ sort: categories.length });
    setCategoryModalOpen(true);
  };

  const openCreateChildCategory = (parentId?: string) => {
    setCategoryModalMode("create-child");
    setEditingCategory(null);
    categoryForm.resetFields();
    categoryForm.setFieldsValue({ parentId: parentId ?? categories[0]?.id, sort: 0 });
    setCategoryModalOpen(true);
  };

  const openEditCategory = (category: CategoryNode) => {
    setCategoryModalMode("edit");
    setEditingCategory(category);
    categoryForm.resetFields();
    categoryForm.setFieldsValue({
      name: category.name,
      code: category.code ?? undefined,
      parentId: category.parentId ?? undefined,
      sort: category.sort,
    });
    setCategoryModalOpen(true);
  };

  const saveCategory = async () => {
    try {
      const values = await categoryForm.validateFields();
      setCategorySubmitting(true);
      const payload = {
        name: values.name,
        code:
          categoryModalMode === "create-primary" || (categoryModalMode === "edit" && editingCategory?.level === 1)
            ? values.code
            : undefined,
        parentId:
          categoryModalMode === "create-child" || (categoryModalMode === "edit" && editingCategory && editingCategory.level > 1)
            ? values.parentId
            : undefined,
        sort: values.sort ?? 0,
      };

      if (categoryModalMode === "edit" && editingCategory) {
        await updateCategory(editingCategory.id, payload);
      } else {
        await createCategory(payload);
      }
      message.success(text.categorySaved);
      setCategoryModalOpen(false);
      setEditingCategory(null);
      categoryForm.resetFields();
      await loadData();
    } catch (error) {
      if (error && typeof error === "object" && "errorFields" in error) {
        return;
      }
      message.error(`${text.saveCategoryFailed}: ${formatApiError(error)}`);
    } finally {
      setCategorySubmitting(false);
    }
  };

  const confirmDeleteCategory = async () => {
    if (!categoryDeleteTarget) {
      return;
    }
    setCategorySubmitting(true);
    try {
      await deleteCategory(categoryDeleteTarget.id);
      message.success(text.categoryDeleted);
      setCategoryDeleteTarget(null);
      await loadData();
    } catch (error) {
      message.error(`${text.deleteCategoryFailed}: ${formatApiError(error)}`);
    } finally {
      setCategorySubmitting(false);
    }
  };

  if (!user) {
    return <LoginPage loading={loginLoading} error={loginError} onSubmit={handleLogin} />;
  }

  return (
    <Layout className="app-shell">
      {desktopDropActive && (
        <div className="desktop-drop-overlay" role="status" aria-live="polite">
          <UploadOutlined />
          <span>\u677e\u5f00\u4ee5\u6dfb\u52a0\u6587\u4ef6</span>
        </div>
      )}
      <Sider width={240} collapsible collapsed={collapsed} trigger={null} className="app-sider">
        <div className="brand">
          <FolderOpenOutlined />
          {!collapsed && <span>{text.brand}</span>}
        </div>
        <Menu
          mode="inline"
          selectedKeys={[page]}
          items={[
            { key: "dashboard", icon: <AppstoreOutlined />, label: text.dashboard },
            { key: "documents", icon: <FileTextOutlined />, label: text.documents },
            { key: "business-matters", icon: <FolderOpenOutlined />, label: "项目与事项" },
            ...(user.role === "ADMIN"
              ? [{ key: "recycle", icon: <DeleteOutlined />, label: text.recycleBin }]
              : []),
            { key: "categories", icon: <SettingOutlined />, label: text.categories },
            { key: "finance", icon: <AccountBookOutlined />, label: text.financePackages },
            ...(user.role === "ADMIN"
              ? [{ key: "ai-settings", icon: <ApiOutlined />, label: text.aiSettings }]
              : []),
          ]}
          onClick={({ key }) => setPage(key as PageKey)}
        />
        {!collapsed && (
          <div className="sider-footer">
            <div>
              <div className="sider-user">{user.realName || user.username}</div>
              <div className="sider-role">{user.role === "ADMIN" ? text.admin : text.employee}</div>
            </div>
            <Button
              type="text"
              icon={<LogoutOutlined />}
              aria-label={text.logout}
              title={text.logout}
              onClick={handleLogout}
            />
          </div>
        )}
      </Sider>
      <Layout>
        <Header className="app-header">
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            aria-label={collapsed ? "\u5c55\u5f00\u83dc\u5355" : "\u6536\u8d77\u83dc\u5355"}
            title={collapsed ? "\u5c55\u5f00\u83dc\u5355" : "\u6536\u8d77\u83dc\u5355"}
            onClick={() => setCollapsed((value) => !value)}
          />
          <Space>
            <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void refresh()}>
              {text.refresh}
            </Button>
            <Button type="primary" icon={<UploadOutlined />} onClick={() => setUploadOpen(true)}>
              {text.uploadFile}
            </Button>
          </Space>
        </Header>
        <Content className="app-content">
          {loading && !documents.length && !categories.length ? (
            <div className="loading-state">
              <Spin size="large" />
            </div>
          ) : page === "dashboard" ? (
            <DashboardPage
              documents={documents}
              categories={categories}
              documentTotalCount={documentTotalCount}
              onOpenDocuments={() => setPage("documents")}
              onOpenUpload={() => setUploadOpen(true)}
            />
          ) : page === "documents" ? (
            <DocumentsPage
              documents={documentSearchDocuments}
              categories={categories}
              query={documentQuery}
              categoryPath={selectedCategoryPath}
              tagId={selectedTagId}
              partnerId={selectedPartnerId}
              tags={tags}
              partners={partners}
              loading={documentSearchLoading}
              total={documentSearchTotal}
              selectedRowKeys={selectedDocumentIds}
              exporting={exportingDocuments}
              onQueryChange={setDocumentQuery}
              onCategoryChange={setSelectedCategoryPath}
              onTagChange={setSelectedTagId}
              onPartnerChange={setSelectedPartnerId}
              onSelectionChange={setSelectedDocumentIds}
              onOpenBatchOrganize={openBatchOrganize}
              onBatchExport={exportSelectedDocuments}
              onBatchDelete={openBatchDelete}
              onOpenAssistant={() => {
                setAssistantOpen(true);
                setAssistantResult(null);
              }}
              onRebuildIndex={handleRebuildIndex}
              rebuildingIndex={rebuildingIndex}
              isAdmin={user.role === "ADMIN"}
               onOpenDetail={openDocumentDetail}
               onDownload={handleDownload}
               onPrint={handlePrintDocument}
               onMove={openMoveDocument}
              onDelete={handleDelete}
            />
          ) : page === "recycle" && user.role === "ADMIN" ? (
            <RecyclePage
              documents={recycleDocuments}
              query={documentQuery}
              onQueryChange={setDocumentQuery}
              onRestore={handleRestore}
              onPermanentDelete={handlePermanentDelete}
            />
          ) : page === "business-matters" ? (
            <BusinessMattersPage
              currentUser={user}
              departments={departments}
              partners={partners}
              categories={categories}
              onOpenDocument={openDocumentDetail}
            />
          ) : page === "finance" ? (
            <FinancePackagesPage
              onOpenDocument={openDocumentDetail}
              categories={categories}
              departments={departments}
              tags={tags}
            />
          ) : page === "ai-settings" && user.role === "ADMIN" ? (
            <AiSettingsPage />
          ) : (
            <CategoriesPage
              categories={categories}
              documents={documents}
              admin={user.role === "ADMIN"}
              onCreatePrimary={openCreatePrimaryCategory}
              onCreateChild={openCreateChildCategory}
              onEdit={openEditCategory}
              onDelete={setCategoryDeleteTarget}
               onOpenDocument={openDocumentDetail}
               onDownload={handleDownload}
               onPrint={handlePrintDocument}
               onMoveDocument={openMoveDocument}
              onUpdateVersion={openVersionUpdate}
              onExportCategory={exportCategoryFiles}
              exporting={exportingDocuments}
              onDeleteDocument={handleDelete}
            />
          )}
        </Content>
      </Layout>
      <UploadDrawer
        open={uploadOpen}
        loading={uploading}
        categories={categories}
        departments={departments}
        tags={tags}
        partners={partners}
        fileInputRef={fileInputRef}
        selectedFiles={selectedFiles}
        onFilesChange={setSelectedFiles}
        onClose={() => {
          if (!uploading) {
            setUploadOpen(false);
          }
        }}
        onSubmit={handleUpload}
      />
      <SearchAssistantDrawer
        open={assistantOpen}
        query={assistantQuery}
        result={assistantResult}
        loading={assistantLoading}
        onQueryChange={setAssistantQuery}
        onSubmit={runAssistantSearch}
        onClose={() => setAssistantOpen(false)}
        onOpenDocument={(documentId) => {
          const document = documents.find((item) => item.id === documentId);
          if (document) {
            void openDocumentDetail(document);
          }
        }}
      />
      <Modal
        title={text.duplicateFileTitle}
        open={Boolean(duplicatePrompt)}
        onCancel={() => resolveDuplicatePrompt({ action: "skip" })}
        footer={null}
        destroyOnHidden
        width={760}
      >
        {duplicatePrompt && (
          <div className="duplicate-prompt-stack">
            <Alert type="warning" showIcon message={text.duplicateFileHint} />
            <Descriptions bordered column={1} size="small">
              <Descriptions.Item label={text.duplicateFileSelected}>{duplicatePrompt.file.name}</Descriptions.Item>
            </Descriptions>
            <Typography.Title level={5} className="section-title">
              {text.duplicateFileExisting}
            </Typography.Title>
            <List
              dataSource={duplicatePrompt.matches}
              locale={{ emptyText: <Empty description={text.noDocuments} /> }}
              renderItem={(record) => (
                <List.Item>
                  <div className="duplicate-record-row">
                    <div className="duplicate-record-main">
                      <Typography.Text strong>{record.title}</Typography.Text>
                      <Space wrap size={[6, 6]} className="duplicate-record-meta">
                        <Tag>{record.documentNo}</Tag>
                        <Tag>{record.currentVersion?.versionLabel ?? "-"}</Tag>
                        <Typography.Text type="secondary">
                          {record.currentVersion?.originalFileName ?? record.title}
                        </Typography.Text>
                        <Typography.Text type="secondary">{formatDate(record.updatedAt)}</Typography.Text>
                      </Space>
                    </div>
                    <Space wrap>
                      <Button size="small" onClick={() => void openDocumentDetail(record)}>
                        {text.duplicateFileViewDetail}
                      </Button>
                      <Button
                        size="small"
                        type="primary"
                        onClick={() => resolveDuplicatePrompt({ action: "update", document: record })}
                      >
                        {text.duplicateFileUpdateVersion}
                      </Button>
                    </Space>
                  </div>
                </List.Item>
              )}
            />
            <div className="duplicate-prompt-actions">
              <Button onClick={() => resolveDuplicatePrompt({ action: "skip" })}>
                {text.duplicateFileNoChange}
              </Button>
            </div>
          </div>
        )}
      </Modal>
      <VersionUpdateDrawer
        document={versionUpdateTarget}
        loading={versionUpdating}
        fileInputRef={versionFileInputRef}
        selectedFile={selectedVersionFile}
        onFileChange={setSelectedVersionFile}
        onClose={() => {
          if (!versionUpdating) {
            setVersionUpdateTarget(null);
            setSelectedVersionFile(null);
          }
        }}
        onSubmit={handleVersionUpdate}
      />
      <DocumentDetailDrawer
        document={detailDocument}
        versions={detailVersions}
        loading={detailLoading}
        onClose={() => {
          if (!detailLoading) {
            setDetailDocument(null);
            setDetailVersions([]);
          }
        }}
        onEdit={() => detailDocument && openEditDocument(detailDocument)}
        onMove={() => detailDocument && openMoveDocument(detailDocument)}
         onOpenFile={() => detailDocument && void handleOpenDocumentFile(detailDocument)}
         onDownload={() => detailDocument && void handleDownload(detailDocument)}
         onPrint={() => detailDocument && detailDocument.currentVersion && void handlePrintVersion(detailDocument, detailDocument.currentVersion)}
         onOpenVersion={(version) => detailDocument && void handleOpenDocumentFile(detailDocument, version)}
         onPreviewVersion={(version) => detailDocument && void handlePreviewVersion(detailDocument, version)}
         onPrintVersion={(version) => detailDocument && void handlePrintVersion(detailDocument, version)}
        onDownloadVersion={(version) => detailDocument && void handleDownloadVersion(detailDocument, version)}
        onDelete={() => {
          if (detailDocument) {
            handleDelete(detailDocument);
          }
        }}
      />
      <Modal
        title={text.editDocument}
        open={documentEditOpen}
        confirmLoading={documentSaving}
        okText={text.saveDocument}
        cancelText={text.cancel}
        onOk={() => void saveDocument()}
        onCancel={() => {
          if (!documentSaving) {
            setDocumentEditOpen(false);
          }
        }}
        destroyOnHidden
      >
        <Form form={documentEditForm} layout="vertical">
          <Form.Item
            name="title"
            label={text.fileName}
            rules={[{ required: true, message: text.defaultFileName }]}
          >
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item
            name="categoryPath"
            label={text.categoryPath}
            rules={[{ required: true, message: text.chooseCategoryPath }]}
          >
            <Cascader
              changeOnSelect
              options={toCategoryOptions(categories)}
              placeholder={text.chooseCategoryPath}
            />
          </Form.Item>
          <Form.Item name="departmentId" label={text.department}>
            <Select
              allowClear
              placeholder={text.optional}
              options={departments.map((item) => ({ label: item.name, value: item.id }))}
            />
          </Form.Item>
          <Form.Item name="tagNames" label={text.tags}>
            <Input placeholder={text.tagPlaceholder} maxLength={200} />
          </Form.Item>
          <Form.Item name="remark" label={text.remark}>
            <Input.TextArea rows={4} maxLength={500} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title={text.moveDocumentTitle}
        open={Boolean(moveDocumentTarget)}
        confirmLoading={documentMoving}
        okText={text.moveDocument}
        cancelText={text.cancel}
        onOk={() => void moveDocument()}
        onCancel={() => {
          if (!documentMoving) {
            setMoveDocumentTarget(null);
            documentMoveForm.resetFields();
          }
        }}
        destroyOnHidden
      >
        {moveDocumentTarget && (
          <>
            <Typography.Paragraph type="secondary">{text.moveDocumentHint}</Typography.Paragraph>
            <Typography.Paragraph strong>{moveDocumentTarget.title}</Typography.Paragraph>
          </>
        )}
        <Form form={documentMoveForm} layout="vertical">
          <Form.Item
            name="categoryPath"
            label={text.categoryPath}
            rules={[{ required: true, message: text.chooseCategoryPath }]}
          >
            <Cascader
              changeOnSelect
              options={toCategoryOptions(categories)}
              placeholder={text.chooseCategoryPath}
            />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title={text.batchOrganizeTitle}
        open={batchOrganizeOpen}
        confirmLoading={batchSubmitting}
        okText={text.batchApply}
        cancelText={text.cancel}
        onOk={() => void confirmBatchOrganize()}
        onCancel={() => {
          if (!batchSubmitting) {
            setBatchOrganizeOpen(false);
          }
        }}
        destroyOnHidden
      >
        <Typography.Paragraph type="secondary">{text.batchOrganizeDesc}</Typography.Paragraph>
        <Form form={batchForm} layout="vertical">
          <Form.Item name="categoryPath" label={text.categoryPath}>
            <Cascader
              allowClear
              changeOnSelect
              options={toCategoryOptions(categories)}
              placeholder={text.optional}
            />
          </Form.Item>
          <Form.Item name="departmentId" label={text.department}>
            <Select
              allowClear
              placeholder={text.optional}
              options={departments.map((item) => ({ label: item.name, value: item.id }))}
            />
          </Form.Item>
          <Form.Item name="tagNames" label={text.tags}>
            <Input placeholder={text.tagPlaceholder} maxLength={200} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title={
          categoryModalMode === "create-primary"
            ? text.addPrimaryCategory
            : categoryModalMode === "create-child"
              ? text.addChildCategory
              : text.editCategory
        }
        open={categoryModalOpen}
        confirmLoading={categorySubmitting}
        okText={text.save}
        cancelText={text.cancel}
        onOk={() => void saveCategory()}
        onCancel={() => {
          if (!categorySubmitting) {
            setCategoryModalOpen(false);
            setEditingCategory(null);
          }
        }}
        destroyOnHidden
      >
        <Form form={categoryForm} layout="vertical">
          {(categoryModalMode === "create-child" || (editingCategory && editingCategory.level > 1)) && (
            <Form.Item
              name="parentId"
              label={text.parentCategoryGeneral}
              rules={[{ required: true, message: text.parentCategoryGeneral }]}
            >
              <Select
                options={
                  categoryModalMode === "edit" && editingCategory
                    ? flattenCategories(categories)
                        .filter((category) => category.level === editingCategory.level - 1)
                        .map((category) => ({
                          label: `${"\u3000".repeat(Math.max(0, category.level - 1))}${category.name}`,
                          value: category.id,
                        }))
                    : getParentCategoryOptions(categories)
                }
              />
            </Form.Item>
          )}
          <Form.Item
            name="name"
            label={text.categoryName}
            rules={[{ required: true, message: text.enterCategoryName }]}
          >
            <Input maxLength={50} />
          </Form.Item>
          {(categoryModalMode === "create-primary" || editingCategory?.level === 1) && (
            <Form.Item
              name="code"
              label={text.categoryCode}
              help={text.categoryCodeHint}
              rules={[{ required: true, message: text.enterCategoryCode }]}
            >
              <Input maxLength={12} />
            </Form.Item>
          )}
          <Form.Item name="sort" label={text.sort}>
            <InputNumber min={0} precision={0} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title={text.deleteCategory}
        open={Boolean(categoryDeleteTarget)}
        okText={text.delete}
        cancelText={text.cancel}
        okButtonProps={{ danger: true }}
        confirmLoading={categorySubmitting}
        onOk={() => void confirmDeleteCategory()}
        onCancel={() => {
          if (!categorySubmitting) {
            setCategoryDeleteTarget(null);
          }
        }}
        destroyOnHidden
      >
        <Typography.Paragraph>
          {categoryDeleteTarget
            ? `${text.deleteCategoryConfirmPrefix}${categoryDeleteTarget.name}${text.deleteCategoryConfirmSuffix}`
            : ""}
        </Typography.Paragraph>
      </Modal>
      <Modal
        title={text.deleteFile}
        open={Boolean(deleteTarget)}
        okText={text.moveToRecycle}
        cancelText={text.cancel}
        okButtonProps={{ danger: true }}
        confirmLoading={deleting}
        onOk={() => void confirmDelete()}
        onCancel={() => {
          if (!deleting) {
            setDeleteTarget(null);
          }
        }}
        destroyOnHidden
      >
        <Typography.Paragraph>
          {deleteTarget
            ? `${text.deleteConfirmPrefix}${deleteTarget.title}${text.deleteConfirmSuffix}`
          : ""}
        </Typography.Paragraph>
      </Modal>
      <Modal
        title={text.batchDeleteFile}
        open={batchDeleteOpen}
        okText={text.batchMoveToRecycle}
        cancelText={text.cancel}
        okButtonProps={{ danger: true }}
        confirmLoading={deleting}
        onOk={() => void confirmBatchDelete()}
        onCancel={() => {
          if (!deleting) {
            setBatchDeleteOpen(false);
          }
        }}
        destroyOnHidden
      >
        <Typography.Paragraph>
          {`${text.batchDeleteConfirmPrefix}${selectedDocuments.length}${text.batchDeleteConfirmSuffix}`}
        </Typography.Paragraph>
      </Modal>
      <Modal
        title={text.restoreFile}
        open={Boolean(restoreTarget)}
        okText={text.restore}
        cancelText={text.cancel}
        confirmLoading={recycleActionLoading}
        onOk={() => void confirmRestore()}
        onCancel={() => {
          if (!recycleActionLoading) {
            setRestoreTarget(null);
          }
        }}
        destroyOnHidden
      >
        <Typography.Paragraph>
          {restoreTarget
            ? `${text.restoreConfirmPrefix}${restoreTarget.title}${text.restoreConfirmSuffix}`
            : ""}
        </Typography.Paragraph>
      </Modal>
      <Modal
        title={text.permanentDeleteFile}
        open={Boolean(permanentDeleteTarget)}
        okText={text.permanentlyDelete}
        cancelText={text.cancel}
        okButtonProps={{ danger: true }}
        confirmLoading={recycleActionLoading}
        onOk={() => void confirmPermanentDelete()}
        onCancel={() => {
          if (!recycleActionLoading) {
            setPermanentDeleteTarget(null);
          }
        }}
        destroyOnHidden
      >
        <Typography.Paragraph>
          {permanentDeleteTarget
            ? `${text.permanentDeleteConfirmPrefix}${permanentDeleteTarget.title}${text.permanentDeleteConfirmSuffix}`
            : ""}
        </Typography.Paragraph>
      </Modal>
    </Layout>
  );
}

function LoginPage({
  loading,
  error,
  onSubmit,
}: {
  loading: boolean;
  error: string;
  onSubmit: (values: LoginFormValues) => Promise<void>;
}) {
  const [form] = Form.useForm<LoginFormValues>();

  useEffect(() => {
    let cancelled = false;
    const loadSavedLogin = async () => {
      try {
        const saved = window.adminDocsDesktop
          ? await window.adminDocsDesktop.getSavedLogin()
          : null;
        if (cancelled) {
          return;
        }
        if (saved?.username && saved.password) {
          form.setFieldsValue({
            username: saved.username,
            password: saved.password,
            rememberCredentials: true,
          });
          return;
        }
        const rememberedUsername = localStorage.getItem(WEB_REMEMBERED_USERNAME_KEY);
        if (rememberedUsername) {
          form.setFieldsValue({
            username: rememberedUsername,
            rememberCredentials: true,
          });
        }
      } catch {
        // Saved login is optional. A broken cache should not block login.
      }
    };

    void loadSavedLogin();
    return () => {
      cancelled = true;
    };
  }, [form]);

  return (
    <div className="center-shell">
      <div className="center-shell-inner">
        <div className="login-panel">
          <div className="login-brand">
            <FolderOpenOutlined />
            <span>{text.brand}</span>
          </div>
          <Typography.Title level={2} className="login-title">
            {text.loginTitle}
          </Typography.Title>
          <Typography.Paragraph className="login-desc">{text.loginDesc}</Typography.Paragraph>
          {error && <Alert className="login-error" type="error" showIcon message={error} />}
          <Form form={form} layout="vertical" initialValues={{ rememberCredentials: false }} onFinish={(values) => void onSubmit(values)}>
            <Form.Item name="username" label={text.username} rules={[{ required: true, message: text.requiredUsername }]}>
              <Input size="large" autoComplete="username" />
            </Form.Item>
            <Form.Item name="password" label={text.password} rules={[{ required: true, message: text.requiredPassword }]}>
              <Input.Password size="large" autoComplete="current-password" />
            </Form.Item>
            <Form.Item name="rememberCredentials" valuePropName="checked">
              <Checkbox>{text.rememberLogin}</Checkbox>
            </Form.Item>
            <Button type="primary" htmlType="submit" size="large" block loading={loading}>
              {text.login}
            </Button>
          </Form>
        </div>
      </div>
    </div>
  );
}

function DashboardPage({
  documents,
  categories,
  documentTotalCount,
  onOpenDocuments,
  onOpenUpload,
}: {
  documents: DocumentRecord[];
  categories: CategoryNode[];
  documentTotalCount: number;
  onOpenDocuments: () => void;
  onOpenUpload: () => void;
}) {
  return (
    <div className="page-stack">
      <section className="page-band page-band-header">
        <div>
          <Typography.Title level={2} className="page-title">
            {text.dashboard}
          </Typography.Title>
          <Typography.Paragraph className="page-lead">{text.dashboardLead}</Typography.Paragraph>
        </div>
        <Space>
          <Button onClick={onOpenDocuments}>{text.viewFiles}</Button>
          <Button type="primary" icon={<UploadOutlined />} onClick={onOpenUpload}>
            {text.uploadFile}
          </Button>
        </Space>
      </section>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={8}>
          <div className="metric">
            <Statistic title={text.totalFiles} value={documentTotalCount} suffix={text.pieces} />
          </div>
        </Col>
        <Col xs={24} sm={8}>
          <div className="metric">
            <Statistic title={text.primaryCategories} value={categories.length} suffix={text.items} />
          </div>
        </Col>
        <Col xs={24} sm={8}>
          <div className="metric">
            <Statistic
              title={text.recentUpdate}
              value={documents.length ? formatDate(documents[0].updatedAt) : text.none}
              valueStyle={{ fontSize: 18 }}
            />
          </div>
        </Col>
      </Row>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <section className="page-band">
            <div className="section-toolbar">
              <Typography.Title level={4} className="section-title">
                {text.recentFiles}
              </Typography.Title>
              <Button type="link" onClick={onOpenDocuments}>
                {text.viewAll}
              </Button>
            </div>
            {documents.length ? (
              <List
                dataSource={documents.slice(0, 6)}
                renderItem={(item) => (
                  <List.Item>
                    <List.Item.Meta
                      title={item.title}
                      description={`${item.category?.name ?? text.noCategories} · ${formatDate(item.updatedAt)}`}
                    />
                    <Typography.Text type="secondary">{formatSize(item.currentVersion?.fileSize)}</Typography.Text>
                  </List.Item>
                )}
              />
            ) : (
              <Empty description={text.noDocuments} />
            )}
          </section>
        </Col>
        <Col xs={24} lg={10}>
          <section className="page-band">
            <Typography.Title level={4} className="section-title">
              {text.fileCategories}
            </Typography.Title>
            {categories.length ? (
              <List
                dataSource={categories}
                renderItem={(item) => (
                  <List.Item>
                    <Space>
                      <FolderOpenOutlined />
                      <span>{item.name}</span>
                    </Space>
                    <Typography.Text type="secondary">
                      {item.children?.length ?? 0} {text.items}
                    </Typography.Text>
                  </List.Item>
                )}
              />
            ) : (
              <Empty description={text.categoryLoading} />
            )}
          </section>
        </Col>
      </Row>
    </div>
  );
}

function DocumentsPage({
  documents,
  categories,
  query,
  categoryPath,
  tagId,
  partnerId,
  tags,
  partners,
  loading,
  total,
  selectedRowKeys,
  exporting,
  onQueryChange,
  onCategoryChange,
  onTagChange,
  onPartnerChange,
  onSelectionChange,
  onOpenBatchOrganize,
  onBatchExport,
  onBatchDelete,
  onOpenAssistant,
  onRebuildIndex,
  rebuildingIndex,
  isAdmin,
  onOpenDetail,
  onDownload,
  onPrint,
  onMove,
  onDelete,
}: {
  documents: DocumentRecord[];
  categories: CategoryNode[];
  query: string;
  categoryPath: string[];
  tagId?: string;
  partnerId?: string;
  tags: TagRecord[];
  partners: PartnerRecord[];
  loading: boolean;
  total: number;
  selectedRowKeys: string[];
  exporting: boolean;
  onQueryChange: (value: string) => void;
  onCategoryChange: (value: string[]) => void;
  onTagChange: (value: string | undefined) => void;
  onPartnerChange: (value: string | undefined) => void;
  onSelectionChange: (keys: string[]) => void;
  onOpenBatchOrganize: () => void;
  onBatchExport: () => Promise<void>;
  onBatchDelete: () => void;
  onOpenAssistant: () => void;
  onRebuildIndex: () => Promise<void>;
  rebuildingIndex: boolean;
  isAdmin: boolean;
  onOpenDetail: (record: DocumentRecord) => Promise<void>;
  onDownload: (record: DocumentRecord) => Promise<void>;
  onPrint: (record: DocumentRecord) => Promise<void>;
  onMove: (record: DocumentRecord) => void;
  onDelete: (record: DocumentRecord) => void;
}) {
  const columns: ColumnsType<DocumentRecord> = [
    {
      title: text.fileName,
      dataIndex: "title",
      ellipsis: true,
      render: (value: string, record) => (
        <Button type="link" className="link-button" onClick={() => void onOpenDetail(record)}>
          {value}
        </Button>
      ),
    },
    { title: text.documentNo, dataIndex: "documentNo", width: 150 },
    {
      title: text.category,
      dataIndex: "category",
      width: 240,
      render: (_value, record) => getCategoryPathText(categories, record.categoryId, record.subcategoryId),
    },
    {
      title: text.version,
      dataIndex: "currentVersion",
      width: 150,
      render: (_value, record) => record.currentVersion?.versionLabel ?? "-",
    },
    {
      title: text.updatedAt,
      dataIndex: "updatedAt",
      width: 180,
      render: (value: string) => formatDate(value),
    },
    {
      title: text.actions,
      fixed: "right",
      width: 250,
      render: (_value, record) => (
        <Space>
           <Button size="small" onClick={() => void onDownload(record)}>
             {text.download}
           </Button>
           <Button size="small" icon={<PrinterOutlined />} onClick={() => void onPrint(record)}>
             {text.print}
           </Button>
          <Button size="small" icon={<SwapOutlined />} onClick={() => onMove(record)}>
            {text.moveDocument}
          </Button>
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => onDelete(record)}>
            {text.delete}
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div className="page-stack">
      <section className="page-band">
        <div className="page-band-header">
          <div>
            <Typography.Title level={2} className="page-title">
              {text.documents}
            </Typography.Title>
            <Typography.Paragraph className="page-lead">{text.fileCenterLead}</Typography.Paragraph>
          </div>
          <Space wrap>
            <Button icon={<RobotOutlined />} onClick={onOpenAssistant}>
              {text.aiSearch}
            </Button>
            {isAdmin && (
              <Button icon={<ReloadOutlined />} loading={rebuildingIndex} onClick={() => void onRebuildIndex()}>
                {text.rebuildIndex}
              </Button>
            )}
            <Input
              className="filter-input"
              placeholder={text.searchPlaceholder}
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              allowClear
            />
            <Cascader
              className="filter-select"
              placeholder={text.allCategories}
              allowClear
              changeOnSelect
              value={categoryPath}
              onChange={(value) => onCategoryChange(value.map(String))}
              options={toCategoryOptions(categories)}
            />
            <Select
              className="filter-select filter-select-wide"
              placeholder={text.allTags}
              allowClear
              showSearch
              optionFilterProp="label"
              value={tagId}
              onChange={onTagChange}
              options={tags.map((tag) => ({ label: tag.name, value: tag.id }))}
            />
            <Select
              className="filter-select filter-select-wide"
              placeholder={text.allPartners}
              allowClear
              showSearch
              optionFilterProp="label"
              value={partnerId}
              onChange={onPartnerChange}
              options={partners.map((partner) => ({ label: partner.companyName, value: partner.id }))}
            />
          </Space>
        </div>
      </section>
      <section className="page-band">
        <div className="section-toolbar batch-toolbar">
          <Space direction="vertical" size={2}>
            <Typography.Text type="secondary">
              {`${text.selectedDocumentsPrefix}${selectedRowKeys.length}${text.selectedDocumentsSuffix}`}
            </Typography.Text>
            <Typography.Text type="secondary">
              {`${text.searchResultCountPrefix}${total}${text.searchResultCountSuffix}`}
            </Typography.Text>
          </Space>
          <Space wrap>
            <Button
              icon={<AppstoreOutlined />}
              disabled={!selectedRowKeys.length}
              onClick={onOpenBatchOrganize}
            >
              {text.batchOrganize}
            </Button>
            <Button
              icon={<DownloadOutlined />}
              loading={exporting}
              disabled={!selectedRowKeys.length}
              onClick={() => void onBatchExport()}
            >
              {text.batchExport}
            </Button>
            <Button
              danger
              icon={<DeleteOutlined />}
              disabled={!selectedRowKeys.length}
              onClick={onBatchDelete}
            >
              {text.batchMoveToRecycle}
            </Button>
          </Space>
        </div>
        <Table
          rowKey="id"
          rowSelection={{
            selectedRowKeys,
            onChange: (keys) => onSelectionChange(keys.map(String)),
            preserveSelectedRowKeys: true,
          }}
          dataSource={documents}
          columns={columns}
          loading={loading}
          pagination={{ pageSize: 12 }}
          scroll={{ x: 1180 }}
          locale={{ emptyText: <Empty description={text.noDocuments} /> }}
        />
      </section>
    </div>
  );
}

function RecyclePage({
  documents,
  query,
  onQueryChange,
  onRestore,
  onPermanentDelete,
}: {
  documents: DocumentRecord[];
  query: string;
  onQueryChange: (value: string) => void;
  onRestore: (record: DocumentRecord) => void;
  onPermanentDelete: (record: DocumentRecord) => void;
}) {
  const filteredDocuments = useMemo(() => {
    const terms = query
      .trim()
      .toLowerCase()
      .split(/[\s,，;；、]+/)
      .map((term) => term.trim())
      .filter(Boolean);
    return documents.filter((item) => {
      if (!terms.length) {
        return true;
      }
      const searchableText = [
        item.title,
        item.documentNo,
        item.category?.name,
        item.subcategory?.name,
        item.currentVersion?.originalFileName,
        item.currentVersion?.fileExt,
        ...(item.documentTags?.map((entry) => entry.tag.name) ?? []),
        ...(item.documentPartners?.map((entry) => entry.partner.companyName) ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return terms.every((term) => searchableText.includes(term));
    });
  }, [documents, query]);

  const columns: ColumnsType<DocumentRecord> = [
    {
      title: text.fileName,
      dataIndex: "title",
      ellipsis: true,
      render: (value: string) => <Typography.Text strong>{value}</Typography.Text>,
    },
    { title: text.documentNo, dataIndex: "documentNo", width: 150 },
    {
      title: text.category,
      dataIndex: "category",
      width: 220,
      render: (_value, record) =>
        [record.category?.name, record.subcategory?.name].filter(Boolean).join(" / ") || "-",
    },
    {
      title: text.deletedAt,
      dataIndex: "deletedAt",
      width: 180,
      render: (value: string | null) => formatDate(value),
    },
    {
      title: text.actions,
      fixed: "right",
      width: 220,
      render: (_value, record) => (
        <Space>
          <Button size="small" icon={<UndoOutlined />} onClick={() => onRestore(record)}>
            {text.restore}
          </Button>
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => onPermanentDelete(record)}>
            {text.permanentlyDelete}
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div className="page-stack">
      <section className="page-band">
        <div className="page-band-header">
          <div>
            <Typography.Title level={2} className="page-title">
              {text.recycleBin}
            </Typography.Title>
            <Typography.Paragraph className="page-lead">{text.recycleLead}</Typography.Paragraph>
          </div>
          <Input
            className="filter-input"
            placeholder={text.searchPlaceholder}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            allowClear
          />
        </div>
      </section>
      <section className="page-band">
        <Table
          rowKey="id"
          dataSource={filteredDocuments}
          columns={columns}
          pagination={{ pageSize: 12 }}
          scroll={{ x: 850 }}
          locale={{ emptyText: <Empty description={text.noRecycleDocuments} /> }}
        />
      </section>
    </div>
  );
}

function SearchAssistantDrawer({
  open,
  query,
  result,
  loading,
  onQueryChange,
  onSubmit,
  onClose,
  onOpenDocument,
}: {
  open: boolean;
  query: string;
  result: SearchAssistantResponse | null;
  loading: boolean;
  onQueryChange: (value: string) => void;
  onSubmit: () => Promise<void>;
  onClose: () => void;
  onOpenDocument: (documentId: string) => void;
}) {
  return (
    <Drawer title={text.aiSearchTitle} width={700} open={open} onClose={onClose} destroyOnHidden>
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Input.TextArea
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={text.aiSearchPlaceholder}
          autoSize={{ minRows: 3, maxRows: 6 }}
          maxLength={500}
          showCount
        />
        <Button type="primary" icon={<RobotOutlined />} loading={loading} onClick={() => void onSubmit()}>
          {text.aiSearchSubmit}
        </Button>
        {result && (
          <>
            <Alert
              type="info"
              showIcon
              message={result.answer}
              description={result.mode === "semantic" ? text.aiSearchModeSemantic : text.aiSearchModeKeyword}
            />
            <List
              bordered
              dataSource={result.results}
              locale={{ emptyText: <Empty description={text.aiSearchNoResults} /> }}
              renderItem={(item) => (
                <List.Item actions={[<Button key="open" type="link" onClick={() => onOpenDocument(item.documentId)}>{text.fileDetail}</Button>]}>
                  <List.Item.Meta
                    title={<Button type="link" className="link-button" onClick={() => onOpenDocument(item.documentId)}>{item.title}</Button>}
                    description={
                      <Space direction="vertical" size={4}>
                        <Space wrap size={[4, 4]}>
                          <Tag>{item.documentNo}</Tag>
                          <Typography.Text type="secondary">{item.categoryPath.join(" / ") || text.none}</Typography.Text>
                          {item.matchedBy.map((source) => <Tag key={source} color="blue">{`${text.matchedBy}：${source}`}</Tag>)}
                        </Space>
                        <Typography.Text type="secondary">{item.snippet}</Typography.Text>
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
          </>
        )}
      </Space>
    </Drawer>
  );
}

function DocumentDetailDrawer({
  document,
  versions,
  loading,
  onClose,
  onEdit,
  onMove,
  onOpenFile,
  onDownload,
  onPrint,
  onOpenVersion,
  onPreviewVersion,
  onPrintVersion,
  onDownloadVersion,
  onDelete,
}: {
  document: DocumentRecord | null;
  versions: DocumentVersionRecord[];
  loading: boolean;
  onClose: () => void;
  onEdit: () => void;
  onMove: () => void;
  onOpenFile: () => void;
  onDownload: () => void;
  onPrint: () => void;
  onOpenVersion: (version: DocumentVersionRecord) => void;
  onPreviewVersion: (version: DocumentVersionRecord) => void;
  onPrintVersion: (version: DocumentVersionRecord) => void;
  onDownloadVersion: (version: DocumentVersionRecord) => void;
  onDelete: () => void;
}) {
  const tagNames = document ? getDocumentTagNames(document) : [];
  const currentVersionId = document?.currentVersionId ?? document?.currentVersion?.id;
  const currentVersion =
    versions.find((version) => version.id === currentVersionId) ?? document?.currentVersion ?? versions[0] ?? null;
  const historicalVersions = versions.filter((version) => version.id !== currentVersion?.id);
  return (
    <Drawer
      title={text.fileDetail}
      width={620}
      open={Boolean(document)}
      onClose={onClose}
      destroyOnHidden
      extra={
        <Space>
          <Button icon={<EditOutlined />} onClick={onEdit} disabled={!document}>
            {text.editDocument}
          </Button>
          <Button icon={<SwapOutlined />} onClick={onMove} disabled={!document}>
            {text.moveDocument}
          </Button>
          <Button icon={<EyeOutlined />} onClick={onOpenFile} disabled={!document}>
            {text.openFile}
          </Button>
          <Button icon={<PrinterOutlined />} onClick={onPrint} disabled={!document}>
            {text.print}
          </Button>
          <Button onClick={onDownload} disabled={!document}>
            {text.download}
          </Button>
          <Button danger icon={<DeleteOutlined />} onClick={onDelete} disabled={!document}>
            {text.delete}
          </Button>
        </Space>
      }
    >
      {loading ? (
        <div className="loading-state">
          <Spin />
        </div>
      ) : document ? (
        <div className="document-detail-stack">
          <section>
            <Typography.Title level={4} className="section-title">
              {document.title}
            </Typography.Title>
            <Typography.Text type="secondary">{document.documentNo}</Typography.Text>
          </section>
          <Descriptions title={text.basicInfo} bordered column={1} size="small">
            <Descriptions.Item label={text.category}>{document.category?.name ?? "-"}</Descriptions.Item>
            <Descriptions.Item label={text.subcategory}>{document.subcategory?.name ?? "-"}</Descriptions.Item>
            <Descriptions.Item label={text.department}>{document.department?.name ?? "-"}</Descriptions.Item>
            <Descriptions.Item label={text.creator}>{document.creator?.realName ?? document.creator?.username ?? "-"}</Descriptions.Item>
            <Descriptions.Item label={text.createdAt}>{formatDate(document.createdAt)}</Descriptions.Item>
            <Descriptions.Item label={text.updatedAt}>{formatDate(document.updatedAt)}</Descriptions.Item>
            <Descriptions.Item label={text.tags}>
              {tagNames.length ? (
                <Space wrap>{tagNames.map((name) => <Tag key={name}>{name}</Tag>)}</Space>
              ) : (
                text.none
              )}
            </Descriptions.Item>
            <Descriptions.Item label={text.remark}>{document.remark || text.none}</Descriptions.Item>
          </Descriptions>
          <Descriptions title={text.fileInfo} bordered column={1} size="small">
            <Descriptions.Item label={text.currentVersion}>
              {currentVersion?.versionLabel ?? "-"}
            </Descriptions.Item>
            <Descriptions.Item label={text.originalFileName}>
              {currentVersion?.originalFileName ?? "-"}
            </Descriptions.Item>
            <Descriptions.Item label={text.fileSize}>
              {formatSize(currentVersion?.fileSize)}
            </Descriptions.Item>
            <Descriptions.Item label={text.mimeType}>{currentVersion?.mimeType ?? "-"}</Descriptions.Item>
          </Descriptions>
          <section>
            <Typography.Title level={5} className="section-title">
              {text.historicalVersions}
            </Typography.Title>
            <List
              className="version-history-list"
              dataSource={historicalVersions}
              locale={{ emptyText: <Empty description={text.noHistoricalVersions} /> }}
              renderItem={(version) => (
                <List.Item>
                  <div className="version-history-row">
                    <div className="version-history-main">
                      <Space size={[6, 6]} wrap>
                        <Tag>{version.versionLabel}</Tag>
                        <Typography.Text strong>{version.originalFileName}</Typography.Text>
                      </Space>
                      <Space size={[8, 8]} wrap className="version-history-meta">
                        <Typography.Text type="secondary">{formatDate(version.createdAt)}</Typography.Text>
                        <Typography.Text type="secondary">{formatSize(version.fileSize)}</Typography.Text>
                        <Typography.Text type="secondary">{version.changeNote || text.none}</Typography.Text>
                      </Space>
                    </div>
                    <Space wrap>
                      <Button size="small" icon={<EyeOutlined />} onClick={() => onOpenVersion(version)}>
                        {text.openFile}
                      </Button>
                      <Button size="small" icon={<EyeOutlined />} onClick={() => onPreviewVersion(version)}>
                        {text.preview}
                      </Button>
                      <Button size="small" icon={<PrinterOutlined />} onClick={() => onPrintVersion(version)}>
                        {text.print}
                      </Button>
                      <Button size="small" icon={<DownloadOutlined />} onClick={() => onDownloadVersion(version)}>
                        {text.download}
                      </Button>
                    </Space>
                  </div>
                </List.Item>
              )}
            />
          </section>
        </div>
      ) : (
        <Empty description={text.noDocuments} />
      )}
    </Drawer>
  );
}

function VersionUpdateDrawer({
  document,
  loading,
  fileInputRef,
  selectedFile,
  onFileChange,
  onClose,
  onSubmit,
}: {
  document: DocumentRecord | null;
  loading: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  selectedFile: UploadSelectedFile | null;
  onFileChange: (file: UploadSelectedFile | null) => void;
  onClose: () => void;
  onSubmit: (values: { changeNote?: string }) => Promise<void>;
}) {
  const [form] = Form.useForm<{ changeNote?: string }>();
  const desktopFilePickerAvailable = Boolean(window.adminDocsDesktop);

  const openDesktopFilePicker = async () => {
    try {
      const desktopFiles = await window.adminDocsDesktop?.pickFiles();
      if (desktopFiles && desktopFiles.length > 0) {
        onFileChange(desktopFiles[0]);
      }
    } catch (error) {
      message.error(`${text.versionUpdateFailed}: ${formatApiError(error)}`);
    }
  };

  useEffect(() => {
    if (!document) {
      form.resetFields();
      onFileChange(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }, [document, fileInputRef, form, onFileChange]);

  return (
    <Drawer
      title={text.updateVersionDrawerTitle}
      width={520}
      open={Boolean(document)}
      onClose={onClose}
      destroyOnHidden
      extra={
        <Button type="primary" loading={loading} onClick={() => form.submit()} disabled={!selectedFile}>
          {text.saveVersionUpdate}
        </Button>
      }
    >
      {document ? (
        <Form form={form} layout="vertical" onFinish={(values) => void onSubmit(values)}>
          <Alert type="info" showIcon message={text.versionUpdateHint} />
          <Descriptions bordered column={1} size="small" className="version-update-summary">
            <Descriptions.Item label={text.fileName}>{document.title}</Descriptions.Item>
            <Descriptions.Item label={text.currentVersion}>
              {document.currentVersion?.versionLabel ?? "-"}
            </Descriptions.Item>
            <Descriptions.Item label={text.originalFileName}>
              {document.currentVersion?.originalFileName ?? "-"}
            </Descriptions.Item>
          </Descriptions>
          <Form.Item label={text.fileName} required>
            <input
              ref={fileInputRef}
              id="document-version-file-input"
              type="file"
              className="upload-file-input"
              accept={acceptedUploadFileTypes}
              onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
            />
            {desktopFilePickerAvailable ? (
              <Button className="upload-picker" icon={<UploadOutlined />} onClick={() => void openDesktopFilePicker()}>
                {selectedFile ? text.reselectFiles : text.selectFiles}
              </Button>
            ) : (
              <label htmlFor="document-version-file-input" className="upload-picker">
                <UploadOutlined />
                <span>{selectedFile ? text.reselectFiles : text.selectFiles}</span>
              </label>
            )}
            {selectedFile ? (
              <div className="upload-file-list">
                <List
                  size="small"
                  dataSource={[selectedFile]}
                  renderItem={(file) => (
                    <List.Item>
                      <Typography.Text ellipsis>{file.name}</Typography.Text>
                      <Typography.Text type="secondary">{formatSize(file.size)}</Typography.Text>
                    </List.Item>
                  )}
                />
              </div>
            ) : (
              <Typography.Paragraph type="secondary" className="upload-file-name">
                {text.supportedFiles}
              </Typography.Paragraph>
            )}
          </Form.Item>
          <Form.Item name="changeNote" label={text.versionChangeNote}>
            <Input.TextArea rows={4} maxLength={500} placeholder={text.optional} />
          </Form.Item>
        </Form>
      ) : (
        <Empty description={text.noDocuments} />
      )}
    </Drawer>
  );
}

function CategoriesPage({
  categories,
  documents,
  admin,
  onCreatePrimary,
  onCreateChild,
  onEdit,
  onDelete,
  onOpenDocument,
  onDownload,
  onPrint,
  onMoveDocument,
  onUpdateVersion,
  onExportCategory,
  exporting,
  onDeleteDocument,
}: {
  categories: CategoryNode[];
  documents: DocumentRecord[];
  admin: boolean;
  onCreatePrimary: () => void;
  onCreateChild: (parentId?: string) => void;
  onEdit: (category: CategoryNode) => void;
  onDelete: (category: CategoryNode) => void;
  onOpenDocument: (record: DocumentRecord) => Promise<void>;
  onDownload: (record: DocumentRecord) => Promise<void>;
  onPrint: (record: DocumentRecord) => Promise<void>;
  onMoveDocument: (record: DocumentRecord) => void;
  onUpdateVersion: (record: DocumentRecord) => void;
  onExportCategory: (category: CategoryNode) => Promise<void>;
  exporting: boolean;
  onDeleteDocument: (record: DocumentRecord) => void;
}) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>();
  const selectedCategory = findCategory(categories, selectedCategoryId) ?? categories[0];
  const selectedParentId = selectedCategory?.level && selectedCategory.level < 4 ? selectedCategory.id : undefined;
  const rows = selectedCategory?.children ?? [];
  const categoryDocuments = useMemo(
    () => (selectedCategory ? getCategoryDocuments(selectedCategory, documents) : []),
    [documents, selectedCategory],
  );
  const monthNewCount = useMemo(
    () => categoryDocuments.filter((document) => isCurrentMonth(document.createdAt)).length,
    [categoryDocuments],
  );
  const latestUpdatedAt = getLatestUpdatedAt(categoryDocuments);

  useEffect(() => {
    if (!categories.length) {
      setSelectedCategoryId(undefined);
      return;
    }
    if (!selectedCategoryId || !findCategory(categories, selectedCategoryId)) {
      setSelectedCategoryId(categories[0].id);
    }
  }, [categories, selectedCategoryId]);

  const renderCategoryFileItem = (record: DocumentRecord) => {
    const type = getFileTypeMeta(record);
    const tagNames = getDocumentTagNames(record);
    const metaItems = [
      `${text.documentNo}: ${record.documentNo}`,
      `${text.categoryPath}: ${getCategoryPathText(categories, record.categoryId, record.subcategoryId)}`,
      `${text.department}: ${record.department?.name ?? "-"}`,
      `${text.updatedAt}: ${formatDate(record.updatedAt)}`,
    ];

    return (
      <List.Item className="category-file-list-item">
        <div className="category-file-card">
          <div className="category-file-main">
            <div className="category-file-head">
              <span className={`file-type-icon file-type-icon-${type.color}`}>{type.icon}</span>
              <Button type="link" className="link-button category-file-title-button" onClick={() => void onOpenDocument(record)}>
                {record.title}
              </Button>
              <Space size={[6, 6]} wrap className="category-file-badges">
                <Tag color={type.color}>{type.label}</Tag>
                <Tag>{`${text.version}: ${record.currentVersion?.versionLabel ?? "-"}`}</Tag>
              </Space>
            </div>
            <div className="category-file-tags">
              <Typography.Text type="secondary">{`${text.tags}:`}</Typography.Text>
              {tagNames.length ? (
                <Space size={[4, 4]} wrap>
                  {tagNames.map((tagName) => (
                    <Tag key={`${record.id}-${tagName}`} color="geekblue">
                      {tagName}
                    </Tag>
                  ))}
                </Space>
              ) : (
                <Typography.Text type="secondary">{text.none}</Typography.Text>
              )}
            </div>
            <div className="category-file-meta">
              {metaItems.map((item) => (
                <Typography.Text key={item} type="secondary">
                  {item}
                </Typography.Text>
              ))}
            </div>
          </div>
          <Space wrap className="category-file-actions">
            <Button size="small" type="primary" onClick={() => onUpdateVersion(record)}>
              {text.updateLatestFile}
            </Button>
            <Button size="small" icon={<SwapOutlined />} onClick={() => onMoveDocument(record)}>
              {text.moveDocument}
            </Button>
            <Button size="small" onClick={() => void onDownload(record)}>
              {text.download}
            </Button>
            <Button size="small" icon={<PrinterOutlined />} onClick={() => void onPrint(record)}>
              {text.print}
            </Button>
            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => onDeleteDocument(record)}>
              {text.delete}
            </Button>
          </Space>
        </div>
      </List.Item>
    );
  };

  return (
    <div className="page-stack">
      <section className="page-band">
        <div className="page-band-header">
          <div>
            <Typography.Title level={2} className="page-title">
              {text.categories}
            </Typography.Title>
            <Typography.Paragraph className="page-lead">{text.categoryLead}</Typography.Paragraph>
          </div>
          <Space wrap>
            <Button icon={<PlusOutlined />} disabled={!admin} onClick={onCreatePrimary}>
              {text.addPrimaryCategory}
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              disabled={!admin || !selectedParentId}
              onClick={() => onCreateChild(selectedParentId)}
            >
              {text.addChildCategory}
            </Button>
          </Space>
        </div>
      </section>
      {!admin && <Alert type="info" showIcon message={text.employeeCategoryHint} />}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={7}>
          <section className="page-band">
            <Typography.Title level={4} className="section-title">
              {text.categoryTree}
            </Typography.Title>
            {categories.length ? (
              <Tree
                treeData={toTreeData(categories, documents)}
                defaultExpandAll
                selectedKeys={selectedCategory ? [selectedCategory.id] : []}
                onSelect={(keys) => setSelectedCategoryId(String(keys[0] ?? selectedCategory?.id ?? ""))}
              />
            ) : (
              <Empty description={text.noCategories} />
            )}
          </section>
        </Col>
        <Col xs={24} lg={17}>
          <section className="page-band">
            {selectedCategory ? (
              <>
                <div className="category-detail-header">
                  <div>
                    <Typography.Title level={4} className="section-title">
                      {selectedCategory.name}
                    </Typography.Title>
                    <Space wrap>
                      <Tag>{selectedCategory.level === 1 ? text.primaryCategory : `\u7b2c ${selectedCategory.level} \u7ea7\u5206\u7c7b`}</Tag>
                      {selectedCategory.code && <Tag color="blue">{`${text.categoryCode}: ${selectedCategory.code}`}</Tag>}
                      <Tag>{`${text.sort}: ${selectedCategory.sort}`}</Tag>
                      {selectedCategory.isSystem ? <Tag color="blue">{text.fixed}</Tag> : <Tag color="green">{text.custom}</Tag>}
                    </Space>
                  </div>
                  <Space wrap>
                    {selectedCategory.level < 4 && (
                      <Button icon={<PlusOutlined />} disabled={!admin} onClick={() => onCreateChild(selectedCategory.id)}>
                        {text.addChildCategory}
                      </Button>
                    )}
                    <Button icon={<EditOutlined />} disabled={!admin} onClick={() => onEdit(selectedCategory)}>
                      {text.editCategory}
                    </Button>
                    <Button danger icon={<DeleteOutlined />} disabled={!admin} onClick={() => onDelete(selectedCategory)}>
                      {text.delete}
                    </Button>
                  </Space>
                </div>
                <div className="category-overview-grid">
                  <div className="category-overview-item">
                    <Typography.Text type="secondary">{text.filesInCategory}</Typography.Text>
                    <Typography.Title level={3}>{categoryDocuments.length}</Typography.Title>
                  </div>
                  <div className="category-overview-item">
                    <Typography.Text type="secondary">{text.childCategoryCount}</Typography.Text>
                    <Typography.Title level={3}>{rows.length}</Typography.Title>
                  </div>
                  <div className="category-overview-item">
                    <Typography.Text type="secondary">{text.monthNewFiles}</Typography.Text>
                    <Typography.Title level={3}>{monthNewCount}</Typography.Title>
                  </div>
                  <div className="category-overview-item">
                    <Typography.Text type="secondary">{text.latestUpdate}</Typography.Text>
                    <Typography.Title level={5}>{latestUpdatedAt ? formatDate(latestUpdatedAt) : text.none}</Typography.Title>
                  </div>
                </div>
                {selectedCategory.level < 4 && (
                  <div className="category-detail-section">
                    <Typography.Title level={5} className="section-title">
                      {text.childCategories}
                    </Typography.Title>
                    <Table
                      rowKey="id"
                      dataSource={rows}
                      pagination={false}
                      columns={[
                        {
                          title: text.categoryName,
                          dataIndex: "name",
                          render: (value: string) => (
                            <Space size={8}>
                              <FileTextOutlined className="subcategory-row-icon" />
                              <Typography.Text strong>{value}</Typography.Text>
                            </Space>
                          ),
                        },
                        {
                          title: text.parentCategory,
                          width: 160,
                          render: (_value, record) =>
                            record.level === 1 ? "-" : findCategory(categories, record.parentId ?? undefined)?.name ?? "-",
                        },
                        { title: text.sort, dataIndex: "sort", width: 100 },
                        {
                          title: text.status,
                          width: 110,
                          render: (_value, record) =>
                            record.isSystem ? <Tag color="blue">{text.fixed}</Tag> : <Tag color="green">{text.custom}</Tag>,
                        },
                        {
                          title: text.actions,
                          fixed: "right",
                          width: 190,
                          render: (_value, record) => (
                            <Space>
                              <Button size="small" icon={<EditOutlined />} disabled={!admin} onClick={() => onEdit(record)}>
                                {text.editCategory}
                              </Button>
                              <Button size="small" danger icon={<DeleteOutlined />} disabled={!admin} onClick={() => onDelete(record)}>
                                {text.delete}
                              </Button>
                            </Space>
                          ),
                        },
                      ]}
                      scroll={{ x: 780 }}
                      locale={{ emptyText: <Empty description={text.noSubcategory} /> }}
                    />
                  </div>
                )}
                <div className="category-detail-section">
                  <div className="section-toolbar">
                    <Typography.Title level={5} className="section-title">
                      {text.categoryFiles}
                    </Typography.Title>
                    <Space wrap>
                      <Typography.Text type="secondary">
                        {`${categoryDocuments.length} ${text.pieces}`}
                      </Typography.Text>
                      <Button
                        size="small"
                        icon={<DownloadOutlined />}
                        loading={exporting}
                        disabled={!categoryDocuments.length}
                        onClick={() => void onExportCategory(selectedCategory)}
                      >
                        {text.exportCategoryFiles}
                      </Button>
                    </Space>
                  </div>
                  <List
                    className="category-file-list"
                    dataSource={categoryDocuments}
                    pagination={{ pageSize: 8, hideOnSinglePage: true }}
                    locale={{ emptyText: <Empty description={text.noCategoryFiles} /> }}
                    renderItem={renderCategoryFileItem}
                  />
                </div>
              </>
            ) : (
              <Empty description={text.noCategories} />
            )}
          </section>
        </Col>
      </Row>
    </div>
  );
}

function UploadDrawer({
  open,
  loading,
  categories,
  departments,
  tags,
  partners,
  fileInputRef,
  selectedFiles,
  onFilesChange,
  onClose,
  onSubmit,
}: {
  open: boolean;
  loading: boolean;
  categories: CategoryNode[];
  departments: DepartmentRecord[];
  tags: TagRecord[];
  partners: PartnerRecord[];
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  selectedFiles: UploadSelectedFile[];
  onFilesChange: (files: UploadSelectedFile[]) => void;
  onClose: () => void;
  onSubmit: (values: UploadFormValues) => Promise<void>;
}) {
  const [form] = Form.useForm<UploadFormValues>();
  const visibleFiles = selectedFiles.slice(0, 5);
  const hiddenFileCount = Math.max(0, selectedFiles.length - visibleFiles.length);
  const desktopFilePickerAvailable = Boolean(window.adminDocsDesktop);
  const openDesktopFilePicker = async () => {
    try {
      const desktopFiles = await window.adminDocsDesktop?.pickFiles();
      if (desktopFiles && desktopFiles.length > 0) {
        onFilesChange(desktopFiles);
      }
    } catch (error) {
      message.error(`${text.uploadFailed}: ${formatApiError(error)}`);
    }
  };

  useEffect(() => {
    if (!open) {
      form.resetFields();
      onFilesChange([]);
    }
  }, [form, onFilesChange, open]);

  return (
    <Drawer
      title={text.uploadDrawerTitle}
      width={520}
      open={open}
      onClose={onClose}
      destroyOnHidden
      extra={
        <Button type="primary" loading={loading} onClick={() => form.submit()} disabled={selectedFiles.length === 0}>
          {text.saveUpload}
        </Button>
      }
    >
      <Form form={form} layout="vertical" onFinish={(values) => void onSubmit(values)}>
        <Form.Item label={text.fileName} required>
          <input
            ref={fileInputRef}
            id="document-file-input"
            type="file"
            className="upload-file-input"
            multiple
            accept={acceptedUploadFileTypes}
            onChange={(event) => onFilesChange(Array.from(event.target.files ?? []))}
          />
          {desktopFilePickerAvailable ? (
            <Button className="upload-picker" icon={<UploadOutlined />} onClick={() => void openDesktopFilePicker()}>
              {selectedFiles.length > 0 ? text.reselectFiles : text.selectFiles}
            </Button>
          ) : (
            <label htmlFor="document-file-input" className="upload-picker">
              <UploadOutlined />
              <span>{selectedFiles.length > 0 ? text.reselectFiles : text.selectFiles}</span>
            </label>
          )}
          {selectedFiles.length > 0 ? (
            <div className="upload-file-list">
              <Typography.Text type="secondary">
                {`${text.selectedFilesCountPrefix}${selectedFiles.length}${text.selectedFilesCountSuffix}`}
              </Typography.Text>
              <List
                size="small"
                dataSource={visibleFiles}
                renderItem={(file) => (
                  <List.Item>
                    <Typography.Text ellipsis>{file.name}</Typography.Text>
                    <Typography.Text type="secondary">{formatSize(file.size)}</Typography.Text>
                  </List.Item>
                )}
              />
              {hiddenFileCount > 0 && (
                <Typography.Text type="secondary">
                  {`${text.moreFilesPrefix}${hiddenFileCount}${text.moreFilesSuffix}`}
                </Typography.Text>
              )}
            </div>
          ) : (
            <Typography.Paragraph type="secondary" className="upload-file-name">
              {text.supportedFiles}
            </Typography.Paragraph>
          )}
        </Form.Item>
        <Form.Item
          name="categoryPath"
          label={text.categoryPath}
          rules={[{ required: true, message: text.chooseCategoryPath }]}
        >
          <Cascader
            changeOnSelect
            placeholder={text.chooseCategoryPath}
            options={toCategoryOptions(categories)}
          />
        </Form.Item>
        <Form.Item name="title" label={text.fileName} help={selectedFiles.length > 1 ? text.batchFileNameHint : undefined}>
          <Input
            placeholder={selectedFiles.length > 1 ? text.batchFileNameHint : text.defaultFileName}
            maxLength={200}
            disabled={selectedFiles.length > 1}
          />
        </Form.Item>
        <Form.Item name="departmentId" label={text.department}>
          <Select
            allowClear
            placeholder={text.optional}
            options={departments.map((item) => ({ label: item.name, value: item.id }))}
          />
        </Form.Item>
        <Form.Item name="tagNames" label={text.tags}>
          <Input placeholder={text.tagPlaceholder} maxLength={200} />
        </Form.Item>
        <Form.Item name="remark" label={text.remark}>
          <Input.TextArea rows={4} maxLength={500} />
        </Form.Item>
        {(tags.length > 0 || partners.length > 0) && (
          <Typography.Paragraph type="secondary">
            {`\u5f53\u524d\u5df2\u6709 ${tags.length} \u4e2a\u6807\u7b7e\u3001${partners.length} \u4e2a\u5408\u4f5c\u5355\u4f4d\u3002`}
          </Typography.Paragraph>
        )}
      </Form>
    </Drawer>
  );
}
