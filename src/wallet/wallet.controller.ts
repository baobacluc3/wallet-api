// wallets.controller.ts
import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { DepositDto } from './dto/deposit.dto';
import { WalletService } from './wallet.service';

@Controller('wallets')
export class WalletsController {
  constructor(private readonly walletService: WalletService) {}

  @Post('deposit')
  @HttpCode(HttpStatus.OK)
  //Takes the request body and puts it into dto.
  async deposit(@Body() dto: DepositDto) {
    const result = await this.walletService.deposit(dto);
    return {
      walletId: result?.wallet.id,
      newBalanceCents: result?.wallet.balance,
      transactionId: result?.transaction.id,
      status: result?.transaction.status,
    };
  }
}
