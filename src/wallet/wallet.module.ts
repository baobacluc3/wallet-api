import { Module } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Wallet } from './entities/wallet.entity';
import { Transaction } from '../transaction/entities/transaction.entity';
import { Transfer } from '../transfer/entities/transfer.entity';
import { WalletsController } from './wallet.controller';
import { WalletOwnerGuard } from '../auth/guards/wallet-owner.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Wallet, Transaction, Transfer])],
  controllers: [WalletsController],
  providers: [WalletService, WalletOwnerGuard],
})
export class WalletModule {}
