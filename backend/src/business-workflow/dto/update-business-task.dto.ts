import { ApiPropertyOptional } from "@nestjs/swagger";
import { BusinessTaskPriority, BusinessTaskStatus } from "@prisma/client";
import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateIf } from "class-validator";

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

  @ApiPropertyOptional({ enum: BusinessTaskStatus })
  @IsOptional()
  @IsEnum(BusinessTaskStatus)
  status?: BusinessTaskStatus;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  assigneeId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsDateString()
  dueDate?: string | null;
}
