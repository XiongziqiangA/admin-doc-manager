import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsOptional, IsString } from "class-validator";

export class ResponsibilityReportDto {
  @ApiPropertyOptional({ description: "统计开始日期" })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: "统计结束日期" })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ description: "只查看指定员工" })
  @IsOptional()
  @IsString()
  userId?: string;
}
