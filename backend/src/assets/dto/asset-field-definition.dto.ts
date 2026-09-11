import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsArray, IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength } from "class-validator";

export class AssetFieldDefinitionDto {
  @ApiProperty()
  @IsString()
  @Matches(/^[A-Za-z][A-Za-z0-9_]*$/)
  @MaxLength(50)
  key!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ enum: ["text", "number", "date", "select", "boolean"] })
  @IsIn(["text", "number", "date", "select", "boolean"])
  type!: "text" | "number" | "date" | "select" | "boolean";

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  required = false;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  options?: string[];
}
