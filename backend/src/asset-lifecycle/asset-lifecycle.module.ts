import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AuthorizationModule } from "../authorization/authorization.module";
import { AssetAnomaliesController } from "./asset-anomalies.controller";
import { AssetAnomaliesService } from "./asset-anomalies.service";
import { AssetExitsController } from "./asset-exits.controller";
import { AssetExitsService } from "./asset-exits.service";
import { AssetInventoryController } from "./asset-inventory.controller";
import { AssetInventoryService } from "./asset-inventory.service";
import { AssetMaintenanceController } from "./asset-maintenance.controller";
import { AssetMaintenanceService } from "./asset-maintenance.service";

@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [AssetInventoryController, AssetMaintenanceController, AssetAnomaliesController, AssetExitsController],
  providers: [AssetInventoryService, AssetMaintenanceService, AssetAnomaliesService, AssetExitsService, JwtAuthGuard],
  exports: [AssetInventoryService, AssetMaintenanceService, AssetAnomaliesService, AssetExitsService],
})
export class AssetLifecycleModule {}
