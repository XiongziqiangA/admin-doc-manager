import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { UsersModule } from "../users/users.module";
import { CategoriesController } from "./categories.controller";
import { CategoriesService } from "./categories.service";

@Module({
  imports: [AuthModule, UsersModule],
  controllers: [CategoriesController],
  providers: [CategoriesService, JwtAuthGuard, RolesGuard],
})
export class CategoriesModule {}
