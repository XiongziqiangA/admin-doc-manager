import { ApiPropertyOptional } from "@nestjs/swagger";
import { AssetMaintenanceStatus, AssetMaintenanceType } from "@prisma/client";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class ListAssetMaintenanceDto {
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

  @ApiPropertyOptional({ enum: AssetMaintenanceStatus })
  @IsOptional()
  @IsEnum(AssetMaintenanceStatus)
  status?: AssetMaintenanceStatus;

  @ApiPropertyOptional({ enum: AssetMaintenanceType })
  @IsOptional()
  @IsEnum(AssetMaintenanceType)
  maintenanceType?: AssetMaintenanceType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assetId?: string;
}
