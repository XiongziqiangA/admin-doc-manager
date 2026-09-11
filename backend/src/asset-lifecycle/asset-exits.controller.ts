import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PublicUser } from "../users/user.presenter";
import { AssetExitsService } from "./asset-exits.service";
import { CancelAssetExitDto } from "./dto/cancel-asset-exit.dto";
import { CreateAssetExitDto } from "./dto/create-asset-exit.dto";
import { ListAssetExitsDto } from "./dto/list-asset-exits.dto";

@ApiTags("asset-lifecycle")
@ApiBearerAuth()
@Controller("asset-exits")
@UseGuards(JwtAuthGuard)
export class AssetExitsController {
  constructor(private readonly exits: AssetExitsService) {}

  @Get()
  list(@Query() query: ListAssetExitsDto, @CurrentUser() user: PublicUser) {
    return this.exits.list(user, query);
  }

  @Post()
  create(@Body() dto: CreateAssetExitDto, @CurrentUser() user: PublicUser) {
    return this.exits.create(user, dto);
  }

  @Patch(":id/cancel")
  cancel(
    @Param("id") id: string,
    @Body() dto: CancelAssetExitDto,
    @CurrentUser() user: PublicUser,
  ) {
    return this.exits.cancel(user, id, dto);
  }
}
