import { DepositDto } from './dto/deposit.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Wallet1 } from './entities/wallet1.entity';
import {
  Status,
  Transaction1,
  Type,
} from '../transaction/entities/transaction1.entity';

export class WalletsService {
  constructor(
    @InjectRepository(Wallet1)
    private readonly walletRepository: Repository<Wallet1>,
    @InjectRepository(Transaction1)
    private readonly transactionRepository: Repository<Transaction1>,
  ) {}

  async deposit(dto: DepositDto) {
    const wallet = await this.walletRepository.findOne({
      where: { id: dto.walletId },
    });
    if (!wallet) {
      throw new NotFoundException(`Wallet with ID ${dto.walletId} not found.`);
    }

    this.assertPositiveAmount(dto);

    const amount = BigInt(dto.amountCents)
    const balance_before = wallet.balance;
    wallet.balance += amount;
    const savedWallet =  await this.walletRepository.save(wallet);

    const transaction = this.transactionRepository.create({
      wallet: savedWallet,
      amount,
      balance_before:balance_before,
      balance_after:savedWallet.balance,
      type:Type.DEPOSIT,
      status:Status.SUCCESS,
    })
    const savedTransaction = await this.transactionRepository.save(transaction);
    return savedTransaction.balance_after;
  }

  assertPositiveAmount(dto: DepositDto) {
    const amount = BigInt(dto.amountCents);
    if (amount <= 0) {
      throw new BadRequestException(`Amount must be greater than 0`);
    }
  }
}
