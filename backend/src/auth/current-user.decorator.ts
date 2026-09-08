import { createParamDecorator, ExecutionContext } from "@nestjs/common";

import { AuthenticatedRequest } from "./authenticated-request";

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  return request.user;
});
