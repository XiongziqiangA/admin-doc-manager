import { describe, expect, it } from "vitest";

import { normalizeTagName } from "./tag-name";

describe("normalizeTagName", () => {
  it("trims and collapses whitespace for tag de-duplication", () => {
    expect(normalizeTagName("  重要   合同  ")).toBe("重要 合同");
  });
});
