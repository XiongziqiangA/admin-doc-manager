import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";

export class ListDepartmentsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  keyword?: string;
}
