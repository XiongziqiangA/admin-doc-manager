import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { IsIn, IsInt, IsOptional, Min } from "class-validator";

import { CreateAssetDto } from "./create-asset.dto";

export class UpdateAssetDto extends PartialType(CreateAssetDto) {
  @ApiProperty({ description: "客户端读取到的资产版本号，用于防止覆盖他人修改" })
  @IsInt()
  @Min(1)
  version!: number;

  @ApiPropertyOptional({ enum: ["active", "pending", "unavailable", "archived"] })
  @IsOptional()
  @IsIn(["active", "pending", "unavailable", "archived"])
  assetStatus?: string;

  @ApiPropertyOptional({ enum: ["available", "reserved", "borrowed", "transferring", "unavailable", "return_pending"] })
  @IsOptional()
  @IsIn(["available", "reserved", "borrowed", "transferring", "unavailable", "return_pending"])
  resourceStatus?: string;
}
