import { ApiPropertyOptional } from "@nestjs/swagger";
import { ArrayMaxSize, ArrayUnique, IsArray, IsOptional, IsString } from "class-validator";

export class StartFinanceAnalysisDto {
  @ApiPropertyOptional({ type: [String], description: "要分析的文件 ID；不传则分析当前任务尚未归集的有效文件" })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  documentIds?: string[];
}
