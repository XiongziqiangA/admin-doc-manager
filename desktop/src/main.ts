import { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage, safeStorage, shell } from "electron";
import type { OpenDialogOptions } from "electron";
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { dirname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { pathToFileURL } from "node:url";

const APP_NAME = "企业行政资料管理系统";
const DEFAULT_LOCAL_URL = "http://localhost:8080";
const RUNTIME_CONFIG_FILE = "runtime-config.json";
const DOCKER_DESKTOP_EXE = "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe";
const ICON_FILE = "icon.ico";
const PROJECT_ROOT_FILE = "project-root.txt";
const SAVED_LOGIN_FILE = "saved-login.json";
const ALLOWED_FILE_EXTENSIONS = [
  "pdf",
  "ofd",
  "ceb",
  "doc",
  "docx",
  "docm",
  "dot",
  "dotx",
  "dotm",
  "wps",
  "wpt",
  "rtf",
  "txt",
  "md",
  "log",
  "odt",
  "pages",
  "xls",
  "xlsx",
  "xlsm",
  "xlsb",
  "xlt",
  "xltx",
  "xltm",
  "csv",
  "tsv",
  "et",
  "ett",
  "ods",
  "numbers",
  "ppt",
  "pptx",
  "pptm",
  "pot",
  "potx",
  "potm",
  "pps",
  "ppsx",
  "ppsm",
  "dps",
  "dpt",
  "odp",
  "key",
  "jpg",
  "jpeg",
  "jfif",
  "png",
  "gif",
  "bmp",
  "tif",
  "tiff",
  "webp",
  "heic",
  "heif",
  "psd",
  "ai",
  "eps",
  "cdr",
  "indd",
  "zip",
  "rar",
  "7z",
  "tar",
  "gz",
  "bz2",
  "xz",
  "xml",
  "json",
  "dat",
  "dbf",
  "db",
  "mdb",
  "accdb",
  "sqlite",
  "sqlite3",
  "bak",
  "ofx",
  "qif",
  "iif",
  "eml",
  "msg",
  "ics",
  "vcf",
  "cer",
  "crt",
  "pfx",
  "p12",
  "xmind",
  "mind",
  "mm",
  "vsd",
  "vsdx",
  "vss",
  "vssx",
  "vst",
  "vstx",
  "dwg",
  "dxf",
  "dwf",
  "dwfx",
  "dgn",
  "skp",
  "mp3",
  "wav",
  "m4a",
  "aac",
  "flac",
  "amr",
  "wma",
  "mp4",
  "mov",
  "avi",
  "wmv",
  "mkv",
  "m4v",
  "webm",
  "caj",
];
const PRINTABLE_FILE_EXTENSIONS = new Set([
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

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let projectRoot = "";
let stackOperation: Promise<void> | null = null;
const pickedFiles = new Map<string, string>();

type RuntimeMode = "local" | "server";

interface RuntimeConfig {
  mode: RuntimeMode;
  serverUrl: string;
}

let runtimeConfig: RuntimeConfig = {
  mode: "local",
  serverUrl: DEFAULT_LOCAL_URL,
};

type StatusKind = "starting" | "ready" | "error";

interface DesktopSelectedFile {
  id: string;
  name: string;
  size: number;
  type: string;
}
interface DesktopDroppedFiles {
  files: DesktopSelectedFile[];
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

interface DesktopSavedLoginPayload {
  username: string;
  password: string;
}

interface RuntimeConfigPayload {
  mode: RuntimeMode;
  serverUrl?: string;
}

interface MultipartBody {
  body: Buffer;
  contentType: string;
}

interface ApiResponseBody {
  data?: unknown;
  message?: string;
}

function runtimeConfigPath() {
  return join(app.getPath("userData"), RUNTIME_CONFIG_FILE);
}

function normalizeServerUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) {
    throw new Error("服务器地址不能为空。");
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("服务器地址格式不正确，请填写完整的 http:// 或 https:// 地址。");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("服务器地址只支持 http:// 或 https://。");
  }
  if (url.username || url.password || url.hash || url.search || !["", "/"].includes(url.pathname)) {
    throw new Error("服务器地址不能包含账号、密码、子路径、查询参数或片段。");
  }
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error("服务器模式必须使用 HTTPS 地址；本机调试才允许 HTTP。");
  }
  return url.toString().replace(/\/+$/, "");
}

function parseRuntimeConfig(value: unknown): RuntimeConfig {
  if (!value || typeof value !== "object") {
    return { mode: "local", serverUrl: DEFAULT_LOCAL_URL };
  }
  const candidate = value as { mode?: unknown; serverUrl?: unknown };
  if (candidate.mode !== "local" && candidate.mode !== "server") {
    return { mode: "local", serverUrl: DEFAULT_LOCAL_URL };
  }
  if (candidate.mode === "local") {
    return { mode: "local", serverUrl: DEFAULT_LOCAL_URL };
  }
  if (typeof candidate.serverUrl !== "string") {
    return { mode: "local", serverUrl: DEFAULT_LOCAL_URL };
  }
  try {
    return { mode: "server", serverUrl: normalizeServerUrl(candidate.serverUrl) };
  } catch {
    return { mode: "local", serverUrl: DEFAULT_LOCAL_URL };
  }
}

function loadRuntimeConfig() {
  const configuredUrl = process.env.ADMIN_DOCS_SERVER_URL?.trim();
  if (configuredUrl) {
    runtimeConfig = { mode: "server", serverUrl: normalizeServerUrl(configuredUrl) };
    return runtimeConfig;
  }

  const filePath = runtimeConfigPath();
  if (!existsSync(filePath)) {
    return runtimeConfig;
  }
  try {
    runtimeConfig = parseRuntimeConfig(JSON.parse(readFileSync(filePath, "utf8")));
  } catch {
    runtimeConfig = { mode: "local", serverUrl: DEFAULT_LOCAL_URL };
  }
  return runtimeConfig;
}

function saveRuntimeConfig(payload: RuntimeConfigPayload) {
  if (payload.mode !== "local" && payload.mode !== "server") {
    throw new Error("连接模式不正确。");
  }
  const next: RuntimeConfig = payload.mode === "local"
    ? { mode: "local", serverUrl: DEFAULT_LOCAL_URL }
    : { mode: "server", serverUrl: normalizeServerUrl(payload.serverUrl ?? "") };
  const filePath = runtimeConfigPath();
  mkdirSync(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${randomUUID()}.tmp`;
  writeFileSync(tempPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  renameSync(tempPath, filePath);
  runtimeConfig = next;
  return next;
}

function systemUrl(pathname = "/") {
  return new URL(pathname, `${runtimeConfig.serverUrl}/`).toString();
}

function systemOrigin() {
  return new URL(runtimeConfig.serverUrl).origin;
}

function isTrustedRenderer(event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent) {
  if (event.sender !== mainWindow?.webContents) {
    return false;
  }
  const frameUrl = event.senderFrame?.url ?? "";
  if (frameUrl.startsWith("data:text/html")) {
    return true;
  }
  try {
    return new URL(frameUrl).origin === systemOrigin();
  } catch {
    return false;
  }
}

function requestForUrl(url: URL, options: Parameters<typeof httpRequest>[1], callback: Parameters<typeof httpRequest>[2]) {
  return url.protocol === "https:" ? httpsRequest(url, options, callback) : httpRequest(url, options, callback);
}

function findProjectRoot() {
  const candidates = [
    process.env.ADMIN_DOCS_ROOT,
    ...readConfiguredProjectRoots(),
    process.cwd(),
    app.getAppPath(),
    dirname(process.execPath),
    resolve(app.getAppPath(), ".."),
    resolve(app.getAppPath(), "..", ".."),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    let current = resolve(candidate);
    for (let i = 0; i < 5; i += 1) {
      if (existsSync(join(current, "docker-compose.prod.yml")) && existsSync(join(current, ".env.production"))) {
        return current;
      }
      const parent = dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }
  }

  throw new Error("Project root not found. Set ADMIN_DOCS_ROOT to the project root.");
}

function readConfiguredProjectRoots() {
  const configFiles = [
    join(app.getPath("userData"), PROJECT_ROOT_FILE),
    join(app.getAppPath(), "assets", PROJECT_ROOT_FILE),
    join(dirname(process.execPath), "resources", "assets", PROJECT_ROOT_FILE),
  ];

  return configFiles.flatMap((file) => {
    if (!existsSync(file)) {
      return [];
    }

    const content = readFileSync(file, "utf8").trim();
    return content ? [content] : [];
  });
}

async function runDocker(args: string[]) {
  await new Promise<void>((resolveRun, rejectRun) => {
    const child = spawn("docker", args, {
      cwd: projectRoot,
      detached: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });

    child.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        rejectRun(new Error("未检测到 Docker 命令，请先安装或启动 Docker Desktop。"));
        return;
      }
      rejectRun(error);
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolveRun();
        return;
      }

      rejectRun(new Error((output || `Docker 命令执行失败，退出码：${code ?? "unknown"}`).trim()));
    });
  });
}

function composeArgs(args: string[]) {
  return ["compose", "--env-file", ".env.production", "-f", "docker-compose.prod.yml", ...args];
}

async function delay(ms: number) {
  await new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

async function isHealthReady() {
  try {
    const response = await fetch(systemUrl("/api/health"));
    return response.ok;
  } catch {
    return false;
  }
}

function isDockerReady() {
  const result = spawnSync("docker", ["ps"], {
    cwd: projectRoot,
    stdio: "ignore",
    windowsHide: true,
  });
  return result.status === 0;
}

function isDockerCommandInstalled() {
  const result = spawnSync("docker", ["--version"], {
    cwd: projectRoot,
    stdio: "ignore",
    windowsHide: true,
  });
  return result.status === 0;
}

async function ensureDockerReady() {
  if (!isDockerReady() && existsSync(DOCKER_DESKTOP_EXE)) {
    spawn(DOCKER_DESKTOP_EXE, [], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    }).unref();
  } else if (!isDockerReady() && !isDockerCommandInstalled()) {
    throw new Error("未检测到 Docker，请先安装或启动 Docker Desktop。");
  }

  for (let i = 0; i < 36; i += 1) {
    if (isDockerReady()) {
      return;
    }
    await showStatus("starting", `正在等待 Docker Desktop 启动... ${i + 1}/36`);
    await delay(5000);
  }

  throw new Error("系统启动超时，请检查 Docker Desktop 和容器状态。");
}

async function startStack() {
  if (runtimeConfig.mode !== "local") {
    throw new Error("当前为服务器模式，不需要启动本机 Docker。");
  }
  await showStatus("starting", "正在检查 Docker Desktop...");
  await ensureDockerReady();
  await showStatus("starting", "正在启动本地服务...");
  await runDocker(composeArgs(["up", "-d"]));

  for (let i = 0; i < 60; i += 1) {
    if (await isHealthReady()) {
      await openSystem();
      return;
    }
    await showStatus("starting", `正在等待系统服务就绪... ${i + 1}/60`);
    await delay(3000);
  }

  throw new Error("系统启动超时，请检查 Docker 容器状态。");
}

async function stopStack() {
  if (runtimeConfig.mode !== "local") {
    await showStatus("ready", "当前为服务器模式，本机没有需要停止的服务。");
    return;
  }
  await showStatus("starting", "正在停止本地服务...");
  await runDocker(composeArgs(["down"]));
  await showStatus("ready", "系统已停止，可通过托盘菜单重新启动。");
}

async function restartStack() {
  if (runtimeConfig.mode !== "local") {
    await showStatus("ready", "当前为服务器模式，请使用连接设置切换服务器地址。");
    return;
  }
  await showStatus("starting", "正在重启本地服务...");
  await runDocker(composeArgs(["restart"]));
  for (let i = 0; i < 40; i += 1) {
    if (await isHealthReady()) {
      await openSystem();
      return;
    }
    await showStatus("starting", `正在等待系统恢复... ${i + 1}/40`);
    await delay(3000);
  }
  throw new Error("系统重启超时，请检查 Docker 容器状态。");
}

function runStackOperation(operation: () => Promise<void>) {
  if (stackOperation) {
    return stackOperation;
  }

  const pending = operation();
  const tracked = pending.finally(() => {
    if (stackOperation === tracked) {
      stackOperation = null;
    }
  });
  stackOperation = tracked;
  return tracked;
}

async function connectToConfiguredServer() {
  if (runtimeConfig.mode === "local") {
    projectRoot = findProjectRoot();
    updateTrayMenu();
    await runStackOperation(startStack);
    return;
  }

  projectRoot = "";
  updateTrayMenu();
  await showStatus("starting", `正在连接服务器：${runtimeConfig.serverUrl}`);
  for (let index = 0; index < 40; index += 1) {
    if (await isHealthReady()) {
      await openSystem();
      return;
    }
    await showStatus("starting", `正在等待服务器就绪... ${index + 1}/40`);
    await delay(3000);
  }
  throw new Error("服务器连接超时，请检查地址、HTTPS 证书和服务状态。");
}

function createWindow() {
  const iconPath = resolveIconPath();
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1024,
    minHeight: 720,
    title: APP_NAME,
    icon: iconPath || undefined,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
}

function registerDesktopFilePicker() {
  ipcMain.handle("admin-docs:pick-files", async (event): Promise<DesktopSelectedFile[]> => {
    if (!isTrustedRenderer(event)) {
      throw new Error("非法的桌面应用调用来源。");
    }
    const options: OpenDialogOptions = {
      title: "选择要上传的文件",
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "OFD 文件", extensions: ["ofd"] },
        { name: "支持的行政办公文件", extensions: ALLOWED_FILE_EXTENSIONS },
      ],
    };
    const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);

    if (result.canceled) {
      return [];
    }

    return result.filePaths
      .map(registerDesktopFile)
      .filter((file): file is DesktopSelectedFile => file !== null);
  });

  ipcMain.on("admin-docs:register-dropped-files", (event, value: unknown) => {
    if (!isTrustedRenderer(event) || !Array.isArray(value)) {
      logDesktopEvent("drop-register-ignored", {
        fromMainWindow: event.sender === mainWindow?.webContents,
        isArray: Array.isArray(value),
      });
      return;
    }
    const filePaths = value.filter((filePath): filePath is string => typeof filePath === "string");
    const result = registerDroppedFiles(filePaths);
    logDesktopEvent("drop-register", {
      pathCount: filePaths.length,
      acceptedCount: result.files.length,
      rejectedCount: result.rejectedCount,
      fileNames: result.files.map((file) => file.name),
    });
    event.sender.send("admin-docs:dropped-files", result);
  });

  ipcMain.handle("admin-docs:register-dropped-files-direct", (event, value: unknown): DesktopDroppedFiles => {
    if (!isTrustedRenderer(event) || !Array.isArray(value)) {
      logDesktopEvent("drop-register-direct-ignored", {
        fromMainWindow: event.sender === mainWindow?.webContents,
        isArray: Array.isArray(value),
      });
      return { files: [], rejectedCount: 0 };
    }
    const filePaths = value.filter((filePath): filePath is string => typeof filePath === "string");
    const result = registerDroppedFiles(filePaths);
    logDesktopEvent("drop-register-direct", {
      pathCount: filePaths.length,
      acceptedCount: result.files.length,
      rejectedCount: result.rejectedCount,
      fileNames: result.files.map((file) => file.name),
    });
    return result;
  });

  ipcMain.on("admin-docs:desktop-debug", (event, details: unknown) => {
    if (!isTrustedRenderer(event) || !details || typeof details !== "object") {
      return;
    }
    logDesktopEvent("renderer-debug", details as Record<string, unknown>);
  });

  ipcMain.handle("admin-docs:upload-document", async (event, payload: DesktopUploadPayload) => {
    if (!isTrustedRenderer(event)) {
      throw new Error("非法的桌面应用调用来源。");
    }
    const filePath = pickedFiles.get(payload.fileId);
    if (!filePath) {
      throw new Error("未找到已选择的文件，请重新选择后上传。");
    }
    if (!payload.accessToken) {
      throw new Error("登录状态无效，请重新登录后上传。");
    }

    const buffer = readFileSync(filePath);
    const fileName = filePath.split(/[\\/]/).pop() ?? "未命名文件";
    const contentType = mimeTypeForPath(filePath);
    const multipart = buildMultipartBody(
      [
        ["categoryId", payload.fields.categoryId],
        ["subcategoryId", payload.fields.subcategoryId],
        ["departmentId", payload.fields.departmentId],
        ["title", payload.fields.title],
        ["remark", payload.fields.remark],
        ...(payload.fields.tagNames ?? []).map((tagName) => ["tagNames", tagName] as [string, string | undefined]),
      ],
      {
        fieldName: "file",
        fileName,
        contentType,
        buffer,
      },
    );

    logDesktopUpload("start", { fileName, filePath, contentType, fileBytes: buffer.byteLength });
    const response = await postMultipartResponse("/api/documents/upload", payload.accessToken, multipart);
    logDesktopUpload(response.ok ? "success" : "failed", {
      fileName,
      filePath,
      contentType,
      fileBytes: buffer.byteLength,
      statusCode: response.status,
    });
    const body = await response.json().catch(() => undefined) as { message?: string; data?: unknown } | undefined;
    if (!response.ok) {
      throw new Error(body?.message ?? "文件上传失败");
    }
    return body?.data;
  });

  ipcMain.handle("admin-docs:upload-document-version", async (event, payload: DesktopVersionUploadPayload) => {
    if (!isTrustedRenderer(event)) {
      throw new Error("非法的桌面应用调用来源。");
    }
    const filePath = pickedFiles.get(payload.fileId);
    if (!filePath) {
      throw new Error("未找到已选择的文件，请重新选择后上传。");
    }
    if (!payload.accessToken) {
      throw new Error("登录状态无效，请重新登录后上传。");
    }

    const buffer = readFileSync(filePath);
    const fileName = filePath.split(/[\\/]/).pop() ?? "未命名文件";
    const contentType = mimeTypeForPath(filePath);
    const multipart = buildMultipartBody(
      [["changeNote", payload.changeNote]],
      {
        fieldName: "file",
        fileName,
        contentType,
        buffer,
      },
    );

    logDesktopUpload("version-start", { documentId: payload.documentId, fileName, filePath, contentType, fileBytes: buffer.byteLength });
    const response = await postMultipartResponse(`/api/documents/${payload.documentId}/versions`, payload.accessToken, multipart);
    logDesktopUpload(response.ok ? "version-success" : "version-failed", {
      documentId: payload.documentId,
      fileName,
      filePath,
      contentType,
      fileBytes: buffer.byteLength,
      statusCode: response.status,
    });
    const body = await response.json().catch(() => undefined) as { message?: string; data?: unknown } | undefined;
    if (!response.ok) {
      throw new Error(body?.message ?? "文件新版本上传失败");
    }
    return body?.data;
  });

  ipcMain.handle("admin-docs:open-document-file", async (event, payload: DesktopOpenDocumentPayload) => {
    if (!isTrustedRenderer(event)) {
      throw new Error("非法的桌面应用调用来源。");
    }
    if (!payload.accessToken) {
      throw new Error("登录状态无效，请重新登录后打开文件。");
    }
    if (!payload.documentId) {
      throw new Error("文件信息不完整，无法打开。");
    }

    const filePath = await downloadDocumentToTemp(payload);
    const openError = await shell.openPath(filePath);
    if (openError) {
      throw new Error(openError);
    }
    logDesktopEvent("open-document-file", {
      documentId: payload.documentId,
      versionId: payload.versionId,
      filePath,
    });
    return { filePath };
  });

  ipcMain.handle("admin-docs:print-document-file", async (event, payload: DesktopOpenDocumentPayload) => {
    if (!isTrustedRenderer(event)) {
      throw new Error("非法的桌面应用调用来源。");
    }
    if (!payload.accessToken) {
      throw new Error("登录状态无效，请重新登录后打印文件。");
    }
    if (!payload.documentId) {
      throw new Error("文件信息不完整，无法打印。");
    }
    if (!isPrintableFileName(payload.fileName)) {
      throw new Error("当前仅支持 PDF、图片和文本文件直接打印，请先打开其他格式后打印。");
    }

    const filePath = await downloadDocumentToTemp(payload, "preview");
    await printLocalFile(filePath);
    logDesktopEvent("print-document-file", {
      documentId: payload.documentId,
      versionId: payload.versionId,
      filePath,
    });
    return { filePath };
  });

  ipcMain.handle("admin-docs:get-saved-login", (event): DesktopSavedLoginPayload | null => {
    if (!isTrustedRenderer(event)) {
      throw new Error("非法的桌面应用调用来源。");
    }
    return readSavedLogin();
  });

  ipcMain.handle("admin-docs:save-login", (event, payload: DesktopSavedLoginPayload) => {
    if (!isTrustedRenderer(event)) {
      throw new Error("非法的桌面应用调用来源。");
    }
    saveLogin(payload);
    return true;
  });

  ipcMain.handle("admin-docs:clear-saved-login", (event) => {
    if (!isTrustedRenderer(event)) {
      throw new Error("非法的桌面应用调用来源。");
    }
    clearSavedLogin();
    return true;
  });

  ipcMain.handle("admin-docs:get-runtime-config", (event): RuntimeConfig => {
    if (!isTrustedRenderer(event)) {
      throw new Error("非法的桌面应用调用来源。");
    }
    return runtimeConfig;
  });

  ipcMain.handle("admin-docs:save-runtime-config", async (event, payload: RuntimeConfigPayload) => {
    if (!isTrustedRenderer(event)) {
      throw new Error("非法的桌面应用调用来源。");
    }
    const next = saveRuntimeConfig(payload);
    updateTrayMenu();
    await showStatus("starting", "连接设置已保存，正在重新连接...");
    void connectToConfiguredServer().catch(showError);
    return next;
  });

  ipcMain.handle("admin-docs:open-runtime-settings", async (event) => {
    if (!isTrustedRenderer(event)) {
      throw new Error("非法的桌面应用调用来源。");
    }
    await showRuntimeSettingsPage();
    return true;
  });

  ipcMain.handle("admin-docs:open-system", async (event) => {
    if (!isTrustedRenderer(event)) {
      throw new Error("非法的桌面应用调用来源。");
    }
    await openSystem();
    return true;
  });

  ipcMain.handle("admin-docs:start-stack", async (event) => {
    if (!isTrustedRenderer(event)) {
      throw new Error("非法的桌面应用调用来源。");
    }
    if (runtimeConfig.mode === "local" && !projectRoot) {
      projectRoot = findProjectRoot();
      updateTrayMenu();
    }
    await runStackOperation(startStack);
    return true;
  });

  ipcMain.handle("admin-docs:stop-stack", async (event) => {
    if (!isTrustedRenderer(event)) {
      throw new Error("非法的桌面应用调用来源。");
    }
    if (runtimeConfig.mode === "local" && !projectRoot) {
      projectRoot = findProjectRoot();
      updateTrayMenu();
    }
    await runStackOperation(stopStack);
    return true;
  });

  ipcMain.handle("admin-docs:restart-stack", async (event) => {
    if (!isTrustedRenderer(event)) {
      throw new Error("非法的桌面应用调用来源。");
    }
    if (runtimeConfig.mode === "local" && !projectRoot) {
      projectRoot = findProjectRoot();
      updateTrayMenu();
    }
    await runStackOperation(restartStack);
    return true;
  });
}

function registerDroppedFiles(filePaths: string[]): DesktopDroppedFiles {
  const uniquePaths = [...new Set(filePaths)];
  const files = uniquePaths
    .map(registerDesktopFile)
    .filter((file): file is DesktopSelectedFile => file !== null);

  return {
    files,
    rejectedCount: uniquePaths.length - files.length,
  };
}

function registerDesktopFile(filePath: string): DesktopSelectedFile | null {
  const fileName = filePath.split(/[\\/]/).pop() ?? "";
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (!extension || !ALLOWED_FILE_EXTENSIONS.includes(extension)) {
    return null;
  }

  try {
    const fileStats = statSync(filePath);
    if (!fileStats.isFile()) {
      return null;
    }
    const id = randomUUID();
    pickedFiles.set(id, filePath);
    return {
      id,
      name: fileName,
      size: fileStats.size,
      type: mimeTypeForPath(filePath),
    };
  } catch {
    return null;
  }
}

function buildMultipartBody(
  fields: Array<[string, string | undefined]>,
  file: { fieldName: string; fileName: string; contentType: string; buffer: Buffer },
): MultipartBody {
  const boundary = `----AdminDocsDesktop${randomUUID().replaceAll("-", "")}`;
  const chunks: Buffer[] = [];
  const appendText = (value: string) => chunks.push(Buffer.from(value, "utf8"));

  for (const [name, value] of fields) {
    if (!value) {
      continue;
    }
    appendText(`--${boundary}\r\n`);
    appendText(`Content-Disposition: form-data; name="${escapeMultipartToken(name)}"\r\n\r\n`);
    appendText(`${value}\r\n`);
  }

  appendText(`--${boundary}\r\n`);
  appendText(
    `Content-Disposition: form-data; name="${escapeMultipartToken(file.fieldName)}"; filename="${escapeMultipartToken(file.fileName)}"\r\n`,
  );
  appendText(`Content-Type: ${file.contentType || "application/octet-stream"}\r\n\r\n`);
  chunks.push(file.buffer);
  appendText("\r\n");
  appendText(`--${boundary}--\r\n`);

  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

function postMultipartResponse(pathname: string, accessToken: string, multipart: MultipartBody) {
  return new Promise<{ ok: boolean; status: number; json: () => Promise<ApiResponseBody | undefined> }>((resolvePromise, reject) => {
    const url = new URL(pathname, `${runtimeConfig.serverUrl}/`);
    const request = requestForUrl(
      url,
      {
        method: "POST",
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": multipart.contentType,
          "Content-Length": String(multipart.body.byteLength),
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          const rawBody = Buffer.concat(chunks).toString("utf8");
          const status = response.statusCode ?? 0;
          resolvePromise({
            ok: status >= 200 && status < 300,
            status,
            json: async () => {
              if (!rawBody) {
                return undefined;
              }
              return JSON.parse(rawBody) as ApiResponseBody;
            },
          });
        });
      },
    );

    request.on("error", reject);
    request.setTimeout(120000, () => request.destroy(new Error("Desktop upload request timed out")));
    request.end(multipart.body);
  });
}

function downloadDocumentToTemp(payload: DesktopOpenDocumentPayload, endpoint: "download" | "preview" = "download") {
  return new Promise<string>((resolvePromise, reject) => {
    const query = payload.versionId ? `?versionId=${encodeURIComponent(payload.versionId)}` : "";
    const url = new URL(`/api/documents/${payload.documentId}/${endpoint}${query}`, `${runtimeConfig.serverUrl}/`);
    const request = requestForUrl(
      url,
      {
        method: "GET",
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        headers: {
          Authorization: `Bearer ${payload.accessToken}`,
        },
      },
      async (response) => {
        const status = response.statusCode ?? 0;
        if (status < 200 || status >= 300) {
          const chunks: Buffer[] = [];
          response.on("data", (chunk: Buffer) => chunks.push(chunk));
          response.on("end", () => {
            const rawBody = Buffer.concat(chunks).toString("utf8");
            try {
              const body = JSON.parse(rawBody) as ApiResponseBody;
              reject(new Error(body.message ?? "文件打开失败"));
            } catch {
              reject(new Error("文件打开失败"));
            }
          });
          return;
        }

        try {
          const openDir = join(app.getPath("userData"), "opened-files");
          mkdirSync(openDir, { recursive: true });
          const filePath = join(openDir, `${Date.now()}-${randomUUID()}-${sanitizeLocalFileName(payload.fileName)}`);
          await pipeline(response, createWriteStream(filePath));
          resolvePromise(filePath);
        } catch (error) {
          reject(error);
        }
      },
    );

    request.on("error", reject);
    request.setTimeout(120000, () => request.destroy(new Error("打开文件请求超时")));
    request.end();
  });
}

function isPrintableFileName(fileName?: string) {
  const extension = fileName?.split(".").pop()?.toLowerCase();
  return Boolean(extension && PRINTABLE_FILE_EXTENSIONS.has(extension));
}

function printLocalFile(filePath: string) {
  return new Promise<void>((resolvePromise, reject) => {
    const printWindow = new BrowserWindow({
      show: false,
      width: 1000,
      height: 800,
      webPreferences: { sandbox: true },
    });
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      if (!printWindow.isDestroyed()) {
        printWindow.destroy();
      }
      if (error) {
        reject(error);
      } else {
        resolvePromise();
      }
    };

    printWindow.webContents.once("did-fail-load", (_event, errorCode, errorDescription) => {
      finish(new Error(`打印文件加载失败（${errorCode}）：${errorDescription}`));
    });
    printWindow.webContents.once("did-finish-load", () => {
      setTimeout(() => {
        if (printWindow.isDestroyed()) {
          finish(new Error("打印窗口已关闭"));
          return;
        }
        printWindow.webContents.print(
          { silent: false, printBackground: true, margins: { marginType: "default" } },
          (success, failureReason) => {
            finish(success ? undefined : new Error(failureReason || "打印未完成"));
          },
        );
      }, 500);
    });
    void printWindow.loadURL(pathToFileURL(filePath).toString()).catch((error: unknown) => {
      finish(error instanceof Error ? error : new Error("打印文件加载失败"));
    });
  });
}

function sanitizeLocalFileName(fileName?: string) {
  const sanitized = (fileName || "未命名文件")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+|\.+$/g, "");
  return sanitized || "未命名文件";
}

function getSavedLoginFilePath() {
  return join(app.getPath("userData"), SAVED_LOGIN_FILE);
}

function readSavedLogin(): DesktopSavedLoginPayload | null {
  const filePath = getSavedLoginFilePath();
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const raw = JSON.parse(readFileSync(filePath, "utf8")) as { username?: string; password?: string };
    if (!raw.username || !raw.password) {
      return null;
    }
    return {
      username: raw.username,
      password: safeStorage.decryptString(Buffer.from(raw.password, "base64")),
    };
  } catch {
    return null;
  }
}

function saveLogin(payload: DesktopSavedLoginPayload) {
  const username = payload.username.trim();
  if (!username || !payload.password) {
    clearSavedLogin();
    return;
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("当前系统不支持加密保存密码。");
  }

  const filePath = getSavedLoginFilePath();
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(
    filePath,
    JSON.stringify({
      username,
      password: safeStorage.encryptString(payload.password).toString("base64"),
    }),
    "utf8",
  );
}

function clearSavedLogin() {
  const filePath = getSavedLoginFilePath();
  if (existsSync(filePath)) {
    unlinkSync(filePath);
  }
}

function logDesktopUpload(event: string, details: Record<string, unknown>) {
  logDesktopEvent(`upload-${event}`, details);
}

function logDesktopEvent(event: string, details: Record<string, unknown>) {
  try {
    const logDir = join(app.getPath("userData"), "logs");
    mkdirSync(logDir, { recursive: true });
    appendFileSync(join(logDir, "desktop.log"), `${new Date().toISOString()} ${JSON.stringify({ event, ...details })}\n`, "utf8");
  } catch {
    // Logging must never break the user flow.
  }
}

function escapeMultipartToken(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\r", "").replaceAll("\n", "");
}

function mimeTypeForPath(filePath: string) {
  const extension = filePath.split(".").pop()?.toLowerCase();
  switch (extension) {
    case "pdf":
      return "application/pdf";
    case "ofd":
      return "application/ofd";
    case "ceb":
      return "application/octet-stream";
    case "doc":
    case "dot":
      return "application/msword";
    case "docx":
    case "docm":
    case "dotx":
    case "dotm":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "rtf":
      return "application/rtf";
    case "txt":
    case "md":
    case "log":
      return "text/plain";
    case "xls":
    case "xlt":
    case "et":
    case "ett":
      return "application/vnd.ms-excel";
    case "xlsx":
    case "xlsm":
    case "xlsb":
    case "xltx":
    case "xltm":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "csv":
      return "text/csv";
    case "tsv":
      return "text/tab-separated-values";
    case "ppt":
    case "pps":
    case "pot":
    case "dps":
    case "dpt":
      return "application/vnd.ms-powerpoint";
    case "pptx":
    case "pptm":
    case "ppsx":
    case "ppsm":
    case "potx":
    case "potm":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    case "jpg":
    case "jpeg":
    case "jfif":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "bmp":
      return "image/bmp";
    case "tif":
    case "tiff":
      return "image/tiff";
    case "webp":
      return "image/webp";
    case "psd":
      return "image/vnd.adobe.photoshop";
    case "ai":
    case "eps":
      return "application/postscript";
    case "zip":
      return "application/zip";
    case "rar":
      return "application/vnd.rar";
    case "7z":
      return "application/x-7z-compressed";
    case "xml":
      return "application/xml";
    case "json":
      return "application/json";
    case "eml":
      return "message/rfc822";
    case "ics":
      return "text/calendar";
    case "vcf":
      return "text/vcard";
    case "cer":
    case "crt":
      return "application/pkix-cert";
    case "pfx":
    case "p12":
      return "application/x-pkcs12";
    case "mp3":
      return "audio/mpeg";
    case "wav":
      return "audio/wav";
    case "m4a":
      return "audio/mp4";
    case "aac":
      return "audio/aac";
    case "flac":
      return "audio/flac";
    case "amr":
      return "audio/amr";
    case "wma":
      return "audio/x-ms-wma";
    case "mp4":
      return "video/mp4";
    case "mov":
      return "video/quicktime";
    case "avi":
      return "video/x-msvideo";
    case "wmv":
      return "video/x-ms-wmv";
    case "mkv":
      return "video/x-matroska";
    case "m4v":
      return "video/x-m4v";
    case "webm":
      return "video/webm";
    case "xmind":
    case "mind":
    case "mm":
      return "application/octet-stream";
    case "vsd":
    case "vsdx":
    case "vss":
    case "vssx":
    case "vst":
    case "vstx":
      return "application/vnd.visio";
    case "dwg":
    case "dxf":
    case "dwf":
    case "dwfx":
    case "dgn":
    case "skp":
      return "application/octet-stream";
    default:
      return "application/octet-stream";
  }
}

function createTray() {
  const icon = createTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip(APP_NAME);
  updateTrayMenu();
  tray.on("click", () => void openSystem());
}

function updateTrayMenu() {
  if (!tray) {
    return;
  }
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "打开系统", click: () => void openSystem() },
      { label: "连接设置", click: () => void showRuntimeSettingsPage() },
      {
        label: "启动 Docker 服务",
        enabled: runtimeConfig.mode === "local" && Boolean(projectRoot),
        click: () => void runStackOperation(startStack).catch(showError),
      },
      {
        label: "重启 Docker 服务",
        enabled: runtimeConfig.mode === "local" && Boolean(projectRoot),
        click: () => void runStackOperation(restartStack).catch(showError),
      },
      {
        label: "停止 Docker 服务",
        enabled: runtimeConfig.mode === "local" && Boolean(projectRoot),
        click: () => void runStackOperation(stopStack).catch(showError),
      },
      { type: "separator" },
      {
        label: "打开文件存储目录",
        enabled: runtimeConfig.mode === "local" && Boolean(projectRoot),
        click: () => void shell.openPath(join(projectRoot, "data", "storage")),
      },
      {
        label: "打开项目目录",
        enabled: runtimeConfig.mode === "local" && Boolean(projectRoot),
        click: () => void shell.openPath(projectRoot),
      },
      { type: "separator" },
      {
        label: "退出桌面应用",
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]),
  );
}

function createTrayIcon() {
  const iconPath = resolveIconPath();
  if (iconPath) {
    const fileIcon = nativeImage.createFromPath(iconPath);
    if (!fileIcon.isEmpty()) {
      return fileIcon;
    }
  }

  const icon = nativeImage.createFromDataURL(
    "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='64' height='64' rx='12' fill='%231d4ed8'/><path d='M18 16h20l8 8v24H18z' fill='white'/><path d='M38 16v10h10' fill='%23bfdbfe'/><path d='M24 34h16M24 41h12' stroke='%231d4ed8' stroke-width='4' stroke-linecap='round'/></svg>",
  );
  return icon.isEmpty() ? nativeImage.createEmpty() : icon;
}

function resolveIconPath() {
  const candidates = [
    join(projectRoot, "desktop", "assets", ICON_FILE),
    join(app.getAppPath(), "assets", ICON_FILE),
    join(dirname(process.execPath), "resources", "assets", ICON_FILE),
  ];

  return candidates.find((candidate) => existsSync(candidate)) ?? "";
}

async function showRuntimeSettingsPage() {
  if (!mainWindow) {
    return;
  }
  const current = runtimeConfig;
  const html = `
    <!doctype html>
    <html lang="zh-CN">
      <head>
        <meta charset="UTF-8" />
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f5f7fb; color: #111827; font-family: "Microsoft YaHei", "Segoe UI", Arial, sans-serif; }
          main { width: min(560px, calc(100vw - 48px)); padding: 30px; border: 1px solid #e5e7eb; border-radius: 8px; background: #fff; box-shadow: 0 16px 40px rgb(15 23 42 / 8%); }
          h1 { margin: 0 0 8px; font-size: 22px; }
          p { margin: 0 0 22px; color: #4b5563; line-height: 1.6; }
          label { display: block; margin: 14px 0 7px; color: #374151; font-size: 13px; font-weight: 600; }
          select, input { width: 100%; height: 40px; padding: 0 11px; border: 1px solid #d1d5db; border-radius: 6px; background: #fff; color: #111827; font: inherit; }
          .actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 24px; }
          button { height: 38px; padding: 0 16px; border: 0; border-radius: 6px; cursor: pointer; font: inherit; }
          #save { background: #1d4ed8; color: #fff; }
          #back { border: 1px solid #d1d5db; background: #fff; color: #374151; }
          #message { min-height: 22px; margin-top: 12px; color: #b91c1c; font-size: 13px; }
          .hint { margin-top: 8px; margin-bottom: 0; color: #6b7280; font-size: 12px; }
        </style>
      </head>
      <body>
        <main>
          <h1>连接设置</h1>
          <p>选择本机 Docker 服务，或连接已经部署好的企业管理系统服务器。</p>
          <form id="form">
            <label for="mode">运行方式</label>
            <select id="mode">
              <option value="local" ${current.mode === "local" ? "selected" : ""}>本机模式</option>
              <option value="server" ${current.mode === "server" ? "selected" : ""}>服务器模式</option>
            </select>
            <label for="serverUrl">服务器地址</label>
            <input id="serverUrl" type="url" placeholder="https://your-server.example.com" value="${escapeHtml(current.mode === "server" ? current.serverUrl : "")}" />
            <p class="hint">服务器模式要求使用 HTTPS；本机调试地址可使用 http://localhost。</p>
            <div id="message" role="alert"></div>
            <div class="actions"><button id="back" type="button">返回</button><button id="save" type="submit">保存并连接</button></div>
          </form>
        </main>
        <script>
          const mode = document.getElementById('mode');
          const serverUrl = document.getElementById('serverUrl');
          const message = document.getElementById('message');
          const sync = () => { serverUrl.disabled = mode.value !== 'server'; };
          mode.addEventListener('change', sync);
          sync();
          document.getElementById('back').addEventListener('click', () => window.adminDocsDesktop?.openSystem());
          document.getElementById('form').addEventListener('submit', async (event) => {
            event.preventDefault();
            message.textContent = '正在保存...';
            try {
              await window.adminDocsDesktop?.saveRuntimeConfig({ mode: mode.value, serverUrl: serverUrl.value });
            } catch (error) {
              message.textContent = error instanceof Error ? error.message : String(error);
            }
          });
        </script>
      </body>
    </html>
  `;
  await mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  mainWindow.show();
  mainWindow.focus();
}

async function showStatus(kind: StatusKind, message: string) {
  if (!mainWindow) {
    return;
  }
  const color = kind === "error" ? "#dc2626" : kind === "ready" ? "#059669" : "#1d4ed8";
  const html = `
    <!doctype html>
    <html lang="zh-CN">
      <head>
        <meta charset="UTF-8" />
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            background: #f5f7fb;
            color: #111827;
            font-family: "Microsoft YaHei", "Segoe UI", Arial, sans-serif;
          }
          main {
            width: min(520px, calc(100vw - 48px));
            padding: 28px;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            background: #fff;
            box-shadow: 0 16px 40px rgb(15 23 42 / 8%);
          }
          h1 { margin: 0 0 12px; font-size: 22px; }
          p { margin: 0; color: #4b5563; line-height: 1.7; }
          .status { color: ${color}; font-weight: 700; margin-bottom: 10px; }
          .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 24px; }
          button { min-height: 40px; padding: 0 16px; border: 0; border-radius: 6px; cursor: pointer; font: inherit; }
          button:disabled { cursor: wait; opacity: .6; }
          .primary { background: #1d4ed8; color: #fff; }
          .danger { background: #dc2626; color: #fff; }
          .secondary { border: 1px solid #d1d5db; background: #fff; color: #374151; }
          #feedback { min-height: 22px; margin-top: 12px; color: #b91c1c; font-size: 13px; }
        </style>
      </head>
      <body>
        <main>
          <div class="status">${escapeHtml(message)}</div>
          <h1>${APP_NAME}</h1>
          <p>当前连接方式：${runtimeConfig.mode === "local" ? "本机 Docker 服务" : `服务器 ${escapeHtml(runtimeConfig.serverUrl)}`}。启动完成后会自动打开系统窗口。</p>
          <div id="feedback" role="alert"></div>
          <div class="actions">
            ${runtimeConfig.mode === "local" ? `
              <button id="start" class="primary" type="button">启动 Docker 服务</button>
              <button id="restart" class="secondary" type="button">重启 Docker 服务</button>
              <button id="stop" class="danger" type="button">停止 Docker 服务</button>
            ` : ""}
            <button id="settings" class="secondary" type="button">连接设置</button>
          </div>
        </main>
        <script>
          const feedback = document.getElementById('feedback');
          const invoke = (method) => {
            const buttons = document.querySelectorAll('button');
            buttons.forEach((button) => { button.disabled = true; });
            if (feedback) feedback.textContent = '正在执行，请稍候...';
            window.adminDocsDesktop?.[method]().catch((error) => {
              buttons.forEach((button) => { button.disabled = false; });
              if (feedback) feedback.textContent = error instanceof Error ? error.message : String(error);
            });
          };
          document.getElementById('start')?.addEventListener('click', () => invoke('startStack'));
          document.getElementById('restart')?.addEventListener('click', () => invoke('restartStack'));
          document.getElementById('stop')?.addEventListener('click', () => invoke('stopStack'));
          document.getElementById('settings')?.addEventListener('click', () => window.adminDocsDesktop?.openRuntimeSettings());
        </script>
      </body>
    </html>
  `;
  await mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function openSystem() {
  if (!mainWindow) {
    return;
  }
  await mainWindow.webContents.session.clearCache();
  await mainWindow.loadURL(`${systemUrl("/")}?v=${Date.now()}`);
  mainWindow.show();
  mainWindow.focus();
}

async function showError(error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  const message = friendlyErrorMessage(detail);
  await showStatus("error", message);
  await dialog.showMessageBox({
    type: "error",
    title: "启动失败",
    message,
    detail: detail === message ? undefined : detail,
  });
}

function friendlyErrorMessage(detail: string) {
  if (detail.includes("未检测到 Docker")) {
    return detail;
  }
  if (detail.includes("Cannot connect to the Docker daemon") || detail.includes("docker daemon is not running")) {
    return "本地服务启动失败，请确认 Docker Desktop 已启动后重试。";
  }
  if (detail.includes("port is already allocated") || detail.includes("Bind for 0.0.0.0:8080 failed")) {
    return "端口 8080 已被占用，请关闭占用该端口的程序，或修改系统端口。";
  }
  if (detail.includes("系统启动超时") || detail.includes("系统重启超时")) {
    return detail;
  }
  if (detail.includes("Docker 命令执行失败")) {
    return "本地服务启动失败，请确认 Docker Desktop 已启动后重试。";
  }
  return detail;
}

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    loadRuntimeConfig();
    registerDesktopFilePicker();
    createWindow();
    createTray();
    void connectToConfiguredServer().catch(showError);
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      // Keep the app alive in the tray unless the user explicitly exits.
    }
  });
}

