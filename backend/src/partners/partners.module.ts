import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { UsersModule } from "../users/users.module";
import { PartnersController } from "./partners.controller";
import { PartnersService } from "./partners.service";

@Module({
  imports: [AuthModule, UsersModule],
  controllers: [PartnersController],
  providers: [PartnersService, JwtAuthGuard, RolesGuard],
})
export class PartnersModule {}
