import { IsString, MaxLength } from 'class-validator';
import { Password } from './password.validation';

export class ChangePasswordDto {
  @IsString()
  @MaxLength(128)
  currentPassword: string;

  @Password()
  newPassword: string;
}
