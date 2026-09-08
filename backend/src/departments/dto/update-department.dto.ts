import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, Length } from "class-validator";

export class UpdateDepartmentDto {
  @ApiPropertyOptional({ example: "行政部" })
  @IsOptional()
  @IsString()
  @Length(1, 50)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiPropertyOptional({ example: "负责人：张三" })
  @IsOptional()
  @IsString()
  @Length(0, 200)
  managerNote?: string;
}
