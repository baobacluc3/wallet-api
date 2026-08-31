import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { DepositDto } from './dto/deposit.dto';
import { WalletService } from './wallet.service';
import { WithdrawDto } from './dto/withdraw.dto';
import { TransferDto } from './dto/transfer.dto';
import { GetTransactionsDto } from '../transaction/dto/get-transactions.dto';
import { WalletOwnerGuard } from '../auth/guards/wallet-owner.guard';
import { WalletOwner } from '../auth/decorators/wallet-owner.decorator';
import { IdempotencyKey } from '../common/decorators/idempotency-key.decorator';
import { WalletIdPipe } from '../common/pipes/wallet-id.pipe';

@Controller('wallets')
export class WalletsController {
  constructor(private readonly walletService: WalletService) {}

  @Post('deposit')
  @HttpCode(HttpStatus.OK)
  @UseGuards(WalletOwnerGuard)
  @WalletOwner({ source: 'body', field: 'walletId' })
  async deposit(
    @Body() dto: DepositDto,
    @IdempotencyKey() idempotencyKey: string,
  ) {
    const result = await this.walletService.deposit({ ...dto, idempotencyKey });
    return {
      walletId: result?.wallet.id,
      newBalanceCents: result?.wallet.balance,
      transactionId: result?.transaction.id,
      status: result?.transaction.status,
    };
  }

  @Post('withdraw')
  @UseGuards(WalletOwnerGuard)
  @WalletOwner({ source: 'body', field: 'walletId' })
  async withdraw(
    @Body() dto: WithdrawDto,
    @IdempotencyKey() idempotencyKey: string,
  ) {
    return this.walletService.withdraw({ ...dto, idempotencyKey });
  }

  @Post('transfers')
  @UseGuards(WalletOwnerGuard)
  @WalletOwner({ source: 'body', field: 'fromWalletId' })
  async transfer(
    @Body() dto: TransferDto,
    @IdempotencyKey() idempotencyKey: string,
  ) {
    return this.walletService.transfer({ ...dto, idempotencyKey });
  }

  @Get(':id/transactions')
  @UseGuards(WalletOwnerGuard)
  async getTransactions(
    @Param('id', WalletIdPipe) walletId: number,
    @Query() query: GetTransactionsDto,
  ) {
    return this.walletService.getTransactions(walletId, query);
  }

  @Get(':id/verify')
  @UseGuards(WalletOwnerGuard)
  async verify(@Param('id', WalletIdPipe) walletId: number) {
    return this.walletService.verifyBalance(walletId);
  }
}
