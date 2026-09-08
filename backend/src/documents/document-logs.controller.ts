import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";

import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { ListDocumentsDto } from "./dto/list-documents.dto";
import { DocumentsService } from "./documents.service";

@ApiTags("document-logs")
@ApiBearerAuth()
@Controller("document-logs")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class DocumentLogsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  list(@Query() query: ListDocumentsDto) {
    return this.documentsService.listLogs(query);
  }
}
