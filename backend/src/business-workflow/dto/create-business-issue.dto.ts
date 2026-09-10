import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { BusinessIssueKind, BusinessIssueSeverity, BusinessIssueStatus } from "@prisma/client";
import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateBusinessIssueDto {
  @ApiProperty({ enum: BusinessIssueKind })
  @IsEnum(BusinessIssueKind)
  kind!: BusinessIssueKind;

  @ApiProperty({ description: "风险或问题标题" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ description: "具体描述" })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string | null;

  @ApiPropertyOptional({ enum: BusinessIssueSeverity, default: BusinessIssueSeverity.MEDIUM })
  @IsOptional()
  @IsEnum(BusinessIssueSeverity)
  severity?: BusinessIssueSeverity;

  @ApiPropertyOptional({ enum: BusinessIssueStatus, default: BusinessIssueStatus.OPEN })
  @IsOptional()
  @IsEnum(BusinessIssueStatus)
  status?: BusinessIssueStatus;

  @ApiPropertyOptional({ description: "系统账号责任人" })
  @IsOptional()
  @IsString()
  ownerId?: string | null;

  @ApiPropertyOptional({ description: "自定义责任人名称，与 ownerId 二选一" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  ownerName?: string | null;

  @ApiPropertyOptional({ description: "处理截止日期" })
  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @ApiPropertyOptional({ description: "解决方案或处理结果" })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  resolution?: string | null;
}
