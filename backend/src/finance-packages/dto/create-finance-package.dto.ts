import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString, Length, Matches } from "class-validator";

export class CreateFinancePackageDto {
  @ApiProperty()
  @IsString()
  @Length(1, 100)
  name!: string;

  @ApiProperty({ example: "2026-08" })
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  period!: string;

  @ApiProperty()
  @IsString()
  @Length(1, 120)
  rootFolderName!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  includeManifest?: boolean;

  @ApiPropertyOptional({ description: "Copy only the folder structure from another task." })
  @IsOptional()
  @IsString()
  copyGroupsFromTaskId?: string;
}
