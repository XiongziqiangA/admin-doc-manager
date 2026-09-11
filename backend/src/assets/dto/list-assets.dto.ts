import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class ListAssetsDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assetTypeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  departmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  locationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  businessMatterId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assetStatus?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  resourceStatus?: string;

  @ApiPropertyOptional({ default: "updatedAt" })
  @IsOptional()
  @IsIn(["updatedAt", "createdAt", "name", "assetCode", "purchaseAmount"])
  sortBy = "updatedAt";

  @ApiPropertyOptional({ default: "desc" })
  @IsOptional()
  @IsIn(["asc", "desc"])
  sortOrder: "asc" | "desc" = "desc";
}
