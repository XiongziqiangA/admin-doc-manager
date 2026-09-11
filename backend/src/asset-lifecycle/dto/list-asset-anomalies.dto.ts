import { ApiPropertyOptional } from "@nestjs/swagger";
import { AssetAnomalySeverity, AssetAnomalyStatus, AssetAnomalyType } from "@prisma/client";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class ListAssetAnomaliesDto {
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

  @ApiPropertyOptional({ enum: AssetAnomalyStatus })
  @IsOptional()
  @IsEnum(AssetAnomalyStatus)
  status?: AssetAnomalyStatus;

  @ApiPropertyOptional({ enum: AssetAnomalyType })
  @IsOptional()
  @IsEnum(AssetAnomalyType)
  type?: AssetAnomalyType;

  @ApiPropertyOptional({ enum: AssetAnomalySeverity })
  @IsOptional()
  @IsEnum(AssetAnomalySeverity)
  severity?: AssetAnomalySeverity;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assetId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assignedToId?: string;
}
