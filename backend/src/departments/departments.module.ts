import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { UsersModule } from "../users/users.module";
import { DepartmentsController } from "./departments.controller";
import { DepartmentsService } from "./departments.service";

@Module({
  imports: [AuthModule, UsersModule],
  controllers: [DepartmentsController],
  providers: [DepartmentsService, JwtAuthGuard, RolesGuard],
})
export class DepartmentsModule {}
