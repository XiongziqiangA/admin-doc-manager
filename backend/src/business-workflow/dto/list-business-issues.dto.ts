import { ApiPropertyOptional } from "@nestjs/swagger";
import { BusinessIssueKind, BusinessIssueSeverity, BusinessIssueStatus } from "@prisma/client";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class ListBusinessIssuesDto {
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

  @ApiPropertyOptional({ enum: BusinessIssueKind })
  @IsOptional()
  @IsEnum(BusinessIssueKind)
  kind?: BusinessIssueKind;

  @ApiPropertyOptional({ enum: BusinessIssueSeverity })
  @IsOptional()
  @IsEnum(BusinessIssueSeverity)
  severity?: BusinessIssueSeverity;

  @ApiPropertyOptional({ enum: BusinessIssueStatus })
  @IsOptional()
  @IsEnum(BusinessIssueStatus)
  status?: BusinessIssueStatus;

  @ApiPropertyOptional({ description: "按系统责任人筛选" })
  @IsOptional()
  @IsString()
  ownerId?: string;
}
