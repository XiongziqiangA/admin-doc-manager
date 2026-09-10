import { ApiPropertyOptional, ApiProperty } from "@nestjs/swagger";
import { BusinessStageStatus } from "@prisma/client";
import { IsDateString, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class CreateBusinessStageDto {
  @ApiProperty({ description: "阶段名称" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string | null;

  @ApiPropertyOptional({ enum: BusinessStageStatus, default: BusinessStageStatus.PLANNED })
  @IsOptional()
  @IsEnum(BusinessStageStatus)
  status?: BusinessStageStatus;

  @ApiPropertyOptional({ minimum: 0, maximum: 100, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  progress?: number;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sort?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string | null;

  @ApiPropertyOptional({ description: "系统账号负责人" })
  @IsOptional()
  @IsString()
  ownerId?: string | null;

  @ApiPropertyOptional({ description: "自定义负责人名称，与 ownerId 二选一" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  ownerName?: string | null;
}
