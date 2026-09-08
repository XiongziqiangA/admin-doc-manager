import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";

import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { DocumentContentIndexService } from "./document-content.service";
import { SearchAssistantDto } from "./search-assistant.dto";
import { SearchAssistantService } from "./search-assistant.service";

@ApiTags("search")
@ApiBearerAuth()
@Controller("search")
@UseGuards(JwtAuthGuard, RolesGuard)
export class SearchController {
  constructor(
    private readonly contentIndexService: DocumentContentIndexService,
    private readonly assistantService: SearchAssistantService,
  ) {}

  @Post("index/rebuild")
  @Roles(UserRole.ADMIN)
  rebuildIndex() {
    return this.contentIndexService.rebuildAll();
  }

  @Post("assistant")
  assistant(@Body() dto: SearchAssistantDto) {
    return this.assistantService.search(dto.query, dto.limit);
  }
}
