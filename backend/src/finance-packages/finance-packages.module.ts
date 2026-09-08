import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { DocumentsModule } from "../documents/documents.module";
import { SearchModule } from "../search/search.module";
import { UsersModule } from "../users/users.module";
import { FinanceAnalysisService } from "./finance-analysis.service";
import { FinanceAiSettingsService } from "./finance-ai-settings.service";
import { FinancePackagesController } from "./finance-packages.controller";
import { FinancePackagesService } from "./finance-packages.service";
import { OpenAiCompatibleService } from "./openai-compatible.service";

@Module({
  imports: [AuthModule, UsersModule, DocumentsModule, SearchModule],
  controllers: [FinancePackagesController],
  providers: [FinancePackagesService, FinanceAnalysisService, FinanceAiSettingsService, OpenAiCompatibleService, JwtAuthGuard, RolesGuard],
})
export class FinancePackagesModule {}
