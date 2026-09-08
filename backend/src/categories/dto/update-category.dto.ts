import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Length, Matches, Min } from "class-validator";

export class UpdateCategoryDto {
  @ApiPropertyOptional({ example: "供应商合同" })
  @IsOptional()
  @IsString()
  @Length(1, 50)
  name?: string;

  @ApiPropertyOptional({ description: "Document number prefix for primary categories", example: "XZ" })
  @IsOptional()
  @IsString()
  @Length(2, 12)
  @Matches(/^[A-Za-z0-9_-]+$/)
  code?: string;

  @ApiPropertyOptional({ description: "Parent category ID for secondary categories" })
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort?: number;
}
