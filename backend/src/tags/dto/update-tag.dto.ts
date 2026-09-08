import { ApiProperty } from "@nestjs/swagger";
import { IsString, Length } from "class-validator";

export class UpdateTagDto {
  @ApiProperty({ example: "重要" })
  @IsString()
  @Length(1, 30)
  name!: string;
}
