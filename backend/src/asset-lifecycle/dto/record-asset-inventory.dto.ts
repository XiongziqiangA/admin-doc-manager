import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class RecordAssetInventoryDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  assetId!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  checkedLocationId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  checkedAssetStatus?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  checkedOwnerId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
