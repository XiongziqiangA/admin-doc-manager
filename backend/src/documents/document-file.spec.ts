import { describe, expect, it } from "vitest";

import {
  isAllowedDocumentFile,
  isPreviewableFile,
  normalizeUploadedFileName,
} from "./document-file";

describe("document file rules", () => {
  it("allows common administrative office and finance file formats", () => {
    expect(isAllowedDocumentFile("\u5236\u5ea6.pdf")).toBe(true);
    expect(isAllowedDocumentFile("\u5408\u540c.docx")).toBe(true);
    expect(isAllowedDocumentFile("\u53f0\u8d26.xlsx")).toBe(true);
    expect(isAllowedDocumentFile("\u6f14\u793a\u6587\u7a3f.pptx")).toBe(true);
    expect(isAllowedDocumentFile("\u901a\u77e5.wps")).toBe(true);
    expect(isAllowedDocumentFile("\u62a5\u8868.et")).toBe(true);
    expect(isAllowedDocumentFile("\u7535\u5b50\u53d1\u7968.ofd")).toBe(true);
    expect(isAllowedDocumentFile("\u94f6\u884c\u6d41\u6c34.csv")).toBe(true);
    expect(isAllowedDocumentFile("\u7a0e\u52a1\u6570\u636e.xml")).toBe(true);
    expect(isAllowedDocumentFile("\u90ae\u4ef6\u5b58\u6863.eml")).toBe(true);
    expect(isAllowedDocumentFile("\u5e73\u9762\u56fe.dwg")).toBe(true);
    expect(isAllowedDocumentFile("\u6d41\u7a0b\u56fe.vsdx")).toBe(true);
    expect(isAllowedDocumentFile("\u601d\u7ef4\u5bfc\u56fe.xmind")).toBe(true);
    expect(isAllowedDocumentFile("\u8d22\u52a1\u5907\u4efd.accdb")).toBe(true);
    expect(isAllowedDocumentFile("\u94f6\u884c\u5bf9\u8d26.ofx")).toBe(true);
    expect(isAllowedDocumentFile("\u7535\u5b50\u8bc1\u4e66.pfx")).toBe(true);
    expect(isAllowedDocumentFile("\u8bbe\u8ba1\u7a3f.psd")).toBe(true);
    expect(isAllowedDocumentFile("\u573a\u5730\u6a21\u578b.skp")).toBe(true);
    expect(isAllowedDocumentFile("\u4f1a\u8bae\u5f55\u97f3.mp3")).toBe(true);
    expect(isAllowedDocumentFile("\u4f1a\u8bae\u5f55\u97f3.flac")).toBe(true);
    expect(isAllowedDocumentFile("\u57f9\u8bad\u89c6\u9891.mp4")).toBe(true);
    expect(isAllowedDocumentFile("\u57f9\u8bad\u89c6\u9891.mkv")).toBe(true);
    expect(isAllowedDocumentFile("\u626b\u63cf\u4ef6.png")).toBe(true);
    expect(isAllowedDocumentFile("\u5f52\u6863.zip")).toBe(true);
    expect(isAllowedDocumentFile("\u5907\u4efd.7z")).toBe(true);
  });

  it("rejects executable and script-like files", () => {
    expect(isAllowedDocumentFile("run.exe")).toBe(false);
    expect(isAllowedDocumentFile("script.sh")).toBe(false);
    expect(isAllowedDocumentFile("install.msi")).toBe(false);
    expect(isAllowedDocumentFile("macro.vbs")).toBe(false);
    expect(isAllowedDocumentFile("page.html")).toBe(false);
  });

  it("previews pdf, images, and plain-text administrative files", () => {
    expect(isPreviewableFile("\u5408\u540c.pdf")).toBe(true);
    expect(isPreviewableFile("\u7167\u7247.jpg")).toBe(true);
    expect(isPreviewableFile("\u8bf4\u660e.txt")).toBe(true);
    expect(isPreviewableFile("\u6570\u636e.csv")).toBe(true);
    expect(isPreviewableFile("\u914d\u7f6e.json")).toBe(true);
    expect(isPreviewableFile("\u53f0\u8d26.xlsx")).toBe(false);
    expect(isPreviewableFile("\u7535\u5b50\u53d1\u7968.ofd")).toBe(false);
  });

  it("normalizes mojibake filenames produced by multipart upload parsing", () => {
    expect(normalizeUploadedFileName("ä¸­ææµè¯æä»¶.pdf")).toBe(
      "\u4e2d\u6587\u6d4b\u8bd5\u6587\u4ef6.pdf",
    );
    expect(normalizeUploadedFileName("normal-file.pdf")).toBe("normal-file.pdf");
  });
});
