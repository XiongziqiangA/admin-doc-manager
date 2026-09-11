import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PublicUser } from "../users/user.presenter";
import { AssetsService } from "./assets.service";
import { ConfirmPendingAssetDto } from "./dto/confirm-pending-asset.dto";
import { CreateAssetIdentifierDto } from "./dto/create-asset-identifier.dto";
import { CreateAssetDto } from "./dto/create-asset.dto";
import { CreateAssetTypeDto } from "./dto/create-asset-type.dto";
import { CreateLocationDto } from "./dto/create-location.dto";
import { CreatePendingAssetDto } from "./dto/create-pending-asset.dto";
import { ListAssetsDto } from "./dto/list-assets.dto";
import { UpdateAssetIdentifierDto } from "./dto/update-asset-identifier.dto";
import { UpdateAssetDto } from "./dto/update-asset.dto";
import { UpdateAssetTypeDto } from "./dto/update-asset-type.dto";
import { UpdateLocationDto } from "./dto/update-location.dto";

@ApiTags("assets")
@ApiBearerAuth()
@Controller("assets")
@UseGuards(JwtAuthGuard)
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Get("types")
  listTypes(@Query("includeDisabled") includeDisabled: string | undefined, @CurrentUser() user: PublicUser) {
    return this.assetsService.listTypes(user, includeDisabled === "true");
  }

  @Post("types")
  createType(@Body() dto: CreateAssetTypeDto, @CurrentUser() user: PublicUser) {
    return this.assetsService.createType(user, dto);
  }

  @Patch("types/:id")
  updateType(@Param("id") id: string, @Body() dto: UpdateAssetTypeDto, @CurrentUser() user: PublicUser) {
    return this.assetsService.updateType(user, id, dto);
  }

  @Get("locations")
  listLocations(@Query("includeDisabled") includeDisabled: string | undefined, @CurrentUser() user: PublicUser) {
    return this.assetsService.listLocations(user, includeDisabled === "true");
  }

  @Post("locations")
  createLocation(@Body() dto: CreateLocationDto, @CurrentUser() user: PublicUser) {
    return this.assetsService.createLocation(user, dto);
  }

  @Patch("locations/:id")
  updateLocation(@Param("id") id: string, @Body() dto: UpdateLocationDto, @CurrentUser() user: PublicUser) {
    return this.assetsService.updateLocation(user, id, dto);
  }

  @Delete("locations/:id")
  removeLocation(@Param("id") id: string, @CurrentUser() user: PublicUser) {
    return this.assetsService.removeLocation(user, id);
  }

  @Get("pending")
  listPending(@Query("status") status: string | undefined, @CurrentUser() user: PublicUser) {
    return this.assetsService.listPending(user, status || "pending");
  }

  @Post("pending")
  createPending(@Body() dto: CreatePendingAssetDto, @CurrentUser() user: PublicUser) {
    return this.assetsService.createPending(user, dto);
  }

  @Post("pending/:id/confirm")
  confirmPending(@Param("id") id: string, @Body() dto: ConfirmPendingAssetDto, @CurrentUser() user: PublicUser) {
    return this.assetsService.confirmPending(user, id, dto);
  }

  @Get("overview")
  overview(@CurrentUser() user: PublicUser) {
    return this.assetsService.overview(user);
  }

  @Get()
  list(@Query() query: ListAssetsDto, @CurrentUser() user: PublicUser) {
    return this.assetsService.list(user, query);
  }

  @Post()
  create(@Body() dto: CreateAssetDto, @CurrentUser() user: PublicUser) {
    return this.assetsService.create(user, dto);
  }

  @Post(":id/identifiers")
  createIdentifier(
    @Param("id") id: string,
    @Body() dto: CreateAssetIdentifierDto,
    @CurrentUser() user: PublicUser,
  ) {
    return this.assetsService.createIdentifier(user, id, dto);
  }

  @Patch(":id/identifiers/:identifierId")
  updateIdentifier(
    @Param("id") id: string,
    @Param("identifierId") identifierId: string,
    @Body() dto: UpdateAssetIdentifierDto,
    @CurrentUser() user: PublicUser,
  ) {
    return this.assetsService.updateIdentifier(user, id, identifierId, dto);
  }

  @Delete(":id/identifiers/:identifierId")
  removeIdentifier(
    @Param("id") id: string,
    @Param("identifierId") identifierId: string,
    @CurrentUser() user: PublicUser,
  ) {
    return this.assetsService.removeIdentifier(user, id, identifierId);
  }

  @Get(":id")
  findById(@Param("id") id: string, @CurrentUser() user: PublicUser) {
    return this.assetsService.findById(user, id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateAssetDto, @CurrentUser() user: PublicUser) {
    return this.assetsService.update(user, id, dto);
  }

  @Delete(":id")
  remove(@Param("id") id: string, @CurrentUser() user: PublicUser) {
    return this.assetsService.assertNotDeletable(user, id);
  }
}
