import { Global, Module } from "@nestjs/common";

import { AuthorizationService } from "./authorization.service";
import { PermissionsGuard } from "./permissions.guard";

@Global()
@Module({
  providers: [AuthorizationService, PermissionsGuard],
  exports: [AuthorizationService, PermissionsGuard],
})
export class AuthorizationModule {}
