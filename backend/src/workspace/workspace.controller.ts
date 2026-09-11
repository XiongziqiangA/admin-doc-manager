import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PublicUser } from "../users/user.presenter";
import { GlobalSearchDto } from "./dto/global-search.dto";
import { WorkspaceService } from "./workspace.service";

@ApiTags("workspace")
@ApiBearerAuth()
@Controller("workspace")
@UseGuards(JwtAuthGuard)
export class WorkspaceController {
  constructor(private readonly workspace: WorkspaceService) {}

  @Get("overview")
  overview(@CurrentUser() user: PublicUser) {
    return this.workspace.overview(user);
  }

  @Get("search")
  search(@Query() query: GlobalSearchDto, @CurrentUser() user: PublicUser) {
    return this.workspace.search(user, query);
  }
}
