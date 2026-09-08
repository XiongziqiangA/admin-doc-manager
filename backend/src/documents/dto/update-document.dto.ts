import { ApiPropertyOptional } from "@nestjs/swagger";
import { DocumentStatus } from "@prisma/client";
import { Transform } from "class-transformer";
import { IsArray, IsEnum, IsOptional, IsString, Length } from "class-validator";

import { toStringArray } from "./field-transforms";

export class UpdateDocumentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 80)
  documentNo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subcategoryId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  departmentId?: string | null;

  @ApiPropertyOptional({ enum: DocumentStatus })
  @IsOptional()
  @IsEnum(DocumentStatus)
  status?: DocumentStatus;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  tagIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  tagNames?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  partnerIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 500)
  remark?: string;
}
