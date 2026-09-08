import { ApiPropertyOptional } from "@nestjs/swagger";
import { FinanceMaterialType } from "@prisma/client";
import { Type } from "class-transformer";
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class ListFinanceCandidatesDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 50;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ description: "一级分类 ID" })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ description: "选中分类节点 ID，包含其下级分类" })
  @IsOptional()
  @IsString()
  subcategoryId?: string;

  @ApiPropertyOptional({ description: "部门 ID" })
  @IsOptional()
  @IsString()
  departmentId?: string;

  @ApiPropertyOptional({ description: "标签 ID" })
  @IsOptional()
  @IsString()
  tagId?: string;

  @ApiPropertyOptional({ enum: FinanceMaterialType })
  @IsOptional()
  @IsEnum(FinanceMaterialType)
  materialType?: FinanceMaterialType;

  @ApiPropertyOptional({ description: "上传起始日期" })
  @IsOptional()
  @IsDateString()
  uploadedFrom?: string;

  @ApiPropertyOptional({ description: "上传结束日期" })
  @IsOptional()
  @IsDateString()
  uploadedTo?: string;
}
