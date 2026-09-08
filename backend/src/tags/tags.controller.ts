import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";

import { AuthenticatedRequest } from "../auth/authenticated-request";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CreateTagDto } from "./dto/create-tag.dto";
import { ListTagsDto } from "./dto/list-tags.dto";
import { UpdateTagDto } from "./dto/update-tag.dto";
import { TagsService } from "./tags.service";

@ApiTags("tags")
@ApiBearerAuth()
@Controller("tags")
@UseGuards(JwtAuthGuard, RolesGuard)
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Get()
  list(@Query() query: ListTagsDto) {
    return this.tagsService.list(query);
  }

  @Post()
  create(@Body() dto: CreateTagDto, @CurrentUser() user: AuthenticatedRequest["user"]) {
    return this.tagsService.create(dto, user!.id);
  }

  @Patch(":id")
  @Roles(UserRole.ADMIN)
  update(@Param("id") id: string, @Body() dto: UpdateTagDto) {
    return this.tagsService.update(id, dto);
  }

  @Delete(":id")
  @Roles(UserRole.ADMIN)
  remove(@Param("id") id: string) {
    return this.tagsService.remove(id);
  }

  @Post(":sourceId/merge/:targetId")
  @Roles(UserRole.ADMIN)
  merge(@Param("sourceId") sourceId: string, @Param("targetId") targetId: string) {
    return this.tagsService.merge(sourceId, targetId);
  }
}
