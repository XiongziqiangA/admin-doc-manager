import { Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PublicUser } from "../users/user.presenter";
import { ListNotificationsDto } from "./dto/list-notifications.dto";
import { NotificationsService } from "./notifications.service";

@ApiTags("notifications")
@ApiBearerAuth()
@Controller("notifications")
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@Query() query: ListNotificationsDto, @CurrentUser() user: PublicUser) {
    return this.notifications.list(user, query);
  }

  @Patch(":id/read")
  markRead(@Param("id") id: string, @CurrentUser() user: PublicUser) {
    return this.notifications.markRead(user, id);
  }

  @Post("read-all")
  markAllRead(@CurrentUser() user: PublicUser) {
    return this.notifications.markAllRead(user);
  }
}
