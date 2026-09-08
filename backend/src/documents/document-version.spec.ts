import { describe, expect, it } from "vitest";

import { nextVersionNumber } from "./document-version";

describe("nextVersionNumber", () => {
  it("starts at V1.0 and increments major versions", () => {
    expect(nextVersionNumber(0)).toBe("V1.0");
    expect(nextVersionNumber(1)).toBe("V2.0");
    expect(nextVersionNumber(2)).toBe("V3.0");
  });
});
