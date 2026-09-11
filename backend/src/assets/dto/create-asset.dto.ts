import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class CreateAssetDto {
  @ApiProperty()
  @IsString()
  assetTypeId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  assetCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  departmentId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  locationId?: string | null;

  @ApiPropertyOptional({ description: "项目与事项中的项目 ID" })
  @IsOptional()
  @IsString()
  businessMatterId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ownerUserId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  usingUserId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  brand?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  model?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  serialNumber?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  supplier?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  purchaseDate?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999999999.99)
  purchaseAmount?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  customFields: Record<string, unknown> = {};

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;
}
