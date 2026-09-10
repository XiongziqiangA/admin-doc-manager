import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ArrayMinSize, ArrayUnique, IsArray, IsOptional, IsString } from "class-validator";

export class AttachBusinessDocumentsDto {
  @ApiProperty({ type: [String], description: "要关联的文件 ID" })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  documentIds!: string[];

  @ApiPropertyOptional({ default: "ATTACHMENT" })
  @IsOptional()
  @IsString()
  relationType?: string;
}
