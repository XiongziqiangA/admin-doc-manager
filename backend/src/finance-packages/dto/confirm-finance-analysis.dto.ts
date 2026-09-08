import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { FinanceMaterialType } from "@prisma/client";
import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  ValidateIf,
  ValidateNested,
} from "class-validator";

export enum FinanceSuggestionDecision {
  CONFIRM = "CONFIRM",
  REJECT = "REJECT",
}

export class FinanceSuggestionDecisionDto {
  @ApiProperty()
  @IsUUID()
  suggestionId!: string;

  @ApiProperty({ enum: FinanceSuggestionDecision })
  @IsEnum(FinanceSuggestionDecision)
  decision!: FinanceSuggestionDecision;

  @ApiPropertyOptional({ nullable: true, description: "人工指定的交付目录；null 表示放入总目录" })
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  groupId?: string | null;

  @ApiPropertyOptional({ description: "没有选择已有目录时，人工修改或确认的新目录名称" })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  groupName?: string;

  @ApiPropertyOptional({ enum: FinanceMaterialType })
  @IsOptional()
  @IsEnum(FinanceMaterialType)
  materialType?: FinanceMaterialType;

  @ApiPropertyOptional({ description: "本次导出的文件名" })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  exportFileName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 500)
  remark?: string;
}

export class ConfirmFinanceAnalysisDto {
  @ApiProperty({ type: [FinanceSuggestionDecisionDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => FinanceSuggestionDecisionDto)
  suggestions!: FinanceSuggestionDecisionDto[];

  @ApiPropertyOptional({ default: true, description: "确认没有匹配的已有目录时，是否创建建议的一级事项目录" })
  @IsOptional()
  @IsBoolean()
  createGroups = true;
}
