import { ApiPropertyOptional } from "@nestjs/swagger";
import { BusinessFinanceKind, BusinessFinanceStatus } from "@prisma/client";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class ListBusinessFinanceRecordsDto {
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

  @ApiPropertyOptional({ enum: BusinessFinanceKind })
  @IsOptional()
  @IsEnum(BusinessFinanceKind)
  kind?: BusinessFinanceKind;

  @ApiPropertyOptional({ enum: BusinessFinanceStatus })
  @IsOptional()
  @IsEnum(BusinessFinanceStatus)
  status?: BusinessFinanceStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  keyword?: string;
}
