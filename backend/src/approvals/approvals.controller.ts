import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PublicUser } from "../users/user.presenter";
import { ApprovalsService } from "./approvals.service";
import { ListApprovalsDto } from "./dto/list-approvals.dto";
import { ReviewApprovalDto } from "./dto/review-approval.dto";

@ApiTags("approvals")
@ApiBearerAuth()
@Controller("approvals")
@UseGuards(JwtAuthGuard)
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get()
  list(@Query() query: ListApprovalsDto, @CurrentUser() user: PublicUser) {
    return this.approvals.list(user, query);
  }

  @Get(":id")
  findById(@Param("id") id: string, @CurrentUser() user: PublicUser) {
    return this.approvals.findById(user, id);
  }

  @Post(":id/approve")
  approve(@Param("id") id: string, @Body() dto: ReviewApprovalDto, @CurrentUser() user: PublicUser) {
    return this.approvals.approve(user, id, dto);
  }

  @Post(":id/reject")
  reject(@Param("id") id: string, @Body() dto: ReviewApprovalDto, @CurrentUser() user: PublicUser) {
    return this.approvals.reject(user, id, dto);
  }
}
