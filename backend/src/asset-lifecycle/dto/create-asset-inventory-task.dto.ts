import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { AssetInventoryScopeType } from "@prisma/client";
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

export class CreateAssetInventoryTaskDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ enum: AssetInventoryScopeType })
  @IsEnum(AssetInventoryScopeType)
  scopeType!: AssetInventoryScopeType;

  @ApiPropertyOptional({ description: "部门、位置、项目或资产类型 ID" })
  @IsOptional()
  @IsString()
  scopeId?: string;

  @ApiPropertyOptional({ type: [String], description: "指定资产清单" })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsString({ each: true })
  assetIds?: string[];

  @ApiProperty()
  @IsDateString()
  plannedStart!: string;

  @ApiProperty()
  @IsDateString()
  plannedEnd!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  ownerId!: string;
}
