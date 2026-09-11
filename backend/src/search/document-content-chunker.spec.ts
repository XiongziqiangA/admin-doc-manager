import { describe, expect, it } from "vitest";

import { splitDocumentContent } from "./document-content-chunker";

describe("splitDocumentContent", () => {
  it("keeps short content in one traceable chunk", () => {
    expect(splitDocumentContent("第一行\n第二行", { maxCharacters: 100, overlapCharacters: 10 })).toEqual([
      {
        chunkIndex: 0,
        sourceRef: "chars:0-7",
        content: "第一行\n第二行",
        contentDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    ]);
  });

  it("splits long content with overlap without losing the tail", () => {
    const content = "甲".repeat(80) + "\n" + "乙".repeat(80) + "\n" + "丙".repeat(80);
    const chunks = splitDocumentContent(content, { maxCharacters: 100, overlapCharacters: 20 });

    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.map((chunk) => chunk.chunkIndex)).toEqual(chunks.map((_, index) => index));
    expect(chunks.at(-1)?.content).toContain("丙".repeat(20));
    expect(chunks[1].sourceRef).toMatch(/^chars:\d+-\d+$/);
  });

  it("returns no chunks for blank content", () => {
    expect(splitDocumentContent(" \n ")).toEqual([]);
  });
});
