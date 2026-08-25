import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import { DepositDto } from './dto/deposit.dto';
import { WalletService } from './wallet.service';
import { WithdrawDto } from './dto/withdraw.dto';
import { TransferDto } from './dto/transfer.dto';
import { GetTransactionsDto } from '../transaction/dto/get-transactions.dto';

@Controller('wallets')
export class WalletsController {
  constructor(private readonly walletService: WalletService) {}

  @Post('deposit')
  @HttpCode(HttpStatus.OK)
  async deposit(@Body() dto: DepositDto) {
    const result = await this.walletService.deposit(dto);
    return {
      walletId: result?.wallet.id,
      newBalanceCents: result?.wallet.balance,
      transactionId: result?.transaction.id,
      status: result?.transaction.status,
    };
  }

  @Post('withdraw')
  async withdraw(@Body() dto: WithdrawDto) {
    return this.walletService.withdraw(dto);
  }

  @Post('transfers')
  async transfer(@Body() dto: TransferDto) {
    return this.walletService.transfer(dto);
  }

  @Get(':id/transactions')
  async getTransactions(
    @Param('id') walletId: number,
    @Query() query: GetTransactionsDto,
  ) {
    return this.walletService.getTransactions(walletId, query);
  }

  @Get(':id/verify')
  async verify(@Param('id') walletId: number) {
    return this.walletService.verifyBalance(walletId);
  }
}
