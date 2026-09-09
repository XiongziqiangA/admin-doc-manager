import { ApiPropertyOptional } from "@nestjs/swagger";
import { BusinessMatterStatus, BusinessMatterType } from "@prisma/client";
import { Type } from "class-transformer";
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class ListBusinessMattersDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ enum: BusinessMatterType })
  @IsOptional()
  @IsEnum(BusinessMatterType)
  type?: BusinessMatterType;

  @ApiPropertyOptional({ enum: BusinessMatterStatus })
  @IsOptional()
  @IsEnum(BusinessMatterStatus)
  status?: BusinessMatterStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ownerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  departmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  partnerId?: string;

  @ApiPropertyOptional({ description: "只返回关联指定文件的事项" })
  @IsOptional()
  @IsString()
  documentId?: string;

  @ApiPropertyOptional({ default: "updatedAt" })
  @IsOptional()
  @IsIn(["createdAt", "updatedAt", "title", "matterNo", "type", "status"])
  sortBy = "updatedAt";

  @ApiPropertyOptional({ default: "desc" })
  @IsOptional()
  @IsIn(["asc", "desc"])
  sortOrder: "asc" | "desc" = "desc";
}
