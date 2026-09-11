import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PublicUser } from "../users/user.presenter";
import { AssetMaintenanceService } from "./asset-maintenance.service";
import { CancelAssetMaintenanceDto } from "./dto/cancel-asset-maintenance.dto";
import { CompleteAssetMaintenanceDto } from "./dto/complete-asset-maintenance.dto";
import { CreateAssetMaintenanceDto } from "./dto/create-asset-maintenance.dto";
import { ListAssetMaintenanceDto } from "./dto/list-asset-maintenance.dto";

@ApiTags("asset-lifecycle")
@ApiBearerAuth()
@Controller("asset-maintenance")
@UseGuards(JwtAuthGuard)
export class AssetMaintenanceController {
  constructor(private readonly maintenance: AssetMaintenanceService) {}

  @Get()
  list(@Query() query: ListAssetMaintenanceDto, @CurrentUser() user: PublicUser) {
    return this.maintenance.list(user, query);
  }

  @Post()
  create(@Body() dto: CreateAssetMaintenanceDto, @CurrentUser() user: PublicUser) {
    return this.maintenance.create(user, dto);
  }

  @Post(":id/start")
  start(@Param("id") id: string, @CurrentUser() user: PublicUser) {
    return this.maintenance.start(user, id);
  }

  @Post(":id/complete")
  complete(
    @Param("id") id: string,
    @Body() dto: CompleteAssetMaintenanceDto,
    @CurrentUser() user: PublicUser,
  ) {
    return this.maintenance.complete(user, id, dto);
  }

  @Patch(":id/cancel")
  cancel(
    @Param("id") id: string,
    @Body() dto: CancelAssetMaintenanceDto,
    @CurrentUser() user: PublicUser,
  ) {
    return this.maintenance.cancel(user, id, dto);
  }
}
