import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { BusinessFinanceKind, BusinessFinanceStatus } from "@prisma/client";
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class CreateBusinessFinanceRecordDto {
  @ApiProperty({ enum: BusinessFinanceKind })
  @IsEnum(BusinessFinanceKind)
  kind!: BusinessFinanceKind;

  @ApiProperty({ description: "记录标题" })
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiProperty({ description: "金额，最多两位小数" })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999999999.99)
  amount!: number;

  @ApiPropertyOptional({ default: "CNY" })
  @IsOptional()
  @IsString()
  @MaxLength(12)
  currency?: string;

  @ApiPropertyOptional({ description: "申请人；不填时使用当前用户" })
  @IsOptional()
  @IsString()
  applicantId?: string;

  @ApiPropertyOptional({ description: "经办负责人；不填时使用当前用户" })
  @IsOptional()
  @IsString()
  handlerId?: string;

  @ApiPropertyOptional({ description: "审批负责人" })
  @IsOptional()
  @IsString()
  approverId?: string | null;

  @ApiPropertyOptional({ description: "付款负责人" })
  @IsOptional()
  @IsString()
  payerId?: string | null;

  @ApiPropertyOptional({ description: "结算负责人" })
  @IsOptional()
  @IsString()
  settlementOwnerId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  recordNo?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsDateString()
  occurredAt?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  counterparty?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @ApiPropertyOptional({ enum: BusinessFinanceStatus, default: BusinessFinanceStatus.DRAFT })
  @IsOptional()
  @IsEnum(BusinessFinanceStatus)
  status?: BusinessFinanceStatus;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsDateString()
  settledAt?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  remark?: string | null;

  @ApiPropertyOptional({ description: "拒绝原因" })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  rejectionReason?: string | null;

  @ApiPropertyOptional({ description: "结算说明" })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  settlementNote?: string | null;
}
