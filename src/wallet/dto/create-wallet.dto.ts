import { IsOptional, IsString, Length, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateWalletDto {
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Length(3, 3)
  @Matches(/^[A-Z]{3}$/)
  currency = 'USD';
}
