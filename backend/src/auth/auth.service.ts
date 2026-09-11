import { Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { UserStatus } from "@prisma/client";

import { UsersService } from "../users/users.service";
import { PublicUser, toPublicUser } from "../users/user.presenter";
import { LoginDto } from "./dto/login.dto";
import { PasswordService } from "./password.service";

export interface JwtPayload {
  sub: string;
  username: string;
  role: string;
  organizationId?: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.findUserForLogin(dto.username);
    if (!user) {
      throw new UnauthorizedException("账号或密码错误");
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException("账号已停用");
    }

    const passwordValid = await this.passwordService.verifyPassword(
      dto.password,
      user.passwordHash,
    );
    if (!passwordValid) {
      throw new UnauthorizedException("账号或密码错误");
    }

    const publicUser = toPublicUser(user);
    return {
      accessToken: await this.signToken(publicUser),
      user: publicUser,
    };
  }

  private async signToken(user: PublicUser): Promise<string> {
    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      organizationId: user.organizationId,
    };

    return this.jwtService.signAsync(payload);
  }

  private async findUserForLogin(username: string) {
    try {
      return await this.usersService.findByUsername(username);
    } catch (error) {
      if (this.isDatabaseUnavailable(error)) {
        throw new ServiceUnavailableException("数据库连接失败，请先启动 PostgreSQL 并初始化管理员账号");
      }
      throw error;
    }
  }

  private isDatabaseUnavailable(error: unknown): boolean {
    return (
      error instanceof Error &&
      (error.name === "PrismaClientInitializationError" ||
        error.message.includes("Can't reach database server") ||
        error.message.includes("ECONNREFUSED") ||
        error.message.includes("ENOTFOUND"))
    );
  }
}
