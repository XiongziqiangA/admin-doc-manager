import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";

interface ErrorBody {
  success: false;
  code: string;
  message: string;
  details: unknown;
  requestId: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<{
      status: (code: number) => { json: (body: ErrorBody) => void };
    }>();
    const request = ctx.getRequest<{ requestId?: string }>();
    const requestId = request.requestId ?? randomUUID();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : undefined;

    const body = this.buildErrorBody(exceptionResponse, requestId, status);
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        exception instanceof Error ? exception.stack : JSON.stringify(exception),
      );
    }
    response.status(status).json(body);
  }

  private buildErrorBody(
    exceptionResponse: string | object | undefined,
    requestId: string,
    status: number,
  ): ErrorBody {
    if (typeof exceptionResponse === "object" && exceptionResponse !== null) {
      const response = exceptionResponse as {
        error?: string;
        message?: string | string[];
      };
      return {
        success: false,
        code: this.toErrorCode(response.error ?? status),
        message: Array.isArray(response.message)
          ? "参数错误"
          : response.message ?? "请求失败",
        details: Array.isArray(response.message) ? response.message : {},
        requestId,
      };
    }

    return {
      success: false,
      code: this.toErrorCode(status),
      message: typeof exceptionResponse === "string" ? exceptionResponse : "服务异常",
      details: {},
      requestId,
    };
  }

  private toErrorCode(value: string | number): string {
    if (typeof value === "number") {
      return `HTTP_${value}`;
    }
    return value.replaceAll(" ", "_").toUpperCase();
  }
}
