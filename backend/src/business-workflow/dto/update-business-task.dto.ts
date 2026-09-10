import { ApiPropertyOptional } from "@nestjs/swagger";
import { BusinessTaskPriority, BusinessTaskStatus } from "@prisma/client";
import { IsDateString, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from "class-validator";

export class UpdateBusinessTaskDto {
  @ApiPropertyOptional()
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string | null;

  @ApiPropertyOptional({ enum: BusinessTaskPriority })
  @IsOptional()
  @IsEnum(BusinessTaskPriority)
  priority?: BusinessTaskPriority;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  progress?: number;

  @ApiPropertyOptional({ enum: BusinessTaskStatus })
  @IsOptional()
  @IsEnum(BusinessTaskStatus)
  status?: BusinessTaskStatus;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  assigneeId?: string | null;

  @ApiPropertyOptional({ nullable: true, description: "自定义负责人名称；与 assigneeId 二选一" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  assigneeName?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @ApiPropertyOptional({ description: "完成任务时的结果说明" })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  completionNote?: string | null;

  @ApiPropertyOptional({ description: "取消任务时的原因" })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  cancellationReason?: string | null;
}
