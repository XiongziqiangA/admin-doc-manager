import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { PublicUser } from "../users/user.presenter";
import { BusinessMattersService } from "./business-matters.service";
import { AttachBusinessMatterDocumentsDto } from "./dto/attach-business-matter-documents.dto";
import { CreateBusinessMatterDto } from "./dto/create-business-matter.dto";
import { ListBusinessMattersDto } from "./dto/list-business-matters.dto";
import { UpdateBusinessMatterDto } from "./dto/update-business-matter.dto";
import { CreateBusinessMilestoneDto } from "./dto/create-business-milestone.dto";
import { CreateBusinessStageDto } from "./dto/create-business-stage.dto";
import { UpdateBusinessMilestoneDto } from "./dto/update-business-milestone.dto";
import { UpdateBusinessStageDto } from "./dto/update-business-stage.dto";

@ApiTags("business-matters")
@ApiBearerAuth()
@Controller("business-matters")
@UseGuards(JwtAuthGuard, RolesGuard)
export class BusinessMattersController {
  constructor(private readonly businessMattersService: BusinessMattersService) {}

  @Get()
  list(@Query() query: ListBusinessMattersDto) {
    return this.businessMattersService.list(query);
  }

  @Post()
  create(@Body() dto: CreateBusinessMatterDto, @CurrentUser() user: PublicUser) {
    return this.businessMattersService.create(dto, user);
  }

  @Get(":id/project-plan")
  getProjectPlan(@Param("id") id: string) {
    return this.businessMattersService.getProjectPlan(id);
  }

  @Get(":id")
  findById(@Param("id") id: string) {
    return this.businessMattersService.findById(id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateBusinessMatterDto, @CurrentUser() user: PublicUser) {
    return this.businessMattersService.update(id, dto, user);
  }

  @Delete(":id")
  remove(@Param("id") id: string, @CurrentUser() user: PublicUser) {
    return this.businessMattersService.remove(id, user);
  }

  @Post(":id/documents")
  attachDocuments(
    @Param("id") id: string,
    @Body() dto: AttachBusinessMatterDocumentsDto,
    @CurrentUser() user: PublicUser,
  ) {
    return this.businessMattersService.attachDocuments(id, dto, user);
  }

  @Delete(":id/documents/:documentId")
  detachDocument(@Param("id") id: string, @Param("documentId") documentId: string, @CurrentUser() user: PublicUser) {
    return this.businessMattersService.detachDocument(id, documentId, user);
  }

  @Post(":id/stages")
  createStage(@Param("id") id: string, @Body() dto: CreateBusinessStageDto, @CurrentUser() user: PublicUser) {
    return this.businessMattersService.createStage(id, dto, user);
  }

  @Patch(":id/stages/:stageId")
  updateStage(@Param("id") id: string, @Param("stageId") stageId: string, @Body() dto: UpdateBusinessStageDto, @CurrentUser() user: PublicUser) {
    return this.businessMattersService.updateStage(id, stageId, dto, user);
  }

  @Delete(":id/stages/:stageId")
  removeStage(@Param("id") id: string, @Param("stageId") stageId: string, @CurrentUser() user: PublicUser) {
    return this.businessMattersService.removeStage(id, stageId, user);
  }

  @Post(":id/milestones")
  createMilestone(@Param("id") id: string, @Body() dto: CreateBusinessMilestoneDto, @CurrentUser() user: PublicUser) {
    return this.businessMattersService.createMilestone(id, dto, user);
  }

  @Patch(":id/milestones/:milestoneId")
  updateMilestone(@Param("id") id: string, @Param("milestoneId") milestoneId: string, @Body() dto: UpdateBusinessMilestoneDto, @CurrentUser() user: PublicUser) {
    return this.businessMattersService.updateMilestone(id, milestoneId, dto, user);
  }

  @Delete(":id/milestones/:milestoneId")
  removeMilestone(@Param("id") id: string, @Param("milestoneId") milestoneId: string, @CurrentUser() user: PublicUser) {
    return this.businessMattersService.removeMilestone(id, milestoneId, user);
  }
}
