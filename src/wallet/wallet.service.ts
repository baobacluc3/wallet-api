import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DepositDto } from './dto/deposit.dto';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Transaction,
  TransactionStatus,
  TransactionType,
} from '../transaction/entities/transaction.entity';
import { DataSource, Repository } from 'typeorm';
import { Wallet } from './entities/wallet.entity';
import { WithdrawDto } from './dto/withdraw.dto';
import { TransferDto } from './dto/transfer.dto';
import { Transfer, TransferStatus } from '../transfer/entities/transfer.entity';
import { GetTransactionsDto } from '../transaction/dto/get-transactions.dto';
import {
  SortOrder,
  TransactionHistorySortBy,
  TransactionHistoryType,
} from '../transaction/dto/get-transactions.dto';
import { TransactionHistoryResponseDto } from '../transaction/dto/transaction-history-response.dto';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,

    private dataSource: DataSource,
  ) {}

  async deposit(dto: DepositDto) {
    if (dto.idempotencyKey) {
      const existing = await this.transactionRepo.findOne({
        where: { walletId: dto.walletId, idempotencyKey: dto.idempotencyKey },
        relations: { wallet: true }, //When find the Transaction, also load its related Wallet
      });
      if (existing) {
        this.logger.warn(`Idempotent replay detected: ${dto.idempotencyKey}`);
        return { transaction: existing, wallet: existing.wallet };
      }
    }
    return this.executeDeposit(dto);
  }

  private async executeDeposit(dto: DepositDto) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('READ COMMITTED');

    try {
      const wallet = await queryRunner.manager
        .createQueryBuilder(Wallet, 'wallet')
        .setLock('pessimistic_write')
        .where('wallet.id=:id', { id: dto.walletId })
        .getOne();
      if (!wallet) {
        throw new NotFoundException(`Wallet ${dto.walletId} not found`);
      }
      const balanceBeforeCents = wallet.balanceCents;
      wallet.balanceCents += dto.amountCents;
      await queryRunner.manager.save(wallet);

      const transaction = queryRunner.manager.create(Transaction, {
        wallet,
        walletId: wallet.id,
        type: TransactionType.CREDIT,
        amountCents: dto.amountCents,
        balanceBeforeCents,
        balanceAfterCents: wallet.balanceCents,
        status: TransactionStatus.COMPLETED,
        referenceId: dto.referenceId ?? null,
        idempotencyKey: dto.idempotencyKey ?? null,
      });
      const savedTransaction = await queryRunner.manager.save(transaction);

      await queryRunner.commitTransaction();
      this.logger.log(
        `Deposit completed: wallet=${wallet.id} amount=${dto.amountCents} tx=${transaction.id}`,
      );
      return { wallet, transaction: savedTransaction };
    } catch (error) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }

      // The database's partial unique index is the final idempotency guard.
      // A concurrent request that loses this race returns the first result.
      if (dto.idempotencyKey && this.isUniqueConstraintError(error)) {
        const existing = await this.transactionRepo.findOne({
          where: {
            walletId: dto.walletId,
            idempotencyKey: dto.idempotencyKey,
          },
          relations: { wallet: true },
        });
        if (existing) {
          return { wallet: existing.wallet, transaction: existing };
        }
      }
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Deposit failed for wallet ${dto.walletId}: ${message}`,
      );
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async withdraw(dto: WithdrawDto) {
    const queryRunner = this.dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction('READ COMMITTED');

    try {
      // 1. Check idempotency
      if (dto.idempotencyKey) {
        const existing = await queryRunner.manager.findOne(Transaction, {
          where: {
            walletId: dto.walletId,
            idempotencyKey: dto.idempotencyKey,
          },
          relations: { wallet: true },
        });

        if (existing) {
          await queryRunner.rollbackTransaction();

          return {
            walletId: existing.wallet.id,
            transactionId: existing.id,
            replayed: true,
          };
        }
      }

      // 2. Lock wallet
      const wallet = await queryRunner.manager.findOne(Wallet, {
        where: { id: dto.walletId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!wallet) {
        throw new NotFoundException('Wallet not found');
      }

      // 3. Check balance
      if (wallet.balanceCents < dto.amount) {
        throw new BadRequestException('Insufficient funds');
      }

      // 4. Update balance
      const balanceBeforeCents = wallet.balanceCents;
      wallet.balanceCents -= dto.amount;

      await queryRunner.manager.save(wallet);

      // 5. Create transaction record
      const transaction = queryRunner.manager.create(Transaction, {
        wallet,
        walletId: wallet.id,
        type: TransactionType.DEBIT,
        amountCents: dto.amount,
        balanceBeforeCents,
        balanceAfterCents: wallet.balanceCents,
        status: TransactionStatus.COMPLETED,
        idempotencyKey: dto.idempotencyKey ?? null,
      });

      await queryRunner.manager.save(transaction);

      // 6. Commit
      await queryRunner.commitTransaction();

      return {
        walletId: wallet.id,
        newBalanceCents: wallet.balanceCents,
        transactionId: transaction.id,
        replayed: false,
      };
    } catch (error) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      if (dto.idempotencyKey && this.isUniqueConstraintError(error)) {
        const existing = await this.transactionRepo.findOne({
          where: {
            walletId: dto.walletId,
            idempotencyKey: dto.idempotencyKey,
          },
          relations: { wallet: true },
        });
        if (existing) {
          return {
            walletId: existing.wallet.id,
            transactionId: existing.id,
            replayed: true,
          };
        }
      }
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async transfer(dto: TransferDto) {
    if (dto.fromWalletId === dto.toWalletId) {
      throw new BadRequestException('CAN NOT TRANSFER THE SAME WALLET');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const existing = await queryRunner.manager.findOne(Transfer, {
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (existing) {
        await queryRunner.rollbackTransaction();
        return {
          transferId: existing.id,
          status: existing.status,
          replayed: true,
        };
      }

      // Lock wallets in numeric order so opposing transfers cannot deadlock.
      const [firstId, secondId] = [dto.fromWalletId, dto.toWalletId].sort(
        (left, right) => left - right,
      );
      const firstWallet = await queryRunner.manager.findOne(Wallet, {
        where: { id: firstId },
        lock: { mode: 'pessimistic_write' },
      });

      const secondWallet = await queryRunner.manager.findOne(Wallet, {
        where: { id: secondId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!firstWallet || !secondWallet) {
        throw new NotFoundException('One or both wallets not found');
      }

      const fromWallet =
        dto.fromWalletId === firstWallet.id ? firstWallet : secondWallet;

      const toWallet =
        dto.toWalletId === firstWallet.id ? firstWallet : secondWallet;

      if (fromWallet.currency !== toWallet.currency) {
        throw new BadRequestException(
          'Currency mismatch — no conversion supported',
        );
      }

      if (fromWallet.balanceCents < dto.amount) {
        throw new BadRequestException('Insufficient funds');
      }

      const fromBalanceBeforeCents = fromWallet.balanceCents;
      const toBalanceBeforeCents = toWallet.balanceCents;
      fromWallet.balanceCents -= dto.amount;
      toWallet.balanceCents += dto.amount;

      await queryRunner.manager.save([fromWallet, toWallet]);

      const transferRecord = queryRunner.manager.create(Transfer, {
        fromWallet,
        fromWalletId: fromWallet.id,
        toWallet,
        toWalletId: toWallet.id,
        amountCents: dto.amount,
        status: TransferStatus.COMPLETED,
        idempotencyKey: dto.idempotencyKey,
        reference: null,
      });

      await queryRunner.manager.save(transferRecord);

      const debitTxn = queryRunner.manager.create(Transaction, {
        wallet: fromWallet,
        walletId: fromWallet.id,
        transfer: transferRecord,
        transferId: transferRecord.id,
        type: TransactionType.TRANSFER_OUT,
        amountCents: dto.amount,
        balanceBeforeCents: fromBalanceBeforeCents,
        balanceAfterCents: fromWallet.balanceCents,
        status: TransactionStatus.COMPLETED,
      });
      const creditTxn = queryRunner.manager.create(Transaction, {
        wallet: toWallet,
        walletId: toWallet.id,
        transfer: transferRecord,
        transferId: transferRecord.id,
        type: TransactionType.TRANSFER_IN,
        amountCents: dto.amount,
        balanceBeforeCents: toBalanceBeforeCents,
        balanceAfterCents: toWallet.balanceCents,
        status: TransactionStatus.COMPLETED,
      });

      await queryRunner.manager.save([debitTxn, creditTxn]);

      await queryRunner.commitTransaction();

      return {
        transferId: transferRecord.id,
        fromWalletId: fromWallet.id,
        toWalletId: toWallet.id,
        amount: dto.amount,
        status: 'COMPLETED',
      };
    } catch (error) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      if (this.isUniqueConstraintError(error)) {
        const existing = await this.dataSource.getRepository(Transfer).findOne({
          where: { idempotencyKey: dto.idempotencyKey },
        });
        if (existing) {
          return {
            transferId: existing.id,
            status: existing.status,
            replayed: true,
          };
        }
      }
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async getTransactions(
    walletId: number,
    userId: number,
    query: GetTransactionsDto,
  ): Promise<TransactionHistoryResponseDto> {
    if (!Number.isSafeInteger(walletId) || walletId < 1) {
      throw new BadRequestException('Wallet ID must be a positive integer');
    }

    const wallet = await this.walletRepo.findOne({
      where: { id: walletId },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    // The wallet must be loaded before the query so consumers receive a clear
    // 404 for an unknown wallet and a 403 for a wallet owned by somebody else.
    if (wallet.userId !== userId) {
      throw new ForbiddenException('You do not own this wallet');
    }

    const fromDate = query.fromDate ? new Date(query.fromDate) : undefined;
    const toDate = query.toDate ? new Date(query.toDate) : undefined;
    if (
      (fromDate && Number.isNaN(fromDate.getTime())) ||
      (toDate && Number.isNaN(toDate.getTime()))
    ) {
      throw new BadRequestException('Dates must be valid ISO 8601 timestamps');
    }
    if (fromDate && toDate && fromDate > toDate) {
      throw new BadRequestException(
        'fromDate must be before or equal to toDate',
      );
    }

    const transactionTypes: Record<TransactionHistoryType, TransactionType[]> =
      {
        [TransactionHistoryType.DEPOSIT]: [TransactionType.CREDIT],
        [TransactionHistoryType.WITHDRAW]: [TransactionType.DEBIT],
        [TransactionHistoryType.TRANSFER]: [
          TransactionType.TRANSFER_IN,
          TransactionType.TRANSFER_OUT,
        ],
      };
    const sortFields: Record<TransactionHistorySortBy, string> = {
      [TransactionHistorySortBy.CREATED_AT]: 'transaction.created_at',
      [TransactionHistorySortBy.AMOUNT]: 'transaction.amount_cents',
    };

    const transactionQuery = this.transactionRepo
      .createQueryBuilder('transaction')
      .where('transaction.wallet_id = :walletId', { walletId });

    if (query.type) {
      transactionQuery.andWhere('transaction.type IN (:...types)', {
        types: transactionTypes[query.type],
      });
    }
    if (fromDate) {
      transactionQuery.andWhere('transaction.created_at >= :fromDate', {
        fromDate,
      });
    }
    if (toDate) {
      transactionQuery.andWhere('transaction.created_at <= :toDate', {
        toDate,
      });
    }

    const [transactions, total] = await transactionQuery
      .orderBy(
        sortFields[query.sortBy],
        query.sortOrder.toUpperCase() as 'ASC' | 'DESC',
      )
      // A stable secondary order prevents duplicate/missing records between pages.
      .addOrderBy('transaction.id', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();

    return {
      data: transactions,
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async verifyBalance(walletId: number) {
    const wallet = await this.walletRepo.findOne({ where: { id: walletId } });
    if (!wallet) throw new NotFoundException('Wallet not found');

    const result = await this.transactionRepo
      .createQueryBuilder('t')
      .select(
        `SUM(CASE WHEN t.type IN ('CREDIT', 'TRANSFER_IN') THEN t.amount_cents
                WHEN t.type IN ('DEBIT', 'TRANSFER_OUT') THEN -t.amount_cents
                ELSE 0 END)`,
        'computed',
      )
      .where('t.wallet_id = :walletId', { walletId })
      .andWhere('t.status = :status', { status: 'COMPLETED' })
      .getRawOne();

    const computedBalance = Number(result.computed ?? 0);

    return {
      storedBalanceCents: wallet.balanceCents,
      computedBalance,
      consistent: wallet.balanceCents === computedBalance,
    };
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === '23505'
    );
  }
}
