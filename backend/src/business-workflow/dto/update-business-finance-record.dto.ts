import { ApiPropertyOptional } from "@nestjs/swagger";
import { BusinessFinanceKind, BusinessFinanceStatus } from "@prisma/client";
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from "class-validator";

export class UpdateBusinessFinanceRecordDto {
  @ApiPropertyOptional({ enum: BusinessFinanceKind })
  @IsOptional()
  @IsEnum(BusinessFinanceKind)
  kind?: BusinessFinanceKind;

  @ApiPropertyOptional()
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @ValidateIf((_, value) => value !== undefined)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999999999.99)
  amount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(12)
  currency?: string;

  @ApiPropertyOptional({ description: "申请人，仅管理员可调整" })
  @IsOptional()
  @IsString()
  applicantId?: string | null;

  @ApiPropertyOptional({ description: "经办负责人，仅管理员可调整" })
  @IsOptional()
  @IsString()
  handlerId?: string | null;

  @ApiPropertyOptional({ description: "审批负责人，仅管理员可调整" })
  @IsOptional()
  @IsString()
  approverId?: string | null;

  @ApiPropertyOptional({ description: "付款负责人，仅管理员可调整" })
  @IsOptional()
  @IsString()
  payerId?: string | null;

  @ApiPropertyOptional({ description: "结算负责人，仅管理员可调整" })
  @IsOptional()
  @IsString()
  settlementOwnerId?: string | null;

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

  @ApiPropertyOptional({ enum: BusinessFinanceStatus })
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
