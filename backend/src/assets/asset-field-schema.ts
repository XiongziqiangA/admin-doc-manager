import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

export type AssetFieldDefinition = {
  key: string;
  name: string;
  type: "text" | "number" | "date" | "select" | "boolean";
  required?: boolean;
  options?: string[];
};

export function parseFieldSchema(value: Prisma.JsonValue): AssetFieldDefinition[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value as AssetFieldDefinition[];
}

export function validateCustomFields(
  schema: AssetFieldDefinition[],
  value: Record<string, unknown>,
): Record<string, unknown> {
  const allowed = new Set(schema.map((field) => field.key));
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new BadRequestException(`资产自定义字段不存在：${key}`);
    }
  }

  for (const field of schema) {
    const current = value[field.key];
    if (field.required && (current === undefined || current === null || current === "")) {
      throw new BadRequestException(`资产字段“${field.name}”不能为空`);
    }
    if (current === undefined || current === null || current === "") {
      continue;
    }
    const valid =
      (field.type === "text" && typeof current === "string") ||
      (field.type === "number" && typeof current === "number" && Number.isFinite(current)) ||
      (field.type === "boolean" && typeof current === "boolean") ||
      (field.type === "date" && typeof current === "string" && !Number.isNaN(Date.parse(current))) ||
      (field.type === "select" &&
        typeof current === "string" &&
        Boolean(field.options?.includes(current)));
    if (!valid) {
      throw new BadRequestException(`资产字段“${field.name}”格式不正确`);
    }
  }

  return value;
}
