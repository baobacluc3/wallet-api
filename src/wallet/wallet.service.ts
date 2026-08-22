import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DepositDto } from './dto/deposit.dto';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Transaction,
  TransactionStatus,
  TransactionType,
} from '../transaction/entities/transaction.entity';
import { DataSource, Repository } from 'typeorm';
import { Wallet } from './entities/wallet.entity';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
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
}
