import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";

import { PrismaService } from "../prisma/prisma.service";
import { PublicUser } from "../users/user.presenter";

type IdempotentOperation<T> = (tx: Prisma.TransactionClient) => Promise<T>;

@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  digest(payload: unknown) {
    return createHash("sha256").update(stableSerialize(payload)).digest("hex");
  }

  async execute<T>(
    user: PublicUser,
    operation: string,
    key: string | undefined,
    payload: unknown,
    handler: IdempotentOperation<T>,
    responseStatus = 201,
  ): Promise<T> {
    const organizationId = user.organizationId;
    const normalizedKey = key?.trim() ?? "";
    if (!organizationId) throw new BadRequestException("当前账号尚未绑定企业");
    if (normalizedKey.length < 8 || normalizedKey.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(normalizedKey)) {
      throw new BadRequestException("Idempotency-Key 必须为 8 至 128 位字母、数字或 . _ : -");
    }

    const requestDigest = this.digest(payload);
    const unique = {
      organizationId,
      userId: user.id,
      operation,
      key: normalizedKey,
    };

    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.idempotencyRecord.findUnique({
          where: { organizationId_userId_operation_key: unique },
        });
        if (existing) return this.replay<T>(existing.requestDigest, requestDigest, existing.responseBody);

        const record = await tx.idempotencyRecord.create({
          data: { ...unique, requestDigest },
          select: { id: true },
        });
        const response = await handler(tx);
        await tx.idempotencyRecord.update({
          where: { id: record.id },
          data: {
            responseBody: toJson(response),
            responseStatus,
          },
        });
        return response;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      const existing = await this.prisma.idempotencyRecord.findUnique({
        where: { organizationId_userId_operation_key: unique },
      });
      if (!existing) throw error;
      return this.replay<T>(existing.requestDigest, requestDigest, existing.responseBody);
    }
  }

  private replay<T>(storedDigest: string, requestDigest: string, responseBody: Prisma.JsonValue | null): T {
    if (storedDigest !== requestDigest) {
      throw new ConflictException("该 Idempotency-Key 已用于不同请求");
    }
    if (responseBody === null) {
      throw new ConflictException("相同请求正在处理中，请稍后重试");
    }
    return responseBody as T;
  }
}

function stableSerialize(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}
