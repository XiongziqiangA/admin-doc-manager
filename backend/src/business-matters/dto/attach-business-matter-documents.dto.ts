import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ArrayNotEmpty, ArrayUnique, IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";

export class AttachBusinessMatterDocumentsDto {
  @ApiProperty({ type: [String], description: "已存在的文件 ID" })
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsString({ each: true })
  documentIds!: string[];

  @ApiPropertyOptional({ default: "REFERENCE" })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  relationType?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
