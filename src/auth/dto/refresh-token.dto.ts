import { IsString, Matches } from 'class-validator';

export class RefreshTokenDto {
  @IsString()
  @Matches(/^[a-f0-9]{128}$/)
  refreshToken: string;
}
