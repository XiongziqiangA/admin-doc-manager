import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AuthorizationModule } from "../authorization/authorization.module";
import { IdempotencyService } from "../common/idempotency.service";
import { AssetCirculationController } from "./asset-circulation.controller";
import { AssetBorrowsController } from "./asset-borrows.controller";
import { AssetBorrowsService } from "./asset-borrows.service";
import { AssetReservationsService } from "./asset-reservations.service";
import { AssetTransfersController } from "./asset-transfers.controller";
import { AssetTransfersService } from "./asset-transfers.service";

@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [AssetCirculationController, AssetBorrowsController, AssetTransfersController],
  providers: [AssetReservationsService, AssetBorrowsService, AssetTransfersService, IdempotencyService, JwtAuthGuard],
  exports: [AssetReservationsService, AssetBorrowsService, AssetTransfersService],
})
export class AssetCirculationModule {}
