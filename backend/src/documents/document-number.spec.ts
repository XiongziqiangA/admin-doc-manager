import { describe, expect, it } from "vitest";

import { buildDocumentNumber, parseDocumentNumberSequence } from "./document-number";

describe("buildDocumentNumber", () => {
  it("uses category prefix, date, and three-digit daily sequence", () => {
    expect(buildDocumentNumber("HT", new Date("2026-07-27T10:00:00.000Z"), 1)).toBe(
      "HT-20260727-001",
    );
  });

  it("extracts the daily sequence from an existing document number", () => {
    expect(parseDocumentNumberSequence("HT-20260727-019")).toBe(19);
    expect(parseDocumentNumberSequence("invalid")).toBeNull();
  });
});
