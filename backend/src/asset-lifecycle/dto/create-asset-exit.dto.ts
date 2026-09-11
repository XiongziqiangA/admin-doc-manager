import { ApiProperty } from "@nestjs/swagger";
import { AssetExitType } from "@prisma/client";
import { IsEnum, IsNotEmpty, IsString, MaxLength } from "class-validator";

export class CreateAssetExitDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  assetId!: string;

  @ApiProperty({ enum: AssetExitType })
  @IsEnum(AssetExitType)
  exitType!: AssetExitType;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reason!: string;
}
