import { ApiPropertyOptional } from "@nestjs/swagger";
import { BusinessMatterStatus, BusinessMatterType } from "@prisma/client";
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from "class-validator";

export class UpdateBusinessMatterDto {
  @ApiPropertyOptional()
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ enum: BusinessMatterType })
  @IsOptional()
  @IsEnum(BusinessMatterType)
  type?: BusinessMatterType;

  @ApiPropertyOptional({ enum: BusinessMatterStatus })
  @IsOptional()
  @IsEnum(BusinessMatterStatus)
  status?: BusinessMatterStatus;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  parentId?: string | null;

  @ApiPropertyOptional()
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  ownerId?: string | null;

  @ApiPropertyOptional({ nullable: true, description: "业务展示用的自定义负责人名称" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  ownerName?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  departmentId?: string | null;

  @ApiPropertyOptional({ nullable: true, description: "当前事项的自定义部门名称，与 departmentId 二选一" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  departmentName?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  partnerId?: string | null;

  @ApiPropertyOptional({ nullable: true, description: "当前事项的自定义合作单位名称，与 partnerId 二选一" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  partnerName?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsDateString()
  startDate?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsDateString()
  endDate?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999999999.99)
  amount?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remark?: string | null;
}
