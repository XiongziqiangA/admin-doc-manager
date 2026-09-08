import { describe, expect, it } from "vitest";

import { PARTNER_STATUS_LABELS, PARTNER_TYPE_LABELS } from "./partner-options";

describe("partner options", () => {
  it("keeps the confirmed first-version partner types", () => {
    expect(Object.values(PARTNER_TYPE_LABELS)).toEqual([
      "客户",
      "供应商",
      "合作伙伴",
      "其他",
    ]);
  });

  it("keeps only active and disabled partner statuses", () => {
    expect(Object.values(PARTNER_STATUS_LABELS)).toEqual(["正常", "停用"]);
  });
});
