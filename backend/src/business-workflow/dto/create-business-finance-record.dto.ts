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
}
