import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Wallet } from '../wallet/entities/wallet.entity';

@Injectable()
export class TransactionService {
  constructor(private readonly datasource: DataSource) {}

  async transfer(from_wallet_id: number, to_wallet_id: number, amount) {
    const queryRunner = this.datasource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const fromWallet = await queryRunner.manager.findOne(Wallet, {
        where: { id: from_wallet_id },
      });
      const toWallet = await queryRunner.manager.findOne(Wallet, {
        where: { id: to_wallet_id },
      });

      if (!fromWallet || !toWallet) throw new Error('wallet not found');
      if (fromWallet.balanceCents < amount) {
        throw new Error('Insufficient balance');
      }
      fromWallet.balanceCents -= amount;
      toWallet.balanceCents += amount;

      await queryRunner.manager.save(fromWallet);
      await queryRunner.manager.save(toWallet);

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
    } finally {
      await queryRunner.release();
    }
  }
}
