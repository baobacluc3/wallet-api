import { IsInt, Min, IsOptional, IsString, Length } from 'class-validator';
import { Type } from 'class-transformer';

export class DepositDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  walletId: number;

  @Type(() => Number)
  @IsInt({ message: 'Amount must be an integer (cents)' })
  @Min(1, { message: 'Amount must be greater than zero' })
  amountCents: number;

  @IsOptional()
  @IsString()
  @Length(1, 128)
  idempotencyKey?: string; //prevent accidentally processing the same deposit twice.

  @IsOptional()
  @IsString()
  @Length(1, 64)
  referenceId?: string; //store an external/reference transaction ID.
}
