import { IsJWT, IsOptional, IsString } from 'class-validator';

export class LogoutDto {
  @IsOptional()
  @IsString()
  @IsJWT()
  refreshToken?: string;
}
