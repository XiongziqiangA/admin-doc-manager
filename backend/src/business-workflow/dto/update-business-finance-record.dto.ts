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
}
