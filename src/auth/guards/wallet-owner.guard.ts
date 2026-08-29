import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { Wallet } from '../../wallet/entities/wallet.entity';
import { InjectRepository } from '@nestjs/typeorm';

export class WalletOwnerGuard implements CanActivate {
  constructor(
    @InjectRepository(Wallet)
    private walletRepository: Repository<Wallet>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const walletId = request.params.id ?? request.params.walletId;
    const user = request.user;
    const wallet = await this.walletRepository.findOne({
      where: { id: walletId },
      select: {
        id: true,
        userId: true,
      },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    if (wallet.userId !== user.id) {
      throw new ForbiddenException('you do not own this wallet');
    }

    return true;
  }
}
