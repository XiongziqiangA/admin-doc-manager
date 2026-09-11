import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsNumber, IsObject, IsOptional, Max, Min } from "class-validator";

export class CreatePendingAssetDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  rawPayload: Record<string, unknown> = {};

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  aiFields?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;
}
