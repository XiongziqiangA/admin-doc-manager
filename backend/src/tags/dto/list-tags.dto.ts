import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";

export class ListTagsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  keyword?: string;
}
