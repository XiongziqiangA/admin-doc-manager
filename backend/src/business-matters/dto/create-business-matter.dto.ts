import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { BusinessMatterStatus, BusinessMatterType } from "@prisma/client";
import { IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class CreateBusinessMatterDto {
  @ApiProperty({ description: "事项名称" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiProperty({ enum: BusinessMatterType })
  @IsEnum(BusinessMatterType)
  type!: BusinessMatterType;

  @ApiPropertyOptional({ enum: BusinessMatterStatus, default: BusinessMatterStatus.PLANNING })
  @IsOptional()
  @IsEnum(BusinessMatterStatus)
  status?: BusinessMatterStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiPropertyOptional({ description: "负责人，不填时默认为当前用户" })
  @IsOptional()
  @IsString()
  ownerId?: string;

  @ApiPropertyOptional({ description: "业务展示用的自定义负责人名称；系统权限负责人仍由 ownerId 控制" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  ownerName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  departmentId?: string;

  @ApiPropertyOptional({ description: "当前事项的自定义部门名称，与 departmentId 二选一" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  departmentName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  partnerId?: string;

  @ApiPropertyOptional({ description: "当前事项的自定义合作单位名称，与 partnerId 二选一" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  partnerName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: "可选金额，最多两位小数" })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999999999.99)
  amount?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remark?: string;
}
