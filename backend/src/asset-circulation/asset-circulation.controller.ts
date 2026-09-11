import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PublicUser } from "../users/user.presenter";
import { AssetReservationsService } from "./asset-reservations.service";
import { CancelAssetReservationDto } from "./dto/cancel-asset-reservation.dto";
import { CreateAssetReservationDto } from "./dto/create-asset-reservation.dto";
import { ListAssetReservationsDto } from "./dto/list-asset-reservations.dto";

@ApiTags("asset-circulation")
@ApiBearerAuth()
@Controller("asset-reservations")
@UseGuards(JwtAuthGuard)
export class AssetCirculationController {
  constructor(private readonly reservations: AssetReservationsService) {}

  @Get()
  list(@Query() query: ListAssetReservationsDto, @CurrentUser() user: PublicUser) {
    return this.reservations.list(user, query);
  }

  @Post()
  create(
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() dto: CreateAssetReservationDto,
    @CurrentUser() user: PublicUser,
  ) {
    return this.reservations.create(user, idempotencyKey, dto);
  }

  @Patch(":id/cancel")
  cancel(
    @Param("id") id: string,
    @Body() dto: CancelAssetReservationDto,
    @CurrentUser() user: PublicUser,
  ) {
    return this.reservations.cancel(user, id, dto);
  }
}
