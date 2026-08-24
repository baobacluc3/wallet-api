// dto/transfer.dto.ts
import {
  IsInt,
  IsPositive,
  IsUUID,
  IsString,
  IsNotEmpty,
} from 'class-validator';

export class TransferDto {
  @IsUUID()
  fromWalletId: number;

  @IsUUID()
  toWalletId: number;

  @IsInt()
  @IsPositive()
  amount: number;

  @IsString()
  @IsNotEmpty()
  idempotencyKey: string;
}
