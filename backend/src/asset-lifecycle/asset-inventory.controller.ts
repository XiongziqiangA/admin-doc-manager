import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PublicUser } from "../users/user.presenter";
import { AssetInventoryService } from "./asset-inventory.service";
import { CancelAssetInventoryTaskDto } from "./dto/cancel-asset-inventory-task.dto";
import { CreateAssetInventoryTaskDto } from "./dto/create-asset-inventory-task.dto";
import { ListAssetInventoryTasksDto } from "./dto/list-asset-inventory-tasks.dto";
import { RecordAssetInventoryDto } from "./dto/record-asset-inventory.dto";

@ApiTags("asset-lifecycle")
@ApiBearerAuth()
@Controller("asset-inventory-tasks")
@UseGuards(JwtAuthGuard)
export class AssetInventoryController {
  constructor(private readonly inventory: AssetInventoryService) {}

  @Get()
  list(@Query() query: ListAssetInventoryTasksDto, @CurrentUser() user: PublicUser) {
    return this.inventory.list(user, query);
  }

  @Get(":id")
  findById(@Param("id") id: string, @CurrentUser() user: PublicUser) {
    return this.inventory.findById(user, id);
  }

  @Post()
  create(@Body() dto: CreateAssetInventoryTaskDto, @CurrentUser() user: PublicUser) {
    return this.inventory.create(user, dto);
  }

  @Post(":id/records")
  record(
    @Param("id") id: string,
    @Body() dto: RecordAssetInventoryDto,
    @CurrentUser() user: PublicUser,
  ) {
    return this.inventory.record(user, id, dto);
  }

  @Post(":id/complete")
  complete(@Param("id") id: string, @CurrentUser() user: PublicUser) {
    return this.inventory.complete(user, id);
  }

  @Patch(":id/cancel")
  cancel(
    @Param("id") id: string,
    @Body() dto: CancelAssetInventoryTaskDto,
    @CurrentUser() user: PublicUser,
  ) {
    return this.inventory.cancel(user, id, dto);
  }
}
