import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import {
  Transaction,
  TransactionType,
} from '../transaction/entities/transaction.entity';
import {
  SortOrder,
  TransactionHistorySortBy,
  TransactionHistoryType,
} from '../transaction/dto/get-transactions.dto';
import { Wallet } from './entities/wallet.entity';
import { WalletService } from './wallet.service';

describe('WalletService.getTransactions', () => {
  let service: WalletService;
  let findWallet: jest.Mock;
  let getManyAndCount: jest.Mock;
  let queryBuilder: {
    where: jest.Mock;
    andWhere: jest.Mock;
    orderBy: jest.Mock;
    addOrderBy: jest.Mock;
    skip: jest.Mock;
    take: jest.Mock;
    getManyAndCount: jest.Mock;
  };

  beforeEach(() => {
    findWallet = jest.fn();
    getManyAndCount = jest.fn();
    queryBuilder = {
      where: jest.fn(),
      andWhere: jest.fn(),
      orderBy: jest.fn(),
      addOrderBy: jest.fn(),
      skip: jest.fn(),
      take: jest.fn(),
      getManyAndCount,
    };
    Object.values(queryBuilder)
      .filter((method) => method !== getManyAndCount)
      .forEach((method) => method.mockReturnValue(queryBuilder));

    service = new WalletService(
      {
        createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      } as unknown as Repository<Transaction>,
      { findOne: findWallet } as unknown as Repository<Wallet>,
      {} as DataSource,
    );
  });

  it("returns the owner's filtered, sorted, paginated history", async () => {
    const transaction = {
      id: 8,
      type: TransactionType.TRANSFER_OUT,
    } as Transaction;
    findWallet.mockResolvedValue({ id: 4, userId: 20 });
    getManyAndCount.mockResolvedValue([[transaction], 21]);

    await expect(
      service.getTransactions(4, 20, {
        page: 2,
        limit: 10,
        type: TransactionHistoryType.TRANSFER,
        fromDate: '2026-09-01T00:00:00.000Z',
        toDate: '2026-09-05T23:59:59.999Z',
        sortBy: TransactionHistorySortBy.AMOUNT,
        sortOrder: SortOrder.ASC,
      }),
    ).resolves.toEqual({
      data: [transaction],
      meta: { total: 21, page: 2, limit: 10, totalPages: 3 },
    });

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'transaction.type IN (:...types)',
      { types: [TransactionType.TRANSFER_IN, TransactionType.TRANSFER_OUT] },
    );
    expect(queryBuilder.orderBy).toHaveBeenCalledWith(
      'transaction.amount_cents',
      'ASC',
    );
    expect(queryBuilder.skip).toHaveBeenCalledWith(10);
    expect(queryBuilder.take).toHaveBeenCalledWith(10);
  });

  it('rejects an unknown wallet', async () => {
    findWallet.mockResolvedValue(null);

    await expect(
      service.getTransactions(4, 20, {
        page: 1,
        limit: 20,
        sortBy: TransactionHistorySortBy.CREATED_AT,
        sortOrder: SortOrder.DESC,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a wallet owned by another user before querying transactions', async () => {
    findWallet.mockResolvedValue({ id: 4, userId: 21 });

    await expect(
      service.getTransactions(4, 20, {
        page: 1,
        limit: 20,
        sortBy: TransactionHistorySortBy.CREATED_AT,
        sortOrder: SortOrder.DESC,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects an inverted date range', async () => {
    findWallet.mockResolvedValue({ id: 4, userId: 20 });

    await expect(
      service.getTransactions(4, 20, {
        page: 1,
        limit: 20,
        fromDate: '2026-09-05T00:00:00.000Z',
        toDate: '2026-09-01T00:00:00.000Z',
        sortBy: TransactionHistorySortBy.CREATED_AT,
        sortOrder: SortOrder.DESC,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
