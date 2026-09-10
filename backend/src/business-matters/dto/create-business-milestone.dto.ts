import { ApiPropertyOptional, ApiProperty } from "@nestjs/swagger";
import { IsDateString, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateBusinessMilestoneDto {
  @ApiProperty({ description: "里程碑名称" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string | null;

  @ApiPropertyOptional({ description: "所属阶段" })
  @IsOptional()
  @IsString()
  stageId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

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
