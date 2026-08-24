import { Module } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Wallet } from './entities/wallet.entity';
import { Transaction } from '../transaction/entities/transaction.entity';
import { WalletsController } from './wallet.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Wallet, Transaction])],
  controllers: [WalletsController],
  providers: [WalletService],
})
export class WalletModule {}
