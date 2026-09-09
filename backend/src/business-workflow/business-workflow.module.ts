import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { BusinessMattersModule } from "../business-matters/business-matters.module";
import { PrismaModule } from "../prisma/prisma.module";
import { UsersModule } from "../users/users.module";
import { BusinessWorkflowController } from "./business-workflow.controller";
import { BusinessWorkflowService } from "./business-workflow.service";

@Module({
  imports: [AuthModule, BusinessMattersModule, PrismaModule, UsersModule],
  controllers: [BusinessWorkflowController],
  providers: [BusinessWorkflowService],
  exports: [BusinessWorkflowService],
})
export class BusinessWorkflowModule {}
