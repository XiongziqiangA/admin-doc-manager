import { describe, expect, it } from "vitest";

import { SYSTEM_CATEGORIES } from "./system-categories";

describe("SYSTEM_CATEGORIES", () => {
  it("matches the confirmed fixed first-level category set", () => {
    expect(SYSTEM_CATEGORIES.map((category) => category.name)).toEqual([
      "\u884c\u653f\u5236\u5ea6",
      "\u5408\u540c\u6587\u4ef6",
      "\u8d44\u8d28\u8bc1\u7167",
      "\u4eba\u4e8b\u8d44\u6599",
      "\u8d22\u52a1\u7968\u636e",
      "\u5ba2\u6237\u8d44\u6599",
      "\u4f9b\u5e94\u5546\u8d44\u6599",
      "\u8d44\u4ea7\u8bbe\u5907",
      "\u529e\u516c\u573a\u5730",
      "\u5176\u4ed6\u8d44\u6599",
    ]);
  });

  it("uses unique document number prefixes", () => {
    const codes = SYSTEM_CATEGORIES.map((category) => category.code);

    expect(new Set(codes).size).toBe(codes.length);
  });
});
