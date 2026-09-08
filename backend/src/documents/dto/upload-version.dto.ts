import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, Length } from "class-validator";

export class UploadVersionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 500)
  changeNote?: string;
}
