import {
  IsUUID,
  IsInt,
  Min,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export class WithdrawDto {
  @IsUUID()
  walletId: number;

  @IsInt({ message: 'Amount must be an integer (cents)' })
  @Min(1, { message: 'Amount must be greater than zero' })
  amount: number;

  @IsOptional()
  @IsString()
  @Length(1, 128)
  idempotencyKey?: string; //prevent accidentally processing the same deposit twice.
}
