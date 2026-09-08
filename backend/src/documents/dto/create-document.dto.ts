import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsArray, IsOptional, IsString, Length } from "class-validator";

import { toStringArray } from "./field-transforms";

export class CreateDocumentDto {
  @ApiPropertyOptional({ description: "Defaults to the original uploaded file name." })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  title?: string;

  @ApiPropertyOptional({ description: "Generated automatically when omitted." })
  @IsOptional()
  @IsString()
  @Length(1, 80)
  documentNo?: string;

  @ApiProperty()
  @IsString()
  categoryId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subcategoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  departmentId?: string;

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
  changeNote?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 500)
  remark?: string;
}
