import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, Length } from "class-validator";

export class CreateDepartmentDto {
  @ApiProperty({ example: "行政部" })
  @IsString()
  @Length(1, 50)
  name!: string;

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
