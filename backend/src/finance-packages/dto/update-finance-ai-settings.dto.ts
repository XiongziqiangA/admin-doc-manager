import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString, IsUrl, Length } from "class-validator";

export class UpdateFinanceAiSettingsDto {
  @ApiProperty({ description: "是否启用财务智能识别" })
  @IsBoolean()
  enabled!: boolean;

  @ApiProperty({ example: "https://proxy.example/v1", description: "OpenAI 兼容中转站的基础地址" })
  @IsString()
  @Length(1, 500)
  @IsUrl({ require_protocol: true, protocols: ["http", "https"], require_tld: false })
  baseUrl!: string;

  @ApiProperty({ example: "gpt-4o-mini", description: "中转站实际提供的模型名称" })
  @IsString()
  @Length(1, 120)
  model!: string;

  @ApiPropertyOptional({ writeOnly: true, description: "新 API Key；留空表示保留当前 Key" })
  @IsOptional()
  @IsString()
  @Length(1, 500)
  apiKey?: string;

  @ApiPropertyOptional({ default: false, description: "是否清除已保存的 API Key" })
  @IsOptional()
  @IsBoolean()
  clearApiKey?: boolean;
}
