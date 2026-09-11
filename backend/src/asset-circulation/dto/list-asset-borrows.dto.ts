import { ApiPropertyOptional } from "@nestjs/swagger";
import { AssetBorrowStatus } from "@prisma/client";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class ListAssetBorrowsDto {
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

  @ApiPropertyOptional({ enum: AssetBorrowStatus })
  @IsOptional()
  @IsEnum(AssetBorrowStatus)
  status?: AssetBorrowStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assetId?: string;
}
