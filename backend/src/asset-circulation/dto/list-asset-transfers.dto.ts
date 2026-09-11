import { ApiPropertyOptional } from "@nestjs/swagger";
import { AssetTransferStatus } from "@prisma/client";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class ListAssetTransfersDto {
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

  @ApiPropertyOptional({ enum: AssetTransferStatus })
  @IsOptional()
  @IsEnum(AssetTransferStatus)
  status?: AssetTransferStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assetId?: string;
}
