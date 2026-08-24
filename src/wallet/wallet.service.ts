import {
  BadRequestException,
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
import { DataSource, FindOptionsWhere, Repository } from 'typeorm';
import { Wallet } from './entities/wallet.entity';
import { WithdrawDto } from './dto/withdraw.dto';
import { from, windowWhen } from 'rxjs';
import { TransferDto } from './dto/transfer.dto';
import { Transfer } from '../transfer/entities/transfer.entity';
import { AppModule } from '../app.module';
import { GetTransactionsDto } from '../transaction/dto/get-transactions.dto';

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
        where: { idempotencyKey: dto.idempotencyKey },
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
      // Client sends the same request twice -> idempotencyKey;
      // finds a wallet and locks it for writing.
      // Deposit + withdraw happen simultaneously -> pessimistic_write lock
      // Wallet updates but transaction record fails -> Database transaction + rollback
      // Money calculation has decimals -> Store integer cents at dto level
      // Balance changes without explanation -> Create a Transaction record

      const wallet = await queryRunner.manager
        .createQueryBuilder(Wallet, 'wallet')
        .setLock('pessimistic_write')
        .where('wallet.id=:id', { id: dto.walletId })
        .getOne();
      if (!wallet) {
        throw new NotFoundException(`Wallet ${dto.walletId} not found`);
      }
      wallet.balance += dto.amountCents;
      wallet.version += 1; //version is a number used to track how many times a wallet has been changed.It's mainly for optimistic locking.
      await queryRunner.manager.save(wallet); //save the changes to the database.

      const transaction = queryRunner.manager.create(Transaction, {
        wallet: wallet,
        type: TransactionType.CREDIT,
        amount: dto.amountCents,
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
      await queryRunner.rollbackTransaction();
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
    await queryRunner.startTransaction();

    if (dto.idempotencyKey) {
      const existing = await queryRunner.manager.findOne(Transaction, {
        where: { idempotencyKey: dto.idempotencyKey },
      });

      if (existing) {
        await queryRunner.rollbackTransaction();
        return {
          wallet: existing.wallet,
          transactionId: existing.id,
          replayed: true,
        };
      }
    }
    try {
      const wallet = await queryRunner.manager.findOne(Wallet, {
        where: { id: dto.walletId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!wallet) {
        throw new NotFoundException('Wallet not found');
      }

      if (wallet.balance < dto.amount) {
        throw new BadRequestException('Insufficient funds');
      }

      wallet.balance -= dto.amount;
      await queryRunner.manager.save(wallet);

      const transaction = await queryRunner.manager.create(Transaction, {
        wallet: wallet,
        type: TransactionType.DEBIT,
        amount: dto.amount,
        status: TransactionStatus.COMPLETED,
      });

      await queryRunner.manager.save(transaction);
      await queryRunner.commitTransaction();
      return {
        walletId: wallet.id,
        newBalance: wallet.balance,
        transactionId: transaction.id,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
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

      const [firstId, secondId] = [dto.fromWalletId, dto.toWalletId].sort();
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

      if (fromWallet.balance < dto.amount) {
        throw new BadRequestException('Insufficient funds');
      }

      fromWallet.balance -= dto.amount;
      toWallet.balance += dto.amount;

      await queryRunner.manager.save([fromWallet, toWallet]);

      const transferRecord = queryRunner.manager.create(Transfer, {
        from_wallet: fromWallet,
        to_wallet: toWallet,
        status: 'COMPLETED',
        idempotencyKey: dto.idempotencyKey,
      });

      await queryRunner.manager.save(transferRecord);

      const debitTxn = queryRunner.manager.create(Transaction, {
        wallet: fromWallet,
        type: TransactionType.TRANSFER_OUT,
        amount: dto.amount,
        status: TransactionStatus.COMPLETED,
      });
      const creditTxn = queryRunner.manager.create(Transaction, {
        wallet: toWallet,
        type: TransactionType.TRANSFER_IN,
        amount: dto.amount,
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
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async getTransactions(walletId: number, query: GetTransactionsDto) {
    const wallet = await this.walletRepo.findOne({
      where: { id: walletId },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    const where: FindOptionsWhere<Transaction> = { wallet: { id: walletId } };
    if (query.type) {
      where.type = query.type as Transaction['type'];
    }

    const [transactions, total] = await this.transactionRepo.findAndCount({
      where,
      order: { created_at: 'DESC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });

    return {
      walletId,
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
      transactions,
    };
  }

  async verifyBalance(walletId: number) {
    const wallet = await this.walletRepo.findOne({ where: { id: walletId } });
    if (!wallet) throw new NotFoundException('Wallet not found');

    const result = await this.transactionRepo
      .createQueryBuilder('t')
      .select(
        `SUM(CASE WHEN t.type IN ('CREDIT', 'TRANSFER_IN') THEN t.amount
                WHEN t.type IN ('DEBIT', 'TRANSFER_OUT') THEN -t.amount
                ELSE 0 END)`,
        'computed',
      )
      .where('t.wallet_id = :walletId', { walletId })
      .andWhere('t.status = :status', { status: 'COMPLETED' })
      .getRawOne();

    const computedBalance = Number(result.computed ?? 0);

    return {
      storedBalance: wallet.balance,
      computedBalance,
      consistent: wallet.balance === computedBalance,
    };
  }
}
