import { ApiProperty } from "@nestjs/swagger";
import { IsString, Length } from "class-validator";

export class LoginDto {
  @ApiProperty({ example: "admin" })
  @IsString()
  @Length(3, 50)
  username!: string;

  @ApiProperty({ example: "ChangeMe123!" })
  @IsString()
  @Length(6, 128)
  password!: string;
}
