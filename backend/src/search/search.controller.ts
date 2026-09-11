import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";

import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { PermissionsGuard } from "../authorization/permissions.guard";
import { PERMISSIONS } from "../authorization/permissions";
import { RequirePermissions } from "../authorization/permissions.decorator";
import { PublicUser } from "../users/user.presenter";
import { DocumentContentIndexService } from "./document-content.service";
import { SearchAssistantDto } from "./search-assistant.dto";
import { SearchAssistantService } from "./search-assistant.service";

@ApiTags("search")
@ApiBearerAuth()
@Controller("search")
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
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
  @RequirePermissions(PERMISSIONS.AI_USE)
  assistant(@Body() dto: SearchAssistantDto, @CurrentUser() user: PublicUser) {
    return this.assistantService.search(user, dto.query, dto.limit);
  }
}
