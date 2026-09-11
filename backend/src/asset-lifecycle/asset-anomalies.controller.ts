import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PublicUser } from "../users/user.presenter";
import { AssetAnomaliesService } from "./asset-anomalies.service";
import { AssignAssetAnomalyDto } from "./dto/assign-asset-anomaly.dto";
import { CreateAssetAnomalyDto } from "./dto/create-asset-anomaly.dto";
import { ListAssetAnomaliesDto } from "./dto/list-asset-anomalies.dto";
import { ResolveAssetAnomalyDto } from "./dto/resolve-asset-anomaly.dto";

@ApiTags("asset-lifecycle")
@ApiBearerAuth()
@Controller("asset-anomalies")
@UseGuards(JwtAuthGuard)
export class AssetAnomaliesController {
  constructor(private readonly anomalies: AssetAnomaliesService) {}

  @Get()
  list(@Query() query: ListAssetAnomaliesDto, @CurrentUser() user: PublicUser) {
    return this.anomalies.list(user, query);
  }

  @Post()
  create(@Body() dto: CreateAssetAnomalyDto, @CurrentUser() user: PublicUser) {
    return this.anomalies.create(user, dto);
  }

  @Patch(":id/assign")
  assign(
    @Param("id") id: string,
    @Body() dto: AssignAssetAnomalyDto,
    @CurrentUser() user: PublicUser,
  ) {
    return this.anomalies.assign(user, id, dto);
  }

  @Post(":id/resolve")
  resolve(
    @Param("id") id: string,
    @Body() dto: ResolveAssetAnomalyDto,
    @CurrentUser() user: PublicUser,
  ) {
    return this.anomalies.resolve(user, id, dto);
  }
}
