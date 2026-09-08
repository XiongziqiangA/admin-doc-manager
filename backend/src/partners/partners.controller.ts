import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";

import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CreatePartnerDto } from "./dto/create-partner.dto";
import { ListPartnersDto } from "./dto/list-partners.dto";
import { UpdatePartnerDto } from "./dto/update-partner.dto";
import { PartnersService } from "./partners.service";

@ApiTags("partners")
@ApiBearerAuth()
@Controller("partners")
@UseGuards(JwtAuthGuard, RolesGuard)
export class PartnersController {
  constructor(private readonly partnersService: PartnersService) {}

  @Get()
  list(@Query() query: ListPartnersDto) {
    return this.partnersService.list(query);
  }

  @Get(":id")
  findById(@Param("id") id: string) {
    return this.partnersService.findById(id);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreatePartnerDto) {
    return this.partnersService.create(dto);
  }

  @Patch(":id")
  @Roles(UserRole.ADMIN)
  update(@Param("id") id: string, @Body() dto: UpdatePartnerDto) {
    return this.partnersService.update(id, dto);
  }

  @Delete(":id")
  @Roles(UserRole.ADMIN)
  remove(@Param("id") id: string) {
    return this.partnersService.remove(id);
  }
}
