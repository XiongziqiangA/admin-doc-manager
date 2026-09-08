import { ConfigService } from "@nestjs/config";
import { JwtModuleOptions } from "@nestjs/jwt";

export function buildJwtOptions(configService: ConfigService): JwtModuleOptions {
  return {
    secret: configService.getOrThrow<string>("JWT_SECRET"),
    signOptions: {
      expiresIn: configService.get<string>(
        "JWT_EXPIRES_IN",
        "8h",
      ),
    } as JwtModuleOptions["signOptions"],
  };
}
