import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Observable, map } from "rxjs";

interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  message: string;
  requestId: string;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiSuccessResponse<T> | T> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiSuccessResponse<T> | T> {
    const request = context.switchToHttp().getRequest<{ requestId?: string }>();
    const requestId = request.requestId ?? randomUUID();

    return next.handle().pipe(
      map((data: T) => {
        if (data instanceof StreamableFile) {
          return data;
        }

        return {
          success: true,
          data,
          message: "操作成功",
          requestId,
        };
      }),
    );
  }
}
