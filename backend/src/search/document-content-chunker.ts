import { createHash } from "node:crypto";

export interface DocumentContentChunk {
  chunkIndex: number;
  sourceRef: string;
  content: string;
  contentDigest: string;
}

interface ChunkOptions {
  maxCharacters?: number;
  overlapCharacters?: number;
}

export function splitDocumentContent(
  value: string,
  options: ChunkOptions = {},
): DocumentContentChunk[] {
  if (!value.trim()) return [];

  const maxCharacters = Math.max(100, Math.floor(options.maxCharacters ?? 1_600));
  const overlapCharacters = Math.max(
    0,
    Math.min(Math.floor(options.overlapCharacters ?? 200), maxCharacters - 1),
  );
  const chunks: DocumentContentChunk[] = [];
  let start = 0;

  while (start < value.length) {
    const targetEnd = Math.min(start + maxCharacters, value.length);
    let end = targetEnd;
    if (targetEnd < value.length) {
      const paragraphEnd = value.lastIndexOf("\n", targetEnd);
      if (paragraphEnd > start + Math.floor(maxCharacters * 0.6)) {
        end = paragraphEnd;
      }
    }
    if (end <= start) end = targetEnd;

    const content = value.slice(start, end);
    if (content.trim()) {
      chunks.push({
        chunkIndex: chunks.length,
        sourceRef: `chars:${start}-${end}`,
        content,
        contentDigest: createHash("sha256").update(content).digest("hex"),
      });
    }
    if (end >= value.length) break;
    start = Math.max(start + 1, end - overlapCharacters);
  }

  return chunks;
}
