import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { Response } from "express";

import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { PublicUser } from "../users/user.presenter";
import { CreateFinancePackageDto } from "./dto/create-finance-package.dto";
import { CreateFinancePackageGroupDto, UpdateFinancePackageGroupDto } from "./dto/finance-package-group.dto";
import { AddFinancePackageItemsDto, UpdateFinancePackageItemDto } from "./dto/finance-package-item.dto";
import { ConfirmFinanceAnalysisDto } from "./dto/confirm-finance-analysis.dto";
import { UpdateFinanceAiSettingsDto } from "./dto/update-finance-ai-settings.dto";
import { ListFinanceCandidatesDto } from "./dto/list-finance-candidates.dto";
import { ListFinancePackagesDto } from "./dto/list-finance-packages.dto";
import { StartFinanceAnalysisDto } from "./dto/start-finance-analysis.dto";
import { FinanceAnalysisService } from "./finance-analysis.service";
import { FinanceAiSettingsService } from "./finance-ai-settings.service";
import { UpdateFinancePackageDto } from "./dto/update-finance-package.dto";
import { FinancePackagesService } from "./finance-packages.service";
import { FINANCE_AI_PROMPT_VERSION, OpenAiCompatibleService } from "./openai-compatible.service";
import { Roles } from "../auth/roles.decorator";

@ApiTags("finance-packages")
@ApiBearerAuth()
@Controller("finance-packages")
@UseGuards(JwtAuthGuard, RolesGuard)
export class FinancePackagesController {
  constructor(
    private readonly financePackagesService: FinancePackagesService,
    private readonly financeAnalysisService: FinanceAnalysisService,
    private readonly financeAiSettingsService: FinanceAiSettingsService,
    private readonly openAiCompatibleService: OpenAiCompatibleService,
  ) {}

  @Get("ai/status")
  @Roles(UserRole.ADMIN)
  aiStatus() {
    return this.financeAnalysisService.getAiStatus();
  }

  @Get("ai/config")
  @Roles(UserRole.ADMIN)
  getAiConfig() {
    return this.financeAiSettingsService.getPublicConfig(FINANCE_AI_PROMPT_VERSION);
  }

  @Patch("ai/config")
  @Roles(UserRole.ADMIN)
  async updateAiConfig(@Body() dto: UpdateFinanceAiSettingsDto) {
    const settings = await this.financeAiSettingsService.update(dto, FINANCE_AI_PROMPT_VERSION);
    await this.openAiCompatibleService.reload();
    return settings;
  }

  @Delete("ai/config")
  @Roles(UserRole.ADMIN)
  async resetAiConfig() {
    const settings = await this.financeAiSettingsService.reset(FINANCE_AI_PROMPT_VERSION);
    await this.openAiCompatibleService.reload();
    return settings;
  }

  @Post("ai/config/test")
  @Roles(UserRole.ADMIN)
  async testAiConfig() {
    return this.runAiConfigVerification();
  }

  @Post("ai/config/verify")
  @Roles(UserRole.ADMIN)
  async verifyAiConfig() {
    return this.runAiConfigVerification();
  }

  private async runAiConfigVerification() {
    const startedAt = Date.now();
    const testedAt = new Date(startedAt);
    try {
      const result = await this.openAiCompatibleService.testConnection();
      const resultMessage = `连接成功：${result.model}，验证接口 ${result.endpoint}，耗时 ${result.durationMs} ms`;
      await this.financeAiSettingsService.recordTest(true, resultMessage, testedAt, {
        status: "CONNECTED",
        model: result.model,
        durationMs: result.durationMs,
        endpoint: result.endpoint,
      });
      return {
        ...result,
        testedAt,
        message: resultMessage,
        config: await this.financeAiSettingsService.getPublicConfig(FINANCE_AI_PROMPT_VERSION),
      };
    } catch (error) {
      const message = safeAiErrorMessage(error);
      await this.financeAiSettingsService.recordTest(false, message, testedAt, {
        status: aiTestStatus(error),
        model: this.openAiCompatibleService.status().model,
        durationMs: Date.now() - startedAt,
        endpoint: aiTestEndpoint(error),
      });
      throw new BadRequestException({ error: `AI_${aiTestStatus(error)}`, message });
    }
  }

  @Get("ai/config/models")
  @Roles(UserRole.ADMIN)
  async listAiModels() {
    try {
      return await this.openAiCompatibleService.listModels();
    } catch (error) {
      throw new BadRequestException({ error: `AI_${aiTestStatus(error)}`, message: safeAiErrorMessage(error) });
    }
  }

  @Get()
  list(@Query() query: ListFinancePackagesDto) {
    return this.financePackagesService.list(query);
  }

  @Post()
  create(@Body() dto: CreateFinancePackageDto, @CurrentUser() user: PublicUser) {
    return this.financePackagesService.create(dto, user);
  }

  @Get(":id")
  findById(@Param("id") id: string) {
    return this.financePackagesService.findById(id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateFinancePackageDto) {
    return this.financePackagesService.update(id, dto);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.financePackagesService.remove(id);
  }

  @Post(":id/groups")
  createGroup(@Param("id") id: string, @Body() dto: CreateFinancePackageGroupDto) {
    return this.financePackagesService.createGroup(id, dto);
  }

  @Patch(":id/groups/:groupId")
  updateGroup(
    @Param("id") id: string,
    @Param("groupId") groupId: string,
    @Body() dto: UpdateFinancePackageGroupDto,
  ) {
    return this.financePackagesService.updateGroup(id, groupId, dto);
  }

  @Delete(":id/groups/:groupId")
  removeGroup(@Param("id") id: string, @Param("groupId") groupId: string) {
    return this.financePackagesService.removeGroup(id, groupId);
  }

  @Post(":id/items")
  addItems(@Param("id") id: string, @Body() dto: AddFinancePackageItemsDto) {
    return this.financePackagesService.addItems(id, dto);
  }

  @Patch(":id/items/:itemId")
  updateItem(
    @Param("id") id: string,
    @Param("itemId") itemId: string,
    @Body() dto: UpdateFinancePackageItemDto,
  ) {
    return this.financePackagesService.updateItem(id, itemId, dto);
  }

  @Delete(":id/items/:itemId")
  removeItem(@Param("id") id: string, @Param("itemId") itemId: string) {
    return this.financePackagesService.removeItem(id, itemId);
  }

  @Get(":id/candidates")
  listCandidates(@Param("id") id: string, @Query() query: ListFinanceCandidatesDto) {
    return this.financePackagesService.listCandidates(id, query);
  }

  @Post(":id/analysis")
  startAnalysis(
    @Param("id") id: string,
    @Body() dto: StartFinanceAnalysisDto,
    @CurrentUser() user: PublicUser,
  ) {
    return this.financeAnalysisService.start(id, dto, user);
  }

  @Get(":id/analysis/:jobId")
  getAnalysis(@Param("id") id: string, @Param("jobId") jobId: string) {
    return this.financeAnalysisService.getJob(id, jobId);
  }

  @Post(":id/analysis/:jobId/confirm")
  confirmAnalysis(
    @Param("id") id: string,
    @Param("jobId") jobId: string,
    @Body() dto: ConfirmFinanceAnalysisDto,
  ) {
    return this.financeAnalysisService.confirm(id, jobId, dto);
  }

  @Post(":id/export")
  exportPackage(
    @Param("id") id: string,
    @CurrentUser() user: PublicUser,
    @Res() response: Response,
  ) {
    return this.financePackagesService.exportPackage(id, user, response);
  }
}

function safeAiErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : "";
  if (raw.includes("未配置") || raw.includes("模型名称不能为空") || raw.includes("JWT_SECRET")) {
    return raw;
  }
  if (raw.includes("中转站") || raw.includes("模型列表")) {
    return raw.slice(0, 300);
  }
  if (raw.includes("timed out") || raw.includes("超时")) {
    return "连接中转站超时，请检查网络连接和中转站地址。";
  }
  const status = raw.match(/status (\d{3})/i)?.[1];
  if (status) {
    return `中转站拒绝请求（HTTP ${status}），请检查 API Key、模型名称和接口地址。`;
  }
  return "无法连接到中转站，请检查网络、接口地址、API Key 和模型名称。";
}

function aiTestStatus(error: unknown) {
  const raw = error instanceof Error ? error.message : "";
  if (raw.includes("未配置")) return "NOT_CONFIGURED";
  if (raw.includes("401") || raw.includes("403")) return "AUTH_FAILED";
  if (raw.includes("429")) return "RATE_LIMITED";
  if (raw.includes("模型列表中") || raw.includes("模型名称")) return "MODEL_NOT_FOUND";
  if (raw.includes("超时") || raw.includes("timed out")) return "TIMEOUT";
  if (raw.includes("无法连接") || raw.includes("fetch failed")) return "NETWORK_ERROR";
  return "FAILED";
}

function aiTestEndpoint(error: unknown) {
  const raw = error instanceof Error ? error.message : "";
  if (raw.includes("模型列表")) return "models";
  if (raw.includes("聊天接口") || raw.includes("chat/completions") || raw.includes("AI provider")) {
    return "chat/completions";
  }
  return "verification";
}
