import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { UserStatus } from "@prisma/client";

import { UsersService } from "../../users/users.service";
import { AuthenticatedRequest } from "../authenticated-request";
import { JwtPayload } from "../auth.service";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractToken(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException("未登录");
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      const user = await this.usersService.findByUsername(payload.username);
      if (!user || user.id !== payload.sub || user.status !== UserStatus.ACTIVE) {
        throw new UnauthorizedException("登录状态无效");
      }

      request.user = {
        id: user.id,
        username: user.username,
        realName: user.realName,
        role: user.role,
        status: user.status,
        organizationId: user.organizationId,
        departmentId: user.departmentId,
        phone: user.phone,
        email: user.email,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException("登录状态无效");
    }
  }

  private extractToken(authorization?: string): string | undefined {
    const [type, token] = authorization?.split(" ") ?? [];
    return type === "Bearer" ? token : undefined;
  }
}
