import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Length, Matches, Min } from "class-validator";

export class CreateCategoryDto {
  @ApiProperty({ example: "供应商合同" })
  @IsString()
  @Length(1, 50)
  name!: string;

  @ApiPropertyOptional({ description: "Parent category ID. Empty means creating a primary category." })
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiPropertyOptional({ description: "Document number prefix for primary categories", example: "XZ" })
  @IsOptional()
  @IsString()
  @Length(2, 12)
  @Matches(/^[A-Za-z0-9_-]+$/)
  code?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort = 0;
}
