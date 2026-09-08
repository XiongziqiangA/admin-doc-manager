import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { PartnerStatus, PartnerType } from "@prisma/client";
import { IsEmail, IsEnum, IsOptional, IsString, Length } from "class-validator";

export class CreatePartnerDto {
  @ApiProperty({ example: "北京某某科技有限公司" })
  @IsString()
  @Length(1, 100)
  companyName!: string;

  @ApiProperty({ enum: PartnerType })
  @IsEnum(PartnerType)
  type!: PartnerType;

  @ApiPropertyOptional({ example: "李四" })
  @IsOptional()
  @IsString()
  @Length(0, 50)
  contactName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 30)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 200)
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 500)
  remark?: string;

  @ApiPropertyOptional({ enum: PartnerStatus, default: PartnerStatus.ACTIVE })
  @IsOptional()
  @IsEnum(PartnerStatus)
  status?: PartnerStatus;
}
