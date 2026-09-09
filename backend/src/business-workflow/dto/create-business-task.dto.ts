import { ApiPropertyOptional, ApiProperty } from "@nestjs/swagger";
import { BusinessTaskPriority, BusinessTaskStatus } from "@prisma/client";
import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

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

  @ApiPropertyOptional({ enum: BusinessTaskStatus, default: BusinessTaskStatus.TODO })
  @IsOptional()
  @IsEnum(BusinessTaskStatus)
  status?: BusinessTaskStatus;

  @ApiPropertyOptional({ description: "负责人，不填时使用事项负责人" })
  @IsOptional()
  @IsString()
  assigneeId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDate?: string | null;
}
