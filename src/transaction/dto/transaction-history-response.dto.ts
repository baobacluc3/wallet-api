import { ApiProperty } from '@nestjs/swagger';
import {
  TransactionStatus,
  TransactionType,
} from '../entities/transaction.entity';

export class TransactionHistoryItemDto {
  @ApiProperty({ example: 42 })
  id: number;

  @ApiProperty({ enum: TransactionType, example: TransactionType.CREDIT })
  type: TransactionType;

  @ApiProperty({
    description: 'Amount in the wallet currency minor unit.',
    example: 2500,
  })
  amountCents: number;

  @ApiProperty({
    enum: TransactionStatus,
    example: TransactionStatus.COMPLETED,
  })
  status: TransactionStatus;

  @ApiProperty({ example: '2026-09-05T12:30:00.000Z' })
  createdAt: Date;
}

export class TransactionHistoryMetaDto {
  @ApiProperty({ example: 42 })
  total: number;

  @ApiProperty({ example: 2 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 3 })
  totalPages: number;
}

export class TransactionHistoryResponseDto {
  @ApiProperty({ type: () => [TransactionHistoryItemDto] })
  data: TransactionHistoryItemDto[];

  @ApiProperty({ type: () => TransactionHistoryMetaDto })
  meta: TransactionHistoryMetaDto;
}
