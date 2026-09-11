import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AuthorizationModule } from "../authorization/authorization.module";
import { AssetInventoryController } from "./asset-inventory.controller";
import { AssetInventoryService } from "./asset-inventory.service";
import { AssetMaintenanceController } from "./asset-maintenance.controller";
import { AssetMaintenanceService } from "./asset-maintenance.service";

@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [AssetInventoryController, AssetMaintenanceController],
  providers: [AssetInventoryService, AssetMaintenanceService, JwtAuthGuard],
  exports: [AssetInventoryService, AssetMaintenanceService],
})
export class AssetLifecycleModule {}
