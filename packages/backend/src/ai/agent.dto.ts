import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export enum AgentMessageRole {
  System = 'system',
  User = 'user',
  Assistant = 'assistant',
  Tool = 'tool',
}

export class AgentMessageDto {
  @IsEnum(AgentMessageRole)
  role!: AgentMessageRole;

  @IsString()
  @MaxLength(100_000)
  content!: string;
}

export class AgentCompletionDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => AgentMessageDto)
  messages!: AgentMessageDto[];

  @IsOptional()
  @IsBoolean()
  stream?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(32_000)
  max_tokens?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(32)
  @IsObject({ each: true })
  tools?: Record<string, unknown>[];
}
