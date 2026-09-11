import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";

export class AssignAssetAnomalyDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  assignedToId?: string | null;
}
