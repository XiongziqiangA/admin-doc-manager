import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsArray, IsBoolean, IsOptional, IsString } from "class-validator";

export class ExportDocumentsDto {
  @ApiPropertyOptional({ description: "Document IDs to export. If omitted, categoryId is used." })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  documentIds?: string[];

  @ApiPropertyOptional({ description: "Category ID whose active documents should be exported." })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ description: "Reserved for future history-version export. Current export uses latest versions." })
  @IsOptional()
  @IsBoolean()
  includeHistory?: boolean;
}
