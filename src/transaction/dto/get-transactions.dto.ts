import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum TransactionHistoryType {
  DEPOSIT = 'deposit',
  WITHDRAW = 'withdraw',
  TRANSFER = 'transfer',
}

export enum TransactionHistorySortBy {
  CREATED_AT = 'createdAt',
  AMOUNT = 'amount',
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export class GetTransactionsDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({ enum: TransactionHistoryType })
  @IsOptional()
  @IsEnum(TransactionHistoryType)
  type?: TransactionHistoryType;

  @ApiPropertyOptional({
    description:
      'Inclusive ISO 8601 timestamp, for example 2026-09-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  fromDate?: string;

  @ApiPropertyOptional({
    description:
      'Inclusive ISO 8601 timestamp, for example 2026-09-05T23:59:59.999Z',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  toDate?: string;

  @ApiPropertyOptional({
    enum: TransactionHistorySortBy,
    default: TransactionHistorySortBy.CREATED_AT,
  })
  @IsOptional()
  @IsEnum(TransactionHistorySortBy)
  sortBy: TransactionHistorySortBy = TransactionHistorySortBy.CREATED_AT;

  @ApiPropertyOptional({ enum: SortOrder, default: SortOrder.DESC })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder: SortOrder = SortOrder.DESC;
}
