import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { PublicUser } from "../users/user.presenter";
import { AttachFinanceDocumentsDto } from "./dto/attach-finance-documents.dto";
import { CreateBusinessFinanceRecordDto } from "./dto/create-business-finance-record.dto";
import { CreateBusinessFollowUpDto } from "./dto/create-business-follow-up.dto";
import { CreateBusinessTaskDto } from "./dto/create-business-task.dto";
import { ListBusinessFollowUpsDto } from "./dto/list-business-follow-ups.dto";
import { ListBusinessActivitiesDto } from "./dto/list-business-activities.dto";
import { ListBusinessFinanceRecordsDto } from "./dto/list-business-finance-records.dto";
import { ListBusinessTasksDto } from "./dto/list-business-tasks.dto";
import { UpdateBusinessFinanceRecordDto } from "./dto/update-business-finance-record.dto";
import { UpdateBusinessTaskDto } from "./dto/update-business-task.dto";
import { UpsertBusinessContractDto } from "./dto/upsert-business-contract.dto";
import { BusinessWorkflowService } from "./business-workflow.service";

@ApiTags("business-workflow")
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class BusinessWorkflowController {
  constructor(private readonly workflow: BusinessWorkflowService) {}

  @Get("business-workflow/overview")
  overview(@CurrentUser() user: PublicUser) {
    return this.workflow.getOverview(user);
  }

  @Get("business-workflow/reminders")
  reminders(@CurrentUser() user: PublicUser) {
    return this.workflow.listReminders(user);
  }

  @Get("business-matters/:matterId/tasks")
  listTasks(@Param("matterId") matterId: string, @Query() query: ListBusinessTasksDto) {
    return this.workflow.listTasks(matterId, query);
  }

  @Post("business-matters/:matterId/tasks")
  createTask(@Param("matterId") matterId: string, @Body() dto: CreateBusinessTaskDto, @CurrentUser() user: PublicUser) {
    return this.workflow.createTask(matterId, dto, user);
  }

  @Patch("business-matters/:matterId/tasks/:taskId")
  updateTask(
    @Param("matterId") matterId: string,
    @Param("taskId") taskId: string,
    @Body() dto: UpdateBusinessTaskDto,
    @CurrentUser() user: PublicUser,
  ) {
    return this.workflow.updateTask(matterId, taskId, dto, user);
  }

  @Delete("business-matters/:matterId/tasks/:taskId")
  removeTask(@Param("matterId") matterId: string, @Param("taskId") taskId: string, @CurrentUser() user: PublicUser) {
    return this.workflow.removeTask(matterId, taskId, user);
  }

  @Get("business-matters/:matterId/follow-ups")
  listFollowUps(@Param("matterId") matterId: string, @Query() query: ListBusinessFollowUpsDto) {
    return this.workflow.listFollowUps(matterId, query);
  }

  @Post("business-matters/:matterId/follow-ups")
  createFollowUp(
    @Param("matterId") matterId: string,
    @Body() dto: CreateBusinessFollowUpDto,
    @CurrentUser() user: PublicUser,
  ) {
    return this.workflow.createFollowUp(matterId, dto, user);
  }

  @Get("business-matters/:matterId/contract")
  getContract(@Param("matterId") matterId: string) {
    return this.workflow.getContract(matterId);
  }

  @Put("business-matters/:matterId/contract")
  upsertContract(@Param("matterId") matterId: string, @Body() dto: UpsertBusinessContractDto, @CurrentUser() user: PublicUser) {
    return this.workflow.upsertContract(matterId, dto, user);
  }

  @Delete("business-matters/:matterId/contract")
  removeContract(@Param("matterId") matterId: string, @CurrentUser() user: PublicUser) {
    return this.workflow.removeContract(matterId, user);
  }

  @Get("business-matters/:matterId/finance-records")
  listFinanceRecords(@Param("matterId") matterId: string, @Query() query: ListBusinessFinanceRecordsDto) {
    return this.workflow.listFinanceRecords(matterId, query);
  }

  @Post("business-matters/:matterId/finance-records")
  createFinanceRecord(
    @Param("matterId") matterId: string,
    @Body() dto: CreateBusinessFinanceRecordDto,
    @CurrentUser() user: PublicUser,
  ) {
    return this.workflow.createFinanceRecord(matterId, dto, user);
  }

  @Patch("business-matters/:matterId/finance-records/:recordId")
  updateFinanceRecord(
    @Param("matterId") matterId: string,
    @Param("recordId") recordId: string,
    @Body() dto: UpdateBusinessFinanceRecordDto,
    @CurrentUser() user: PublicUser,
  ) {
    return this.workflow.updateFinanceRecord(matterId, recordId, dto, user);
  }

  @Delete("business-matters/:matterId/finance-records/:recordId")
  removeFinanceRecord(
    @Param("matterId") matterId: string,
    @Param("recordId") recordId: string,
    @CurrentUser() user: PublicUser,
  ) {
    return this.workflow.removeFinanceRecord(matterId, recordId, user);
  }

  @Post("business-matters/:matterId/finance-records/:recordId/documents")
  attachFinanceDocuments(
    @Param("matterId") matterId: string,
    @Param("recordId") recordId: string,
    @Body() dto: AttachFinanceDocumentsDto,
    @CurrentUser() user: PublicUser,
  ) {
    return this.workflow.attachFinanceDocuments(matterId, recordId, dto, user);
  }

  @Delete("business-matters/:matterId/finance-records/:recordId/documents/:documentId")
  detachFinanceDocument(
    @Param("matterId") matterId: string,
    @Param("recordId") recordId: string,
    @Param("documentId") documentId: string,
    @CurrentUser() user: PublicUser,
  ) {
    return this.workflow.detachFinanceDocument(matterId, recordId, documentId, user);
  }

  @Get("business-matters/:matterId/activities")
  listActivities(@Param("matterId") matterId: string, @Query() query: ListBusinessActivitiesDto) {
    return this.workflow.listActivities(matterId, query.page, query.pageSize);
  }
}
