import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { Wallet } from '../../wallet/entities/wallet.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Reflector } from '@nestjs/core';
import {
  WALLET_OWNER_KEY,
  WalletOwnerOptions,
} from '../decorators/wallet-owner.decorator';

@Injectable()
export class WalletOwnerGuard implements CanActivate {
  constructor(
    @InjectRepository(Wallet)
    private walletRepository: Repository<Wallet>,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Problem: an authenticated user could otherwise move money from, or inspect, another user's wallet.
    // Why here: ownership is authorization metadata, so it belongs before any wallet controller/service runs.
    // Nest executes guards after middleware and before interceptors, pipes, and the controller method.
    const request = context.switchToHttp().getRequest();
    const options = this.reflector.getAllAndOverride<WalletOwnerOptions>(
      WALLET_OWNER_KEY,
      [context.getHandler(), context.getClass()],
    ) ?? { source: 'params', field: 'id' };
    const walletId = Number(request[options.source]?.[options.field]);
    const user = request.user;
    if (!Number.isSafeInteger(walletId) || walletId < 1) {
      throw new NotFoundException('Wallet not found');
    }
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

    if (wallet.userId !== user?.id) {
      throw new ForbiddenException('You do not own this wallet');
    }

    return true;
  }
}
