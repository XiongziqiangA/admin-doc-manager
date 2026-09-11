import { ApiPropertyOptional } from "@nestjs/swagger";
import { AssetReservationStatus } from "@prisma/client";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class ListAssetReservationsDto {
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

  @ApiPropertyOptional({ enum: AssetReservationStatus })
  @IsOptional()
  @IsEnum(AssetReservationStatus)
  status?: AssetReservationStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assetId?: string;
}
