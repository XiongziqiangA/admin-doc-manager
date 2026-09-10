import { ApiPropertyOptional, ApiProperty } from "@nestjs/swagger";
import { BusinessTaskPriority, BusinessTaskStatus } from "@prisma/client";
import { IsDateString, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class CreateBusinessTaskDto {
  @ApiProperty({ description: "任务标题" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string | null;

  @ApiPropertyOptional({ enum: BusinessTaskPriority, default: BusinessTaskPriority.NORMAL })
  @IsOptional()
  @IsEnum(BusinessTaskPriority)
  priority?: BusinessTaskPriority;

  @ApiPropertyOptional({ minimum: 0, maximum: 100, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  progress?: number;

  @ApiPropertyOptional({ enum: BusinessTaskStatus, default: BusinessTaskStatus.TODO })
  @IsOptional()
  @IsEnum(BusinessTaskStatus)
  status?: BusinessTaskStatus;

  @ApiPropertyOptional({ description: "负责人，不填时使用事项负责人" })
  @IsOptional()
  @IsString()
  assigneeId?: string | null;

  @ApiPropertyOptional({ description: "自定义负责人名称；填写后不绑定系统账号" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  assigneeName?: string | null;

  @ApiPropertyOptional()
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
