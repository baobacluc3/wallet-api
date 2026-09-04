import {
  IsUUID,
  IsInt,
  Min,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import { PrimaryGeneratedColumn } from 'typeorm';

export class DepositDto {
  @PrimaryGeneratedColumn()
  walletId: number;

  @IsInt({ message: 'Amount must be an integer (cents)' })
  @Min(1, { message: 'Amount must be greater than zero' })
  amountCents: string;

  @IsOptional()
  @IsString()
  @Length(1, 128)
  idempotencyKey?: string; //prevent accidentally processing the same deposit twice.

  @IsOptional()
  @IsString()
  @Length(1, 64)
  referenceId?: string; //store an external/reference transaction ID.
}
