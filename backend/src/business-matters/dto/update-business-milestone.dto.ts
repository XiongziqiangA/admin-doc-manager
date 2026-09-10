import { ApiPropertyOptional } from "@nestjs/swagger";
import { BusinessMilestoneStatus } from "@prisma/client";
import { IsDateString, IsEnum, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateBusinessMilestoneDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  stageId?: string | null;

  @ApiPropertyOptional({ enum: BusinessMilestoneStatus })
  @IsOptional()
  @IsEnum(BusinessMilestoneStatus)
  status?: BusinessMilestoneStatus;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  ownerId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  ownerName?: string | null;
}
