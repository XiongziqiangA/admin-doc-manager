import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PublicUser } from "../users/user.presenter";
import { AssetBorrowsService } from "./asset-borrows.service";
import { AssetHandoverDto } from "./dto/asset-handover.dto";
import { CancelAssetBorrowDto } from "./dto/cancel-asset-borrow.dto";
import { CreateAssetBorrowDto } from "./dto/create-asset-borrow.dto";
import { ListAssetBorrowsDto } from "./dto/list-asset-borrows.dto";
import { RequestAssetReturnDto } from "./dto/request-asset-return.dto";

@ApiTags("asset-circulation")
@ApiBearerAuth()
@Controller("asset-borrows")
@UseGuards(JwtAuthGuard)
export class AssetBorrowsController {
  constructor(private readonly borrows: AssetBorrowsService) {}

  @Get()
  list(@Query() query: ListAssetBorrowsDto, @CurrentUser() user: PublicUser) {
    return this.borrows.list(user, query);
  }

  @Post()
  create(
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() dto: CreateAssetBorrowDto,
    @CurrentUser() user: PublicUser,
  ) {
    return this.borrows.create(user, idempotencyKey, dto);
  }

  @Patch(":id/cancel")
  cancel(@Param("id") id: string, @Body() dto: CancelAssetBorrowDto, @CurrentUser() user: PublicUser) {
    return this.borrows.cancel(user, id, dto);
  }

  @Post(":id/handover")
  checkout(@Param("id") id: string, @Body() dto: AssetHandoverDto, @CurrentUser() user: PublicUser) {
    return this.borrows.checkout(user, id, dto);
  }

  @Post(":id/return-request")
  requestReturn(@Param("id") id: string, @Body() dto: RequestAssetReturnDto, @CurrentUser() user: PublicUser) {
    return this.borrows.requestReturn(user, id, dto);
  }

  @Post(":id/return-confirm")
  confirmReturn(@Param("id") id: string, @Body() dto: AssetHandoverDto, @CurrentUser() user: PublicUser) {
    return this.borrows.confirmReturn(user, id, dto);
  }
}
