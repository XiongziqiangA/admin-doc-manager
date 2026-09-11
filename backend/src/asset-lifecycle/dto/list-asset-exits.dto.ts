import { ApiPropertyOptional } from "@nestjs/swagger";
import { AssetExitStatus, AssetExitType } from "@prisma/client";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class ListAssetExitsDto {
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

  @ApiPropertyOptional({ enum: AssetExitStatus })
  @IsOptional()
  @IsEnum(AssetExitStatus)
  status?: AssetExitStatus;

  @ApiPropertyOptional({ enum: AssetExitType })
  @IsOptional()
  @IsEnum(AssetExitType)
  exitType?: AssetExitType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assetId?: string;
}
