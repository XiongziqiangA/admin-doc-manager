import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from "class-validator";

export class CreateAssetIdentifierDto {
  @ApiProperty()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]+$/)
  @MaxLength(50)
  identifierType!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  value!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isPrimary = false;
}
