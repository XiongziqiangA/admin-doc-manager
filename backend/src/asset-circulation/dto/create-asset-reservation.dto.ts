import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateAssetReservationDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  assetId!: string;

  @ApiProperty()
  @IsDateString()
  startAt!: string;

  @ApiProperty()
  @IsDateString()
  endAt!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  purpose!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  businessMatterId?: string | null;
}
