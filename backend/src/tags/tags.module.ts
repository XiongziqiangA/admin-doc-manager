import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { UsersModule } from "../users/users.module";
import { TagsController } from "./tags.controller";
import { TagsService } from "./tags.service";

@Module({
  imports: [AuthModule, UsersModule],
  controllers: [TagsController],
  providers: [TagsService, JwtAuthGuard, RolesGuard],
})
export class TagsModule {}
