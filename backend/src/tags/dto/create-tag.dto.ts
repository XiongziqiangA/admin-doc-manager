import { ApiProperty } from "@nestjs/swagger";
import { IsString, Length } from "class-validator";

export class CreateTagDto {
  @ApiProperty({ example: "重要" })
  @IsString()
  @Length(1, 30)
  name!: string;
}
