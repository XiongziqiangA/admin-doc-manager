import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AuthorizationModule } from "../authorization/authorization.module";
import { IdempotencyService } from "../common/idempotency.service";
import { AssetCirculationController } from "./asset-circulation.controller";
import { AssetReservationsService } from "./asset-reservations.service";

@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [AssetCirculationController],
  providers: [AssetReservationsService, IdempotencyService, JwtAuthGuard],
  exports: [AssetReservationsService],
})
export class AssetCirculationModule {}
