import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AuthorizationModule } from "../authorization/authorization.module";
import { ApprovalsController } from "./approvals.controller";
import { ApprovalsService } from "./approvals.service";

@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [ApprovalsController],
  providers: [ApprovalsService, JwtAuthGuard],
  exports: [ApprovalsService],
})
export class ApprovalsModule {}
