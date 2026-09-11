import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";

import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CreateUserDto } from "./dto/create-user.dto";
import { ListUsersDto } from "./dto/list-users.dto";
import { UpdateUserStatusDto } from "./dto/update-user-status.dto";
import { PublicUser } from "./user.presenter";
import { UsersService } from "./users.service";

@ApiTags("users")
@ApiBearerAuth()
@Controller("users")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  create(@Body() dto: CreateUserDto, @CurrentUser() user: PublicUser) {
    return this.usersService.create(dto, user);
  }

  @Get()
  list(@Query() query: ListUsersDto, @CurrentUser() user: PublicUser) {
    return this.usersService.list(query, user);
  }

  @Get(":id")
  findById(@Param("id") id: string, @CurrentUser() user: PublicUser) {
    return this.usersService.findById(id, user.organizationId);
  }

  @Patch(":id/status")
  updateStatus(@Param("id") id: string, @Body() dto: UpdateUserStatusDto, @CurrentUser() user: PublicUser) {
    return this.usersService.updateStatus(id, dto.status, user.organizationId);
  }
}
