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
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { DepositDto } from './dto/deposit.dto';
import { WalletService } from './wallet.service';
import { WithdrawDto } from './dto/withdraw.dto';
import { TransferDto } from './dto/transfer.dto';
import {
  GetTransactionsDto,
  SortOrder,
  TransactionHistorySortBy,
  TransactionHistoryType,
} from '../transaction/dto/get-transactions.dto';
import { TransactionHistoryResponseDto } from '../transaction/dto/transaction-history-response.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { WalletOwnerGuard } from '../auth/guards/wallet-owner.guard';
import { ParsePositiveIntPipe } from '../common/pipes/parse-positive-int.pipe';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../users/enums/role.enum';

@ApiTags('Wallets')
@Controller('wallets')
export class WalletsController {
  constructor(private readonly walletService: WalletService) {}

  @UseGuards(WalletOwnerGuard)
  @Post('deposit')
  @HttpCode(HttpStatus.OK)
  async deposit(@Body() dto: DepositDto) {
    const result = await this.walletService.deposit(dto);
    return {
      walletId: result?.wallet.id,
      newBalanceCents: result?.wallet.balanceCents,
      transactionId: result?.transaction.id,
      status: result?.transaction.status,
    };
  }

  @UseGuards(WalletOwnerGuard)
  @Post('withdraw')
  async withdraw(@Body() dto: WithdrawDto) {
    return this.walletService.withdraw(dto);
  }

  @UseGuards(WalletOwnerGuard)
  @Post('transfers')
  async transfer(@Body() dto: TransferDto) {
    return this.walletService.transfer(dto);
  }

  @ApiBearerAuth()
  @ApiOperation({
    summary: "Get the authenticated owner's wallet transaction history",
    description:
      'Filters, sorts, and paginates only transactions that belong to the requested wallet.',
  })
  @ApiParam({ name: 'id', type: Number, description: 'Wallet ID' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'type', required: false, enum: TransactionHistoryType })
  @ApiQuery({
    name: 'fromDate',
    required: false,
    type: String,
    format: 'date-time',
  })
  @ApiQuery({
    name: 'toDate',
    required: false,
    type: String,
    format: 'date-time',
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    enum: TransactionHistorySortBy,
  })
  @ApiQuery({ name: 'sortOrder', required: false, enum: SortOrder })
  @ApiOkResponse({
    description: 'Paginated transaction history.',
    type: TransactionHistoryResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Missing, invalid, or expired access token.',
  })
  @ApiBadRequestResponse({
    description: 'Invalid query parameters, wallet ID, or date range.',
  })
  @ApiForbiddenResponse({
    description: 'The authenticated user does not own this wallet.',
  })
  @ApiNotFoundResponse({ description: 'Wallet does not exist.' })
  @Get(':id/transactions')
  async getTransactions(
    @Param('id', ParsePositiveIntPipe) walletId: number,
    @Query() query: GetTransactionsDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.walletService.getTransactions(walletId, userId, query);
  }

  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Reconcile a wallet balance (administrator only)',
    description:
      'Compares the stored balance against completed ledger entries for operational investigation.',
  })
  @Roles(Role.ADMIN)
  @Get(':id/verify')
  async verify(@Param('id', ParsePositiveIntPipe) walletId: number) {
    return this.walletService.verifyBalance(walletId);
  }
}
