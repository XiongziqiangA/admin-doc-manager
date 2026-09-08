import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { SearchModule } from "../search/search.module";
import { UsersModule } from "../users/users.module";
import { DocumentLogsController } from "./document-logs.controller";
import { DocumentsController } from "./documents.controller";
import { DocumentsService } from "./documents.service";
import { StorageService } from "./storage.service";

@Module({
  imports: [AuthModule, UsersModule, SearchModule],
  controllers: [DocumentsController, DocumentLogsController],
  providers: [DocumentsService, JwtAuthGuard, RolesGuard, StorageService],
  exports: [StorageService],
})
export class DocumentsModule {}
