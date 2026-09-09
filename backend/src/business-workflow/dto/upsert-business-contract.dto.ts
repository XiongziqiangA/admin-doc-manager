import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { BusinessContractStatus } from "@prisma/client";
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class UpsertBusinessContractDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  contractNo?: string | null;

  @ApiProperty({ description: "合同相对方" })
  @IsString()
  @MaxLength(200)
  partyName!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsDateString()
  signedAt?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsDateString()
  effectiveAt?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;

  @ApiPropertyOptional({ default: 30 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(3650)
  renewalNoticeDays?: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999999999.99)
  amount?: number | null;

  @ApiPropertyOptional({ enum: BusinessContractStatus })
  @IsOptional()
  @IsEnum(BusinessContractStatus)
  status?: BusinessContractStatus;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  remark?: string | null;
}
