import { ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { IsBoolean, IsOptional } from "class-validator";

import { CreateAssetTypeDto } from "./create-asset-type.dto";

export class UpdateAssetTypeDto extends PartialType(CreateAssetTypeDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
