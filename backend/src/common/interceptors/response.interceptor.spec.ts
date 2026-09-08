import { ExecutionContext, StreamableFile } from "@nestjs/common";
import { Readable } from "node:stream";
import { of, lastValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import { ResponseInterceptor } from "./response.interceptor";

function context(): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ requestId: "request-1" }),
    }),
  } as unknown as ExecutionContext;
}

describe("ResponseInterceptor", () => {
  it("wraps ordinary api data", async () => {
    const interceptor = new ResponseInterceptor();
    const result = await lastValueFrom(
      interceptor.intercept(context(), { handle: () => of({ ok: true }) }),
    );

    expect(result).toEqual({
      success: true,
      data: { ok: true },
      message: "\u64cd\u4f5c\u6210\u529f",
      requestId: "request-1",
    });
  });

  it("does not wrap file streams", async () => {
    const interceptor = new ResponseInterceptor();
    const file = new StreamableFile(Readable.from(["%PDF-1.4"]));
    const result = await lastValueFrom(
      interceptor.intercept(context(), { handle: () => of(file) }),
    );

    expect(result).toBe(file);
  });
});
