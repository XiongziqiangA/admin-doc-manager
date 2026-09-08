import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { UserRole, UserStatus } from "@prisma/client";
import { IsEmail, IsEnum, IsOptional, IsString, Length } from "class-validator";

export class CreateUserDto {
  @ApiProperty({ example: "zhangsan" })
  @IsString()
  @Length(3, 50)
  username!: string;

  @ApiProperty({ example: "ChangeMe123!" })
  @IsString()
  @Length(6, 128)
  password!: string;

  @ApiProperty({ example: "张三" })
  @IsString()
  @Length(1, 50)
  realName!: string;

  @ApiProperty({ enum: UserRole, default: UserRole.EMPLOYEE })
  @IsEnum(UserRole)
  role: UserRole = UserRole.EMPLOYEE;

  @ApiPropertyOptional({ enum: UserStatus, default: UserStatus.ACTIVE })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  departmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 30)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;
}
