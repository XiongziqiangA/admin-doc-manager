import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { UsersModule } from "../users/users.module";
import { BusinessMattersController } from "./business-matters.controller";
import { BusinessMattersService } from "./business-matters.service";

@Module({
  imports: [AuthModule, UsersModule],
  controllers: [BusinessMattersController],
  providers: [BusinessMattersService, JwtAuthGuard, RolesGuard],
  exports: [BusinessMattersService],
})
export class BusinessMattersModule {}
