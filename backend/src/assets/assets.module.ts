import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AuthorizationModule } from "../authorization/authorization.module";
import { UsersModule } from "../users/users.module";
import { AssetsController } from "./assets.controller";
import { AssetsService } from "./assets.service";

@Module({
  imports: [AuthModule, AuthorizationModule, UsersModule],
  controllers: [AssetsController],
  providers: [AssetsService, JwtAuthGuard],
  exports: [AssetsService],
})
export class AssetsModule {}
