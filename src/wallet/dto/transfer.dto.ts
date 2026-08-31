// dto/transfer.dto.ts
import {
  IsInt,
  IsPositive,
  IsString,
  IsNotEmpty,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';

export class TransferDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  fromWalletId: number;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  toWalletId: number;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  idempotencyKey: string;
}
