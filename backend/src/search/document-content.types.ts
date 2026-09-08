export const CONTENT_INDEX_STATUS = {
  INDEXING: "INDEXING",
  READY: "READY",
  UNSUPPORTED: "UNSUPPORTED",
  FAILED: "FAILED",
} as const;

export type ContentIndexStatus = (typeof CONTENT_INDEX_STATUS)[keyof typeof CONTENT_INDEX_STATUS];

export interface ExtractedDocumentContent {
  extractedText: string;
  textLength: number;
  parser: string;
  status: ContentIndexStatus;
  errorMessage?: string;
}
