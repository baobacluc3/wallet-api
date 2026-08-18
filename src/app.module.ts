import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { WalletModule } from './wallet/wallet.module';
import { TransactionModule } from './transaction/transaction.module';
import { TransferModule } from './transfer/transfer.module';

@Module({
  imports: [UsersModule, WalletModule, TransactionModule, TransferModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
