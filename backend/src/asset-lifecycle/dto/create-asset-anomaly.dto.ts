import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { AssetAnomalySeverity, AssetAnomalyType } from "@prisma/client";
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateAssetAnomalyDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  assetId!: string;

  @ApiProperty({ enum: AssetAnomalyType })
  @IsEnum(AssetAnomalyType)
  type!: AssetAnomalyType;

  @ApiPropertyOptional({ enum: AssetAnomalySeverity, default: AssetAnomalySeverity.MEDIUM })
  @IsOptional()
  @IsEnum(AssetAnomalySeverity)
  severity?: AssetAnomalySeverity;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  description!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assignedToId?: string;
}
