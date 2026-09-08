import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { FinanceMaterialType } from "@prisma/client";
import { Type } from "class-transformer";
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateIf,
} from "class-validator";

export class AddFinancePackageItemsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  documentIds!: string[];

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  groupId?: string | null;

  @ApiPropertyOptional({ enum: FinanceMaterialType })
  @IsOptional()
  @IsEnum(FinanceMaterialType)
  materialType?: FinanceMaterialType;
}

export class UpdateFinancePackageItemDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  groupId?: string | null;

  @ApiPropertyOptional({ enum: FinanceMaterialType })
  @IsOptional()
  @IsEnum(FinanceMaterialType)
  materialType?: FinanceMaterialType;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @Length(1, 200)
  exportFileName?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  sort?: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @Length(0, 500)
  remark?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  useLatestVersion?: boolean;
}
