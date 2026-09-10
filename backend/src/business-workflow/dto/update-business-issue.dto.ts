import { ApiPropertyOptional } from "@nestjs/swagger";
import { BusinessIssueKind, BusinessIssueSeverity, BusinessIssueStatus } from "@prisma/client";
import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateIf } from "class-validator";

export class UpdateBusinessIssueDto {
  @ApiPropertyOptional({ enum: BusinessIssueKind })
  @IsOptional()
  @IsEnum(BusinessIssueKind)
  kind?: BusinessIssueKind;

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

  @ApiPropertyOptional({ enum: BusinessIssueSeverity })
  @IsOptional()
  @IsEnum(BusinessIssueSeverity)
  severity?: BusinessIssueSeverity;

  @ApiPropertyOptional({ enum: BusinessIssueStatus })
  @IsOptional()
  @IsEnum(BusinessIssueStatus)
  status?: BusinessIssueStatus;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  ownerId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  ownerName?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  resolution?: string | null;
}
