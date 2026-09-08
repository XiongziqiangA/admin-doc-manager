import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { Response } from "express";

import { AuthenticatedRequest } from "../auth/authenticated-request";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { PublicUser } from "../users/user.presenter";
import { CreateDocumentDto } from "./dto/create-document.dto";
import { ExportDocumentsDto } from "./dto/export-documents.dto";
import { ListDocumentsDto } from "./dto/list-documents.dto";
import { UpdateDocumentDto } from "./dto/update-document.dto";
import { UploadVersionDto } from "./dto/upload-version.dto";
import { DocumentsService } from "./documents.service";

@ApiTags("documents")
@ApiBearerAuth()
@Controller("documents")
@UseGuards(JwtAuthGuard, RolesGuard)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get("document-no/suggestion")
  suggestDocumentNo(@Query("categoryId") categoryId: string) {
    return this.documentsService.suggestDocumentNo(categoryId);
  }

  @Get("recycle")
  @Roles(UserRole.ADMIN)
  listRecycle(@Query() query: ListDocumentsDto) {
    return this.documentsService.listRecycle(query);
  }

  @Get()
  list(@Query() query: ListDocumentsDto) {
    return this.documentsService.list(query);
  }

  @Get("duplicates")
  findDuplicates(@Query("fileName") fileName: string) {
    return this.documentsService.findDuplicatesByFileName(fileName);
  }

  @Post("export")
  exportDocuments(
    @Body() dto: ExportDocumentsDto,
    @CurrentUser() user: PublicUser,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ) {
    return this.documentsService.exportDocuments(dto, user, this.getMeta(request), response);
  }

  @Post("upload")
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FileInterceptor("file"))
  create(
    @Body() dto: CreateDocumentDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: PublicUser,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.documentsService.create(dto, file, user, this.getMeta(request));
  }

  @Get(":id")
  findById(@Param("id") id: string, @CurrentUser() user: PublicUser, @Req() request: AuthenticatedRequest) {
    return this.documentsService.findById(id, user, this.getMeta(request));
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateDocumentDto,
    @CurrentUser() user: PublicUser,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.documentsService.update(id, dto, user, this.getMeta(request));
  }

  @Post(":id/versions")
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FileInterceptor("file"))
  uploadVersion(
    @Param("id") id: string,
    @Body() dto: UploadVersionDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: PublicUser,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.documentsService.uploadVersion(id, dto, file, user, this.getMeta(request));
  }

  @Get(":id/versions")
  listVersions(@Param("id") id: string) {
    return this.documentsService.listVersions(id);
  }

  @Get(":id/download")
  async download(
    @Param("id") id: string,
    @Query("versionId") versionId: string | undefined,
    @CurrentUser() user: PublicUser,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.documentsService.getFileForDownload(id, versionId, user, this.getMeta(request));
    response.setHeader("Content-Type", file.version.mimeType);
    response.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(file.version.originalFileName)}`,
    );
    return new StreamableFile(file.stream);
  }

  @Get(":id/preview")
  async preview(
    @Param("id") id: string,
    @Query("versionId") versionId: string | undefined,
    @CurrentUser() user: PublicUser,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.documentsService.getFileForPreview(id, versionId, user, this.getMeta(request));
    response.setHeader("Content-Type", file.version.mimeType);
    response.setHeader(
      "Content-Disposition",
      `inline; filename*=UTF-8''${encodeURIComponent(file.version.originalFileName)}`,
    );
    return new StreamableFile(file.stream);
  }

  @Delete(":id")
  @Roles(UserRole.ADMIN)
  remove(@Param("id") id: string, @CurrentUser() user: PublicUser, @Req() request: AuthenticatedRequest) {
    return this.documentsService.remove(id, user, this.getMeta(request));
  }

  @Post(":id/restore")
  @Roles(UserRole.ADMIN)
  restore(@Param("id") id: string, @CurrentUser() user: PublicUser, @Req() request: AuthenticatedRequest) {
    return this.documentsService.restore(id, user, this.getMeta(request));
  }

  @Delete(":id/permanent")
  @Roles(UserRole.ADMIN)
  permanentlyDelete(@Param("id") id: string) {
    return this.documentsService.permanentlyDelete(id);
  }

  private getMeta(request: AuthenticatedRequest) {
    return {
      ip: request.ip,
      userAgent: request.headers["user-agent"],
    };
  }
}
