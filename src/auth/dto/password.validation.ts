import { applyDecorators } from '@nestjs/common';
import {
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Shared password policy for registration and password changes. */
export function Password() {
  return applyDecorators(
    IsString(),
    MinLength(12),
    MaxLength(128),
    Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[^\u0000]+$/, {
      message:
        'Password must contain upper case, lower case, and a number, and cannot contain null bytes',
    }),
  );
}
