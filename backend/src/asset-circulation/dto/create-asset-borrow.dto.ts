import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateAssetBorrowDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  assetId!: string;

  @ApiPropertyOptional({ description: "已通过的预约 ID" })
  @IsOptional()
  @IsString()
  reservationId?: string | null;

  @ApiProperty()
  @IsDateString()
  borrowStart!: string;

  @ApiProperty()
  @IsDateString()
  borrowEnd!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  purpose!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  businessMatterId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string | null;
}
