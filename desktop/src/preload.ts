import { contextBridge, ipcRenderer, webUtils } from "electron";

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

const droppedFileCallbacks = new Set<(payload: DesktopDroppedFiles) => void>();

function hasFileTransfer(event: Pick<DragEvent, "dataTransfer">) {
  const items = Array.from(event.dataTransfer?.items ?? []);
  if (items.some((item) => item.kind === "file")) {
    return true;
  }
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

function logDragEvent(event: string, details: Record<string, unknown> = {}) {
  ipcRenderer.send("admin-docs:desktop-debug", {
    event,
    ...details,
  });
}

function notifyDroppedFiles(payload: DesktopDroppedFiles) {
  for (const callback of droppedFileCallbacks) {
    callback(payload);
  }
}

window.addEventListener(
  "dragover",
  (event) => {
    if (!hasFileTransfer(event)) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
    logDragEvent("dragover", {
      itemCount: event.dataTransfer?.items.length ?? 0,
      fileCount: event.dataTransfer?.files.length ?? 0,
      types: Array.from(event.dataTransfer?.types ?? []),
    });
  },
  true,
);

window.addEventListener(
  "drop",
  (event) => {
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (!files.length) {
      logDragEvent("drop-empty", {
        itemCount: event.dataTransfer?.items.length ?? 0,
        types: Array.from(event.dataTransfer?.types ?? []),
      });
      return;
    }
    event.preventDefault();
    const filePaths = files.map((file) => webUtils.getPathForFile(file)).filter(Boolean);
    logDragEvent("drop", {
      fileCount: files.length,
      resolvedPathCount: filePaths.length,
      fileNames: files.map((file) => file.name),
    });
    void ipcRenderer
      .invoke("admin-docs:register-dropped-files-direct", filePaths)
      .then((payload: DesktopDroppedFiles) => {
        logDragEvent("drop-notify-renderer", {
          acceptedCount: payload.files.length,
          rejectedCount: payload.rejectedCount,
        });
        notifyDroppedFiles(payload);
      })
      .catch((error: Error) => {
        logDragEvent("drop-register-error", {
          message: error.message,
        });
      });
  },
  true,
);

contextBridge.exposeInMainWorld("adminDocsDesktop", {
  pickFiles: () => ipcRenderer.invoke("admin-docs:pick-files"),
  uploadDocument: (payload: unknown) => ipcRenderer.invoke("admin-docs:upload-document", payload),
  uploadDocumentVersion: (payload: unknown) => ipcRenderer.invoke("admin-docs:upload-document-version", payload),
  openDocumentFile: (payload: unknown) => ipcRenderer.invoke("admin-docs:open-document-file", payload),
  printDocumentFile: (payload: unknown) => ipcRenderer.invoke("admin-docs:print-document-file", payload),
  getSavedLogin: () => ipcRenderer.invoke("admin-docs:get-saved-login"),
  saveLogin: (payload: unknown) => ipcRenderer.invoke("admin-docs:save-login", payload),
  clearSavedLogin: () => ipcRenderer.invoke("admin-docs:clear-saved-login"),
  getRuntimeConfig: () => ipcRenderer.invoke("admin-docs:get-runtime-config"),
  saveRuntimeConfig: (payload: unknown) => ipcRenderer.invoke("admin-docs:save-runtime-config", payload),
  openRuntimeSettings: () => ipcRenderer.invoke("admin-docs:open-runtime-settings"),
  openSystem: () => ipcRenderer.invoke("admin-docs:open-system"),
  debug: (event: string, details?: Record<string, unknown>) => logDragEvent(event, details),
  onDroppedFiles: (callback: (payload: DesktopDroppedFiles) => void) => {
    droppedFileCallbacks.add(callback);
    return () => droppedFileCallbacks.delete(callback);
  },
});
