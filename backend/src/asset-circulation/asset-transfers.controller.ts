import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PublicUser } from "../users/user.presenter";
import { AssetTransfersService } from "./asset-transfers.service";
import { AssetHandoverDto } from "./dto/asset-handover.dto";
import { CreateAssetTransferDto } from "./dto/create-asset-transfer.dto";
import { ListAssetTransfersDto } from "./dto/list-asset-transfers.dto";

@ApiTags("asset-circulation")
@ApiBearerAuth()
@Controller("asset-transfers")
@UseGuards(JwtAuthGuard)
export class AssetTransfersController {
  constructor(private readonly transfers: AssetTransfersService) {}

  @Get()
  list(@Query() query: ListAssetTransfersDto, @CurrentUser() user: PublicUser) {
    return this.transfers.list(user, query);
  }

  @Post()
  create(
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() dto: CreateAssetTransferDto,
    @CurrentUser() user: PublicUser,
  ) {
    return this.transfers.create(user, idempotencyKey, dto);
  }

  @Post(":id/complete")
  complete(@Param("id") id: string, @Body() dto: AssetHandoverDto, @CurrentUser() user: PublicUser) {
    return this.transfers.complete(user, id, dto);
  }

  @Patch(":id/cancel")
  cancel(@Param("id") id: string, @CurrentUser() user: PublicUser) {
    return this.transfers.cancel(user, id);
  }
}
