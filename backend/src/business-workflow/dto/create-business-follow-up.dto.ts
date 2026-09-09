import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { BusinessFollowUpMethod } from "@prisma/client";
import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateBusinessFollowUpDto {
  @ApiProperty({ enum: BusinessFollowUpMethod })
  @IsEnum(BusinessFollowUpMethod)
  method!: BusinessFollowUpMethod;

  @ApiProperty({ description: "本次跟进内容" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  content!: string;

  @ApiPropertyOptional({ description: "本次跟进结果" })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  result?: string | null;

  @ApiPropertyOptional({ description: "下一步动作" })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  nextAction?: string | null;

  @ApiPropertyOptional({ description: "下一次跟进责任人" })
  @IsOptional()
  @IsString()
  nextAssigneeId?: string | null;

  @ApiPropertyOptional({ description: "下一次跟进时间" })
  @IsOptional()
  @IsDateString()
  nextDueAt?: string | null;
}
