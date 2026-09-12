import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import mammoth = require("mammoth");
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import ExcelJS from "exceljs";
import unzipper = require("unzipper");

import { CONTENT_INDEX_STATUS, ExtractedDocumentContent } from "./document-content.types";

const TEXT_EXTENSIONS = new Set([".txt", ".md", ".log", ".csv", ".tsv", ".json", ".xml"]);
const WORD_EXTENSIONS = new Set([".docx", ".docm", ".dotx", ".dotm"]);
const SHEET_EXTENSIONS = new Set([".xlsx", ".xlsm", ".xltx", ".xltm"]);
const PRESENTATION_EXTENSIONS = new Set([".pptx", ".pptm", ".ppsx", ".ppsm", ".potx", ".potm"]);
const nodeRequire = createRequire(__filename);

@Injectable()
export class DocumentContentParserService {
  private readonly maxCharacters: number;
  private pdfParser: typeof import("pdf-parse") | null | undefined;

  constructor(configService: ConfigService) {
    const configuredLimit = Number(configService.get("CONTENT_INDEX_MAX_CHARS", 500_000));
    this.maxCharacters = Number.isFinite(configuredLimit) && configuredLimit > 0
      ? Math.floor(configuredLimit)
      : 500_000;
  }

  async extract(filePath: string, fileExt: string): Promise<ExtractedDocumentContent> {
    const extension = fileExt.startsWith(".") ? fileExt.toLowerCase() : `.${fileExt.toLowerCase()}`;
    if (TEXT_EXTENSIONS.has(extension)) {
      return this.ready("text", await readFile(filePath));
    }
    if (extension === ".pdf") {
      return this.extractPdf(filePath);
    }
    if (WORD_EXTENSIONS.has(extension)) {
      const result = await mammoth.extractRawText({ path: filePath });
      return this.ready("mammoth", result.value);
    }
    if (SHEET_EXTENSIONS.has(extension)) {
      return this.extractSpreadsheet(filePath);
    }
    if (PRESENTATION_EXTENSIONS.has(extension)) {
      return this.extractPresentation(filePath);
    }
    return {
      extractedText: "",
      textLength: 0,
      parser: "none",
      status: CONTENT_INDEX_STATUS.UNSUPPORTED,
    };
  }

  private async extractPdf(filePath: string) {
    const data = await readFile(filePath);
    const pdfParser = this.loadPdfParser();
    if (!pdfParser) {
      return this.extractPdfWithPdfJs(data);
    }

    try {
      const { PDFParse } = pdfParser;
      const parser = new PDFParse({ data });
      try {
        const result = await parser.getText();
        return this.ready("pdf-parse", result.text);
      } finally {
        await parser.destroy();
      }
    } catch (error) {
      if (!this.isPdfRuntimeLoadError(error)) {
        throw error;
      }
      return this.extractPdfWithPdfJs(data);
    }
  }

  private loadPdfParser() {
    if (this.pdfParser !== undefined) {
      return this.pdfParser;
    }
    try {
      this.pdfParser = nodeRequire("pdf-parse") as typeof import("pdf-parse");
    } catch {
      this.pdfParser = null;
    }
    return this.pdfParser;
  }

  private async extractPdfWithPdfJs(data: Buffer) {
    installPdfJsGlobals();
    const entryPath = nodeRequire.resolve("pdfjs-dist/legacy/build/pdf.mjs");
    const pdfjs = await nativeImport(pathToFileURL(entryPath).href);
    const document = await pdfjs.getDocument({ data: new Uint8Array(data), disableWorker: true }).promise;
    try {
      const pages: string[] = [];
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        const content = await page.getTextContent();
        pages.push(
          (content.items as Array<{ str?: string }>)
            .map((item) => item.str ?? "")
            .join(" "),
        );
      }
      return this.ready("pdfjs", pages.join("\n\n"));
    } finally {
      await document.destroy();
    }
  }

  private isPdfRuntimeLoadError(error: unknown) {
    if (!(error instanceof Error)) {
      return false;
    }
    return /Cannot find module|Cannot find package|DOMMatrix|native binding|@napi-rs\/canvas/i.test(error.message);
  }

  private async extractSpreadsheet(filePath: string) {
    const workbook = new ExcelJS.Workbook();
    const data = await readFile(filePath);
    await workbook.xlsx.load(data as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const sheets = workbook.worksheets.map((worksheet) => {
      const rows: string[] = [];
      worksheet.eachRow({ includeEmpty: false }, (row) => {
        const values = (row.values as unknown[]).slice(1).map(formatSpreadsheetValue);
        rows.push(values.join(","));
      });
      return `${worksheet.name}\n${rows.join("\n")}`;
    });
    return this.ready("exceljs", sheets.join("\n\n"));
  }

  private async extractPresentation(filePath: string) {
    const archive = await unzipper.Open.file(filePath);
    const slideFiles = archive.files
      .filter((file) => /^ppt\/slides\/slide\d+\.xml$/i.test(file.path))
      .sort((left, right) => left.path.localeCompare(right.path, undefined, { numeric: true }));
    const text = (await Promise.all(slideFiles.map(async (file) => {
      const xml = (await file.buffer()).toString("utf8");
      return stripXmlText(xml);
    }))).join("\n\n");
    return this.ready("pptx", text);
  }

  private ready(parser: string, value: string | Buffer) {
    const normalized = normalizeText(typeof value === "string" ? value : decodeText(value));
    const truncated = normalized.slice(0, this.maxCharacters);
    return {
      extractedText: truncated,
      textLength: truncated.length,
      parser,
      status: CONTENT_INDEX_STATUS.READY,
    } satisfies ExtractedDocumentContent;
  }
}

function decodeText(buffer: Buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.toString("utf16le");
  }
  return buffer.toString("utf8");
}

function formatSpreadsheetValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if ("result" in record) {
      return formatSpreadsheetValue(record.result);
    }
    if (typeof record.text === "string") {
      return record.text;
    }
    if (Array.isArray(record.richText)) {
      return record.richText
        .map((part) => (part && typeof part === "object" && "text" in part ? String(part.text ?? "") : ""))
        .join("");
    }
    return JSON.stringify(value);
  }
  return String(value);
}

function normalizeText(value: string) {
  return value
    .replace(/^\uFEFF/, "")
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function stripXmlText(xml: string) {
  return decodeXmlEntities(xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function installPdfJsGlobals() {
  const globals = globalThis as Record<string, unknown>;
  globals.DOMMatrix ??= class DOMMatrix {};
  globals.ImageData ??= class ImageData {};
  globals.Path2D ??= class Path2D {};
}

interface PdfJsModule {
  getDocument(options: { data: Uint8Array; disableWorker: boolean }): { promise: Promise<PdfJsDocument> };
}

interface PdfJsDocument {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfJsPage>;
  destroy(): Promise<void>;
}

interface PdfJsPage {
  getTextContent(): Promise<{ items: Array<{ str?: string }> }>;
}

const nativeImport = new Function("modulePath", "return import(modulePath)") as (
  modulePath: string,
) => Promise<PdfJsModule>;
