import { ApiProperty } from "@nestjs/swagger";
import { ArrayNotEmpty, ArrayUnique, IsString } from "class-validator";

export class AttachAssetDocumentsDto {
  @ApiProperty({ type: [String], description: "已存在的文件 ID" })
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsString({ each: true })
  documentIds!: string[];
}
