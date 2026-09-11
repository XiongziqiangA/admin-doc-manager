import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { validateCustomFields } from "./asset-field-schema";

const schema = [
  { key: "cpu", name: "处理器", type: "text" as const, required: true },
  { key: "memory", name: "内存", type: "number" as const },
  { key: "level", name: "安全等级", type: "select" as const, options: ["普通", "关键"] },
];

describe("validateCustomFields", () => {
  it("accepts values matching the asset type schema", () => {
    expect(validateCustomFields(schema, { cpu: "i7", memory: 32, level: "关键" })).toEqual({
      cpu: "i7",
      memory: 32,
      level: "关键",
    });
  });

  it("rejects missing required fields", () => {
    expect(() => validateCustomFields(schema, { memory: 16 })).toThrow(BadRequestException);
  });

  it("rejects unknown or invalid fields", () => {
    expect(() => validateCustomFields(schema, { cpu: "i5", unknown: true })).toThrow(
      BadRequestException,
    );
    expect(() => validateCustomFields(schema, { cpu: "i5", level: "机密" })).toThrow(
      BadRequestException,
    );
  });
});
