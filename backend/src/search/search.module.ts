import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { StorageService } from "../documents/storage.service";
import { UsersModule } from "../users/users.module";
import { DocumentContentIndexService } from "./document-content.service";
import { DocumentContentParserService } from "./document-content.parser";
import { EmbeddingService } from "./embedding.service";
import { SearchController } from "./search.controller";
import { SearchAssistantService } from "./search-assistant.service";

@Module({
  imports: [AuthModule, UsersModule],
  controllers: [SearchController],
  providers: [
    StorageService,
    DocumentContentParserService,
    EmbeddingService,
    DocumentContentIndexService,
    SearchAssistantService,
  ],
  exports: [DocumentContentIndexService],
})
export class SearchModule {}
