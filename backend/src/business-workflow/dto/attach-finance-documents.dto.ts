import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ArrayNotEmpty, ArrayUnique, IsOptional, IsString, MaxLength } from "class-validator";

export class AttachFinanceDocumentsDto {
  @ApiProperty({ type: [String] })
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsString({ each: true })
  documentIds!: string[];

  @ApiPropertyOptional({ default: "VOUCHER" })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  relationType?: string;
}
